# kaying-taptap-daily Linux 部署

TapTap 游戏日报服务：每天 09:00（Asia/Shanghai）用 KayingCode headless CLI 运行动态工作流，采集 TapTap 公开三榜与游戏日历，生成 Markdown/HTML/JSON 日报，并由 nginx 提供历史页、飞书推送摘要。

> 应用目录：`apps/zcode-cli/packages/kaying-taptap-daily-plugin`
> 包名：`@kayingcode/kaying-taptap-daily-plugin`
> 插件名：`kaying-taptap-daily`
> 返回 [部署汇总](../deploy.md)

## 1. 架构

```text
systemd timer 09:00 Asia/Shanghai
  └─ kaying-bot-taptap-daily.service
       └─ /opt/kaying-bot/kaying-taptap-daily/run-report.sh
            └─ kayingcode --workflow-mode alwaysOn --mode build -p "<workflow prompt>"
                 └─ CreateWorkflow(saved: taptap-daily)
                      ├─ collector  → snapshot.json + raw evidence
                      ├─ metrics    → metrics.json
                      ├─ subagents  → 新游/榜单/赛道分析
                      ├─ verifiers  → 逐条证据核验
                      ├─ writer     → 摘要与机会风险
                      └─ renderer   → report.md / report.html / report.json
            └─ validate-run.mjs → runs/<date>/run.json
            └─ publish-report.mjs → 飞书摘要
```

数据源与口径：

- 三榜：`/webapiv2/app-top/v2/hits` 的 `hot` / `reserve` / `pop`，各 Top50。
- 新游/发布事件：`/webapiv2/calendar/v1/event-list?day=<timestamp>`，最近 30 天。
- 题材：固定 12 个赛道，按 TapTap 标签多标签归并。
- 详细字段、窗口、合规边界见 `apps/zcode-cli/packages/kaying-taptap-daily-plugin/spec/data-sources.md`。

## 2. 前置条件

- Linux（Ubuntu 22.04/24.04 x64 或同等 systemd 发行版），能访问 `www.taptap.cn` 和模型 Provider。
- Node 24.14.0（或使用 KayingCode SEA 产物）。
- 安装好的 `kayingcode` CLI，且包含 `kaying-taptap-daily` 插件；如果 CLI 里没有该插件，部署包会安装本地插件副本。
- 已配置 KayingCode 模型 Provider（参考 [CLI 部署](kayingcode-cli.md)）；`report.env` 不放模型密钥。
- 可选：nginx、飞书自定义机器人 webhook。

## 3. 构建部署包

在仓库根：

```sh
pnpm install
pnpm --filter @kayingcode/kaying-taptap-daily-plugin run typecheck
pnpm --filter @kayingcode/kaying-taptap-daily-plugin run test
pnpm --filter @kayingcode/kaying-taptap-daily-plugin run bundle
```

产物：

```text
apps/zcode-cli/packages/kaying-taptap-daily-plugin/dist-deploy/
  kaying-taptap-daily-<version>/
  kaying-taptap-daily-<version>.tar.gz
```

同时准备目标版本的 CLI：`pnpm run build:kayingcode --base-url <你的下载地址>`，或使用官方发布包。CLI 版本必须包含本插件；否则安装脚本会使用部署包内的 `plugin/` 安装本地副本。

## 4. 安装

```sh
tar -xzf kaying-taptap-daily-<version>.tar.gz
sudo ./kaying-taptap-daily-<version>/install.sh
# 配置好 report.env 后再启用定时器：
sudo ./kaying-taptap-daily-<version>/install.sh --enable
```

安装脚本会：

- 创建系统用户 `taptap`（可用 `SERVICE_USER=` 覆盖）。
- 写入运行时目录：

```text
/opt/kaying-bot/kaying-taptap-daily/           程序与脚本
/srv/kaying-bot/kaying-taptap-daily/workspace/  工作区、数据、报告、运行日志
/etc/kaying-bot/kaying-taptap-daily/report.env  环境变量（0640 root:taptap）
/run/kaying-bot/kaying-taptap-daily/            锁与运行时状态
```

- 复制 `collector.mjs`、`metrics.mjs`、`renderer.mjs` 到 `workspace/tools/taptap-daily/`。
- 复制 workflow 到 `workspace/.kayingcode/workflows/taptap-daily.dwf.ts`。
- 启用插件（写入 `.kayingcode/cli/config.json` 的 `plugins.enabledPlugins`）。
- 在官方插件缓存缺失时安装本地插件副本，并写入 `installed_plugins.json`。
- 安装并 `daemon-reload` 四个 systemd 单元。

### 4.1 最小 Node bundle 运行资产

如果目标机不使用 `build:kayingcode` 的完整发行包（例如 SEA 缺少 `@zcode/tui`），可以直接部署 Node bundle。报告服务只走 headless `-p`，不加载 TUI，因此不需要 `@zcode/tui`，但必须同时提供：

```text
/opt/kayingcode/node/                          Node 24.14.0
/opt/kayingcode/kayingcode.cjs                 CLI bundle
/opt/kayingcode/provider/kayingcode-builtin.json
/opt/kayingcode/packages/bundled-skills/       dynamic-workflows 等内置技能
/opt/kayingcode/bin/kayingcode                 启动包装器
```

包装器内容：

```sh
#!/usr/bin/env bash
exec /opt/kayingcode/node/bin/node /opt/kayingcode/kayingcode.cjs "$@"
```

Provider 配置由运维单独放到服务器（例如 `/srv/kaying-bot/kaying-taptap-daily/provider_config.json`，权限 0600），并在 `report.env` 中设置 `KAYINGCODE_PERSONAL_PROVIDER_CONFIG_FILE`。

## 5. 配置

编辑 `/etc/kaying-bot/kaying-taptap-daily/report.env`：

```sh
KAYINGCODE_BIN=/opt/kayingcode/bin/kayingcode
KAYINGCODE_PERSONAL_PROVIDER_CONFIG_FILE=/srv/kaying-bot/kaying-taptap-daily/provider_config.json
TAPTAP_DAILY_MODE=build
TAPTAP_DAILY_TIMEOUT_SECONDS=3600
TAPTAP_DAILY_RETRY_TIMEOUT_SECONDS=1200
TAPTAP_DAILY_CALENDAR_DAYS=30
TAPTAP_DAILY_MAX_NEW_GAMES=4
TAPTAP_DAILY_MAX_TRACKS=5
TAPTAP_DAILY_CONCURRENCY=5
TAPTAP_DAILY_SUBAGENT_MODEL=opencode-go-chat/deepseek-v4.1-flash
# 服务器出口被 TapTap WAF 拦截时启用 Cloudflare Worker 代理；留空则直连。
TAPTAP_PROXY_BASE_URL=https://taptap-proxy.opentaptap.dev
TAPTAP_PROXY_TOKEN=<与 Worker secret 一致>
REPORT_PUBLIC_BASE_URL=https://example.com/kaying-bot/kaying-taptap-daily
LARK_WEBHOOK_URL=
LARK_WEBHOOK_SECRET=
LARK_ALERT_WEBHOOK_URL=
```

要点：

- **模型统一**：主代理使用 Provider 的默认 `deepseek-v4.1-flash`；`TAPTAP_DAILY_SUBAGENT_MODEL` 显式设为 `opencode-go-chat/deepseek-v4.1-flash`，保证所有代理与子代理不漂移到其它模型。
- 先用 `TAPTAP_DAILY_MODE=build`。headless 下需要审批的工具走 deny broker，actor 不能随意写工作区外文件。确认 `world.run` 与报告产物正常后，非必要不要放宽到 `yolo`。
- `REPORT_PUBLIC_BASE_URL` 用于飞书摘要链接；不配置时摘要不带在线链接。
- 模型/Provider 配置在 `taptap` 用户的 `~/.kayingcode/cli/config.json` 或 KayingCode 支持的环境变量中，不要写进 `report.env` 的仓库副本。

### 5.1 服务器出口被 TapTap WAF 拦截时（Cloudflare Worker 代理，推荐）

部分云服务器出口 IP 会被 `www.taptap.cn` 的 WAF 返回 405。配套的 `apps/kaying-taptap-proxy` 用 Cloudflare Worker 取数，报告服务器只需要访问 Worker 的自定义域名。

部署 Worker：

```sh
cd apps/kaying-taptap-proxy
pnpm install
openssl rand -hex 32 > /tmp/kaying-taptap-proxy.token
pnpm exec wrangler secret put PROXY_TOKEN < /tmp/kaying-taptap-proxy.token
pnpm exec wrangler deploy
```

`wrangler.jsonc` 绑定 `taptap-proxy.opentaptap.dev`，并关闭 `workers_dev`。Worker 侧只允许 TapTap 三榜、日历和榜单定义路径，要求 Bearer token，可选 `ALLOWED_CLIENT_IP` 限制报告服务器出口。

报告服务器配置：

```sh
TAPTAP_DAILY_SOURCE=http
TAPTAP_PROXY_BASE_URL=https://taptap-proxy.opentaptap.dev
TAPTAP_PROXY_TOKEN=<与 Worker secret 一致>
```

验证：

```sh
TOKEN="$(cat /tmp/kaying-taptap-proxy.token)"
curl https://taptap-proxy.opentaptap.dev/health
curl --get -H "Authorization: Bearer $TOKEN" \
  --data-urlencode 'path=/webapiv2/app-top/v2/hits?type_name=hot&from=0&limit=10&X-UA=...' \
  https://taptap-proxy.opentaptap.dev/fetch
```

完成后 09:00 的 systemd timer 会自动经 Worker 采集三榜和日历；不再需要本机 import 同步。

> 注意：`*.workers.dev` 在大陆可能被 DNS 污染，生产入口必须使用可从报告服务器访问的自定义域名。Worker 出口是否被 TapTap 放行可能随其 WAF 策略变化；`/health` 和日报质量阈值用于发现回退。

### 5.2 人工 import 兜底

如果 Worker 不可用，改用“允许访问 TapTap 的机器采集 + 服务器生成日报”：

1. 在能访问 TapTap 的机器上构建插件：

```sh
pnpm --filter @kayingcode/kaying-taptap-daily-plugin run build
```

2. 配置 `report.env`：

```sh
TAPTAP_DAILY_SOURCE=import
```

3. 每天在服务器 09:00 之前（例如本机 08:40）运行同步脚本，把当日 `boards.json`/`calendar.json` 上传到服务器：

```sh
cd apps/zcode-cli/packages/kaying-taptap-daily-plugin
REMOTE_HOST=<server-ip> REMOTE_USER=root ./deploy/collect-and-upload.sh
```

同步脚本会在本机运行 collector、导出 import JSON，并通过 SSH/SCP 上传到：

```text
/srv/kaying-bot/kaying-taptap-daily/workspace/data/daily/<date>/import/
```

4. 服务器 09:00 的 systemd timer 会以 `source=import` 运行完整工作流：metrics、subagent 分析、核验、渲染与飞书摘要都不受影响。

本机 cron 示例（请使用 SSH key 或 ssh-agent，不要在脚本里写密码）：

```cron
40 8 * * * cd /path/to/kaying-code-v2/apps/zcode-cli/packages/kaying-taptap-daily-plugin && REPORT_DATE=$(TZ=Asia/Shanghai date +\%F) REMOTE_HOST=<server-ip> REMOTE_USER=root ./deploy/collect-and-upload.sh >> "$HOME/.cache/kaying-taptap-daily/sync.log" 2>&1
```

如果服务器能直接访问 TapTap，把 `TAPTAP_DAILY_SOURCE` 设回 `http` 并清空 `TAPTAP_PROXY_*` 即可。

## 6. 首次运行

```sh
sudo -u taptap REPORT_DATE=$(TZ=Asia/Shanghai date +%F) \
  /opt/kaying-bot/kaying-taptap-daily/run-report.sh --force
```

检查：

```sh
ls -l /srv/kaying-bot/kaying-taptap-daily/workspace/reports/<date>/
cat /srv/kaying-bot/kaying-taptap-daily/workspace/runs/<date>/run.json
```

期望产物：

```text
reports/<date>/report.md
reports/<date>/report.html
reports/<date>/report.json
reports/<date>/index.html
reports/index.html
data/daily/<date>/snapshot.json
data/daily/<date>/metrics.json
```

同一天重复运行默认跳过；`--force` 才覆盖。

## 7. 定时器

```sh
systemd-analyze calendar '*-*-* 09:00:00 Asia/Shanghai'
systemctl list-timers | grep kaying-bot-taptap-daily
systemctl enable --now kaying-bot-taptap-daily.timer
systemctl enable --now kaying-bot-taptap-daily-health.timer
```

- `kaying-bot-taptap-daily.timer`：每天 09:00 触发，`Persistent=true`（关机错过会在启动后补跑）。
- `kaying-bot-taptap-daily-health.timer`：每天 12:00 检查最近一次成功是否在 26 小时内。
- 如果发行版 systemd 不支持时区后缀，把服务器时区设为 `Asia/Shanghai`，并使用不带时区的 `OnCalendar=*-*-* 09:00:00`。

## 8. nginx

把 `deploy/nginx.conf.example` 加入 server 块，创建 basic auth：

```sh
sudo htpasswd -c /etc/nginx/.htpasswd-kaying-taptap-daily <user>
sudo nginx -t && sudo systemctl reload nginx
```

URL：`https://<domain>/kaying-bot/kaying-taptap-daily/`。默认不暴露 `data/`、`runs/` 和 raw evidence。

云服务器还需要在安全组放行 80/443；未放行时公网会连接超时或空响应。临时查看可走 SSH 隧道：

```sh
ssh -L 8080:127.0.0.1:80 root@<server-ip>
# 本地浏览器打开 http://127.0.0.1:8080/kaying-bot/kaying-taptap-daily/
```

## 9. 飞书

1. 在群中添加“自定义机器人”，复制 webhook。
2. 写入 `LARK_WEBHOOK_URL`；如启用签名校验，同时写入 `LARK_WEBHOOK_SECRET`。
3. 失败告警可单独配置 `LARK_ALERT_WEBHOOK_URL`，留空时回退到 `LARK_WEBHOOK_URL`。
4. webhook 失败不会回滚报告，只记录警告；报告仍是事实来源。

## 10. 人工兜底与补跑

接口不可用或需要人工校准时：

```text
data/daily/<date>/import/boards.json|boards.csv
data/daily/<date>/import/calendar.json|calendar.csv
```

```sh
sudo -u taptap REPORT_DATE=<date> \
  /opt/kaying-bot/kaying-taptap-daily/run-report.sh --force --source import
```

报告头部会标记“来源：人工导入”。CSV 字段见 `spec/data-sources.md`。

补跑历史日期同样使用 `REPORT_DATE`；排名变化会自动寻找上一份快照（7 天内）。

## 11. 监控与故障处理

```sh
journalctl -u kaying-bot-taptap-daily -n 200
cat /srv/kaying-bot/kaying-taptap-daily/workspace/runs/<date>/stderr.log
tail -n 50 /srv/kaying-bot/kaying-taptap-daily/workspace/runs/<date>/stream.jsonl
/opt/kaying-bot/kaying-taptap-daily/healthcheck.sh
```

常见问题：

| 现象                             | 处理                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `report failed`，日志无 workflow | 检查 `KAYINGCODE_BIN`、模型 Provider、`kayingcode -p "hello"` 是否可用        |
| `CreateWorkflow` 未执行          | 确认 `--workflow-mode alwaysOn`、插件已启用、`dynamic-workflows` skill 可加载 |
| 采集 400 `INVALID_XUA`           | collector 会自动换 UID 重试；持续失败时检查 TapTap 接口变更                   |
| 日历不足 7 天                    | 本轮失败；检查网络/接口；可改人工导入                                         |
| 单榜少于 30 条                   | 生成降级报告，质量警告中列出                                                  |
| 超时                             | 检查 `TAPTAP_DAILY_TIMEOUT_SECONDS`、模型配额；wrapper 会自动重试一次         |
| 定时器未触发                     | `systemctl list-timers`、`systemd-analyze calendar`、服务器时区               |

## 12. 安全与合规

- 只采 TapTap 公开页面/公开 Web API；不登录、不使用 Cookie、不读取私有数据。
- 每日约 50 次请求，间隔 ≥350ms；不做高频轮询。
- 报告可能含商业判断，nginx 默认 basic auth；不暴露 raw evidence。
- `report.env` 权限 0640；日志不记录凭据；webhook/模型密钥不提交仓库。
- 接口或条款变化时停止自动采集，切换人工导入，不要绕过访问控制。

## 13. 验收清单

- [ ] `systemd-analyze calendar '*-*-* 09:00:00 Asia/Shanghai'` 下一次触发为本地 09:00。
- [ ] `systemctl start kaying-bot-taptap-daily.service` 成功，`report.md/html/json` 齐全。
- [ ] `report.json` 的 `snapshotHash` 与 `snapshot.json` 一致。
- [ ] 首发/预约/赛道表数字与 `metrics.json` 一致。
- [ ] 证据链接可打开；不存在未知 evidenceId。
- [ ] 同一天重复运行默认跳过，`--force` 覆盖。
- [ ] 断网演练：失败不覆盖上一份成功日报，飞书收到告警。
- [ ] nginx 页面可访问且未暴露 `data/`、`runs/`。
- [ ] `healthcheck.sh` 在 26 小时无成功时退出 1。

## 14. 源码依据

- `apps/zcode-cli/packages/kaying-taptap-daily-plugin/spec/`
- `apps/zcode-cli/packages/kaying-taptap-daily-plugin/workflows/taptap-daily.dwf.ts`
- `apps/zcode-cli/packages/dynamic-workflow/`
- `apps/zcode-cli/packages/bundled-skills/skills/dynamic-workflows/`
- `docs/deploy/kayingcode-cli.md`
