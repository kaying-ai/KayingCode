# TapTap 日报 Linux 部署规范

## 1. 运行时目录

所有 bot 统一放在 `kaying-bot` 下，本服务使用 `kaying-taptap-daily`：

```text
/opt/kaying-bot/kaying-taptap-daily/           程序、tools、workflow、脚本
/srv/kaying-bot/kaying-taptap-daily/           工作区、数据、报告、运行记录
/etc/kaying-bot/kaying-taptap-daily/report.env 环境变量，权限 0600
/run/kaying-bot/kaying-taptap-daily/           锁与运行时状态
```

工作区：

```text
/srv/kaying-bot/kaying-taptap-daily/workspace/
  .kayingcode/workflows/taptap-daily.dwf.ts
  tools/taptap-daily/{collector.mjs,metrics.mjs,renderer.mjs}
  data/daily/<date>/{snapshot.json,metrics.json,raw/}
  data/daily/<date>/import/                    人工兜底
  reports/<date>/{report.md,report.html,report.json,index.html}
  reports/index.html
  runs/<date>/{stream.jsonl,stderr.log,run.json}
```

## 2. 调度

systemd 单元：

- `kaying-bot-taptap-daily.timer`：`OnCalendar=*-*-* 09:00:00 Asia/Shanghai`，`Persistent=true`。
- `kaying-bot-taptap-daily.service`：`Type=oneshot`，执行 `/opt/kaying-bot/kaying-taptap-daily/run-report.sh`。

如果发行版 systemd 不支持时区后缀，把服务器时区固定为 `Asia/Shanghai`，并使用不带时区的 `OnCalendar=*-*-* 09:00:00`；部署时用 `systemd-analyze calendar` 验证下一次触发时间。

## 3. 运行链

```text
timer
  → service (oneshot)
    → run-report.sh
      ├─ flock 防重入
      ├─ 幂等检查（同日已有成功报告则退出 0）
      ├─ timeout 硬超时
      ├─ kayingcode --workflow-mode alwaysOn --mode build -p "/taptap-daily <date>"
      ├─ validate-run.mjs（schema、章节、hash、占位符、质量）
      ├─ 原子更新 latest/index
      ├─ publish-report.mjs（飞书摘要，失败只告警）
      └─ run.json + status.json
```

权限：

- 专用非 root 用户 `taptap`，只允许写 `/srv/kaying-bot/kaying-taptap-daily` 与 `/run/kaying-bot/kaying-taptap-daily`。
- 先使用 `--mode build` 验证：headless 下需要审批的工具走 deny broker，workflow actor 不能随意写工作区外文件；如果确认 `world.run` 无法运行，再评估隔离容器内的 `yolo`，不能默认放宽。
- `KillMode=control-group` 清理 Chromium/Node 子进程。

### 3.1 出口被 TapTap WAF 拦截时

报告服务器出口被 TapTap WAF 返回 405 时，优先使用配套 Cloudflare Worker 代理：

```sh
TAPTAP_DAILY_SOURCE=http
TAPTAP_PROXY_BASE_URL=https://taptap-proxy.opentaptap.dev
TAPTAP_PROXY_TOKEN=<与 Worker secret 一致>
```

- Worker 部署与安全边界见 `apps/kaying-taptap-proxy/spec/proxy.md`。
- 必须使用可从报告服务器访问的自定义域名；`workers.dev` 在大陆可能被 DNS 污染，不作为生产入口。
- `TAPTAP_PROXY_TOKEN` 只放在 `report.env`（0640 root:taptap），不写入仓库、日志或报告。
- Worker 不可用时，切回 `TAPTAP_DAILY_SOURCE=import`，用 `deploy/collect-and-upload.sh` 在可访问 TapTap 的机器上采集并上传。

## 4. 产物与保留

- 报告：保留 365 天（默认），`reports/index.html` 自动重建。
- snapshot/metrics：保留 365 天，用于排名变化和 30 日窗口。
- raw 响应：保留 90 天；只用于审计，不通过 nginx 暴露。
- 运行日志：`runs/<date>/` 保留 90 天；同时输出 systemd journal。
- 同一日期重跑默认跳过，`--force` 覆盖。

## 5. 分发

- nginx 静态根：`/srv/kaying-bot/kaying-taptap-daily/reports/`。
- URL 前缀：`/kaying-bot/kaying-taptap-daily/`。
- 默认只读；启用 basic auth 或限制内网/Tailscale；不暴露 raw/data 目录。
- 飞书：`publish-report.mjs` 读取 `report.json`，发送摘要卡片与报告链接；支持可选签名。webhook 失败不回滚报告，只记录警告并触发告警。

## 6. 监控与告警

`run.json` 至少包含：

```json
{
  "reportDate": "2026-11-16",
  "startedAt": "...",
  "finishedAt": "...",
  "status": "success|degraded|failed|skipped",
  "exitCode": 0,
  "durationMs": 0,
  "workflowRunId": "...",
  "snapshotHash": "...",
  "warnings": [],
  "reportUrl": "..."
}
```

- `healthcheck.sh`：最近一次成功超过 26 小时、`status.json` 缺失或报告文件缺失时退出 1。
- systemd `OnFailure` 或独立 health timer 发送飞书/企业微信告警。
- 告警内容包含最近 50 行 stderr 与 `run.json` 路径；不输出凭据。

## 7. 人工兜底

1. 在 `data/daily/<date>/import/` 放 `boards.json`/`boards.csv` 与 `calendar.json`/`calendar.csv`。
2. 执行 `REPORT_DATE=<date> run-report.sh --force --source import`。
3. 报告 `source.kind=import` 会显示在头部；不得把它伪装成网页采集结果。

## 8. 安全

- 不保存 TapTap 登录态、Cookie 或用户凭据。
- 模型密钥、飞书 webhook、签名密钥只放 `/etc/kaying-bot/kaying-taptap-daily/report.env`，权限 0600。
- 日志脱敏；报告不包含个人信息。
- 采集频率每日一次，遵守 TapTap 公开页面/接口的使用边界；接口或条款变化时停止采集并切换人工导入。
