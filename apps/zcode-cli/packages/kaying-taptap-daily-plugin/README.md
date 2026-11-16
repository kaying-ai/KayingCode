# kaying-taptap-daily

TapTap 游戏日报插件：采集公开三榜与游戏日历，计算新游/赛道指标，使用动态工作流的子代理做解读与核验，输出固定结构的 Markdown/HTML/JSON 日报。

## 目录

```text
spec/                  产品、数据源、部署规范
skills/taptap-daily-report/  运行与口径说明
commands/taptap-daily.md     手动/补跑入口
workflows/taptap-daily.dwf.ts  动态工作流
src/collector/         三榜与日历采集、标准化
src/metrics/           榜单变化、新游窗口、赛道供给、拥挤度
src/renderer/          固定模板渲染
deploy/                Linux systemd/nginx/飞书/校验脚本
scripts/               构建与部署包
test/                  单元与黄金测试
```

## 开发

```sh
pnpm install
pnpm --filter @kayingcode/kaying-taptap-daily-plugin run typecheck
pnpm --filter @kayingcode/kaying-taptap-daily-plugin run test
pnpm --filter @kayingcode/kaying-taptap-daily-plugin run build
pnpm --filter @kayingcode/kaying-taptap-daily-plugin run bundle
```

## 数据源

- 三榜：`/webapiv2/app-top/v2/hits?type_name=hot|reserve|pop`，Top50。
- 游戏日历：`/webapiv2/calendar/v1/event-list?day=<UTC 零点时间戳>`。
- 请求需要 `X-UA` 查询参数；采集器每次运行生成 UID，限速 350ms，失败重试。
- 接口是 TapTap Web 站内部接口，不是稳定开放平台 API；字段变化时用 fixture 和解析阈值暴露。

## 工作流

`workflows/taptap-daily.dwf.ts` 的固定阶段：

1. collector 采集。
2. metrics 计算。
3. 新游 + 三榜子代理分析。
4. 赛道子代理分析。
5. 独立 verifier 逐条核验。
6. writer 生成摘要与机会风险。
7. renderer 渲染并发布 artifact。

所有数字来自 `snapshot.json` / `metrics.json`；模型只写解读，且必须引用 `evidenceId`。

## 部署

见 [Linux 部署文档](../../../../docs/deploy/kayingcode-taptap-daily.md)。

## 规范

- [产品规范](spec/daily-report.md)
- [数据源规范](spec/data-sources.md)
- [部署规范](spec/deployment.md)
