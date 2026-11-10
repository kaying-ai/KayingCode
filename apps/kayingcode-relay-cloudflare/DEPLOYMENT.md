# Relay 首次部署教程

**中文（默认）** | [English](DEPLOYMENT.en.md) · [总览](README.md) · [实现](IMPLEMENTATION.md) · [流程](FLOWS.md)

核对日期：2026-11-07。以下首次部署 Relay、自动身份授权和 Web 工作台，同一个 Worker、同一个 HTTPS origin。示例地址均为占位域名。除非另有说明，命令在仓库根目录执行。

## 1. 环境与账号

- Node 24.14.0、pnpm 10.31.0，来源是根 mise.toml；已激活相同版本时可省略命令的 mise exec -- 前缀。
- Git、完整仓库和锁定依赖；Web 构建从固定官方 Git 对象导出源码，不是只上传本应用目录。
- Cloudflare 账号有 Worker、静态资源和 SQLite-backed Durable Objects 部署权限。确认实际账号适用的配额/计费，不在教程固定价格或套餐承诺。
- 确定实际外部 origin，例如 https://relay.example.com。可先使用自己的 workers.dev 地址；浏览器、Desktop 和构建产物必须指向同一服务。

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm --dir apps/kayingcode-relay-cloudflare exec wrangler login
mise exec -- pnpm --dir apps/kayingcode-relay-cloudflare exec wrangler whoami
```

自动化部署可通过 Cloudflare 支持的 CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID 注入授权，在 CI 密钥存储中管理；不提交凭据。Desktop 自动生成并保存设备身份；用户不需要开通账号、设置密码或填写凭据。

## 2. 检查配置

| wrangler.jsonc 项        | 当前值 / 操作                                                   |
| ------------------------ | --------------------------------------------------------------- |
| name                     | kayingcode-relay-cloudflare；首次部署时确定本服务的 Worker 名称 |
| main / compatibility     | src/index.ts、2026-10-13、nodejs_compat；按已验证配置部署       |
| durable_objects.bindings | WEB_REMOTE → WebRemoteRelayObject                               |
| migrations               | 使用项目随附的 DO 初始化配置，首次部署无需手写生命周期配置      |
| assets                   | ./public、ASSETS、run_worker_first:true；由构建生成             |

服务由 Cloudflare Worker、静态资源与 SQLite-backed Durable Objects 组成。首次部署时，Wrangler 按 wrangler.jsonc 创建 DO namespace；应用使用 upstream-v2 命名对象。代码与随附配置一起部署。

在 Cloudflare 控制台选择该 Worker，通过 Settings 的 Domains & Routes 配置自己的 Custom Domain；自定义域名需满足 Cloudflare zone/DNS 条件。首次部署后完成域名绑定再验收 HTTPS。具体平台操作见 [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

## 3. 本地开发与验证

```sh
mise exec -- pnpm --dir apps/kayingcode-relay-cloudflare typecheck
mise exec -- pnpm --dir apps/kayingcode-relay-cloudflare test
mise exec -- pnpm --dir apps/kayingcode-relay-cloudflare test:integration
mise exec -- pnpm --dir apps/kayingcode-relay-cloudflare dev
```

dev 先构建 Web，再启动本地 Wrangler，通常为 http://127.0.0.1:8787，以 Wrangler 输出为准。本地 HTTP 用于接口调试；正式 Desktop 授权链接使用 HTTPS，不把普通本地 HTTP 运行等同真机扫码验收。Web 内嵌 origin 必须适配所测环境；默认值来自 packages/web/upstream-web.json，不能认为 dev 自动改成 localhost。

test:integration 会分配临时端口和独立 SQLite 状态目录，通过 REMOTE_V2_TEST_ORIGIN 让测试使用该实例；退出只清理本测试启动的子进程和状态。它验证实际 HTTP/WS、角色/SID、票据重放、lease、注销、静态页面和两份声明哈希。test 单独执行时，依赖本地 Worker 的场景可跳过。

显式重置只用于本地排障：停止本地 Worker 后运行 `mise exec -- pnpm --dir apps/kayingcode-relay-cloudflare dev:reset`。它删除本应用 .wrangler/state 中的本地账号、设备和邀请；不是升级步骤或生产恢复命令。

## 4. 构建与发布

先用选定的最终 origin 构建。以下二选一。

POSIX shell：

```sh
KAYINGCODE_REMOTE_ORIGIN=https://relay.example.com mise exec -- pnpm --dir apps/kayingcode-relay-cloudflare deploy
```

Windows PowerShell：

```powershell
$env:KAYINGCODE_REMOTE_ORIGIN = "https://relay.example.com"
mise exec -- pnpm --dir apps/kayingcode-relay-cloudflare deploy
Remove-Item Env:KAYINGCODE_REMOTE_ORIGIN
```

部署命令会发布到 Cloudflare；只构建时把 deploy 换为 build:web。若要本地检查打包，可先 build:web，再运行：

```sh
mise exec -- pnpm --dir apps/kayingcode-relay-cloudflare exec wrangler deploy --dry-run --outdir .wrangler/dry-run
```

deploy 的实际顺序是 build:web → 清理/复制 public → wrangler deploy --keep-vars。keep-vars 保留远端已有普通变量，不会替你设置构建期 origin；运行时控制台变量不能修正已经编入 JS 的地址。自定义 origin 是公开地址，不是 secret；改变它必须重新构建、部署，并让 Desktop 对齐。

### 4.1 审核/受控部署的有效期设置

普通部署保持默认：邀请 5 分钟、单次领取，terminal 凭据 30 天。应用商店审核或内部演示需要 2–4 周、多人使用时，建议部署**独立的审核 Worker 和域名**，不要在生产 Worker 上放宽限制。

审核 Worker 使用普通变量（Cloudflare 控制台该 Worker 的 Settings → Variables and Secrets；这些不是 secret）：

| 变量                                  | 审核示例 | 作用                        |
| ------------------------------------- | -------- | --------------------------- |
| `KAYINGCODE_REMOTE_INVITE_TTL_DAYS`   | `30`     | 邀请有效 30 天              |
| `KAYINGCODE_REMOTE_INVITE_MAX_CLAIMS` | `5`      | 同一邀请最多供 5 次授权领取 |
| `KAYINGCODE_REMOTE_TERMINAL_TTL_DAYS` | `30`     | 每次领取的凭据有效 30 天    |

时长变量以天为单位，支持小数（例如 `0.5` 为 12 小时）。变量只影响新签发的邀请；已经签发的邀请保留签发时的 `expiresAt` 和 `remainingClaims`，降低配置不会缩短旧链接。非法或越界值回退默认值，不会阻断服务。

独立 Worker 的构建与部署示例（把 `review.example.com` 换成审核域名）：

```sh
KAYINGCODE_REMOTE_ORIGIN=https://review.example.com mise exec -- pnpm --dir apps/kayingcode-relay-cloudflare run build:web
mise exec -- pnpm --dir apps/kayingcode-relay-cloudflare exec wrangler deploy --name kayingcode-relay-review --keep-vars
```

`--name` 覆盖 wrangler.jsonc 中的 Worker 名称，审核 Worker 使用独立 Durable Object namespace。部署后在 Cloudflare 控制台为该 Worker 绑定审核域名，再填入上表变量。审核结束后删除审核 Worker/域名；至少应删除设备、停止远控并移除变量。

审核主机启动 Desktop 时指向审核 origin，并使用独立数据目录，避免把生产 owner 身份带到审核 Worker：

```sh
export KAYINGCODE_OFFICIAL_CLOUDFLARE_RELAY_ORIGIN=https://review.example.com
export KAYINGCODE_DATA_BASE_DIR=/srv/kayingcode-review
```

注意：`build:web` 会把审核 origin 写入 `packages/web/dist` 和 `public/`；之后若要发布生产，必须用生产 origin 重新构建再部署。

public 是构建产物目录，通过 build:web 生成并部署。Web 来源由 packages/web/upstream-web.json 固定；构建必要时只获取该官方提交，不移动产品分支。manifest 写入来源、relayOrigin 和审计哈希。两份第三方声明随资产交付；材料检查为显式命令，不是全仓待办清零后才允许打包，见 [许可规则](../../third-party/SPEC.md)。

## 5. Desktop 与手机接入

自托管服务在启动 Desktop 前设置以下 origin：

```powershell
$env:KAYINGCODE_OFFICIAL_CLOUDFLARE_RELAY_ORIGIN = "https://relay.example.com"
```

POSIX 使用 `export KAYINGCODE_OFFICIAL_CLOUDFLARE_RELAY_ORIGIN=https://relay.example.com`。随后从该环境启动实际 Desktop；若从系统图标或后台进程启动，应确认进程确实继承该变量。Desktop 优先读取进程环境，其次桌面包目录的 `.env` 快照，最后回退默认生产 origin；打包版同样支持进程环境。教程不假设本机安装路径。

若使用 KAYINGCODE_WEB_REMOTE_CONTROL_URL 或 KAYINGCODE_WEB_REMOTE_CONTROL_RELAY_WS_URL 覆盖项，它们也必须对应同一部署；通常只需设置上面的 origin。

1. 在 Desktop 打开本地工作区，打开左下角手机入口，开启远控。
2. Desktop 自动注册 owner/device，生成完整 `/remote/v4?sid=…#authorize=…` 链接和二维码。
3. 手机扫码，或把完整链接粘贴到浏览器；只复制 sid 或手工打开无授权的页面不能完成首次登录。
4. 浏览器单次领取独立凭据后进入工作台。邀请过期/已使用时在 Desktop 刷新二维码。
5. Taro/Flutter 自托管渠道也打开该完整 URL，授权由浏览器自动处理。原生上游 ZCode 渠道的 OAuth 是另一种接入。

Desktop 必须持续运行、Host 和工作区可用。手机不能让 Relay 代替离线桌面运行 Agent。清浏览器存储会失去本机保存的 terminal 凭据，需重新授权；服务端注销才撤销对应摘要。

## 6. 部署验收

PowerShell 可用 curl.exe 避免旧环境中的 curl 别名；POSIX 使用 curl：

```sh
curl --fail https://relay.example.com/healthz
curl --fail https://relay.example.com/readyz
curl --fail https://relay.example.com/remote/mobile-web-manifest.json
curl -I https://relay.example.com/remote/v4
curl -I https://relay.example.com/remote/THIRD-PARTY-NOTICES.md
curl -I https://relay.example.com/remote/UPSTREAM-THIRD-PARTY-NOTICES.md
```

healthz/readyz 应为 200；v4 应直接提供页面，不能重定向丢失路由；manifest.relayOrigin 应等于外部 origin。匿名 GET /api/v1/remote/device 为 401；/v1/client-config、/v1/nodes、/admin/ 为 404。readyz 只证明存储可读，不证明 Desktop 在线、WS 配对或业务可运行。

用专用测试工作区进行真机验收：新二维码授权、已有会话读取、发送/回复、刷新恢复、断网重连、相同角色换代、注销、手机布局及品牌。检查两份声明文件内容哈希与 manifest.notices 一致。自动测试通过与生产真机验收分别记录。

## 7. 日常维护

记录已部署的 Worker 版本、Git 提交、外部 origin 和 Web manifest。Worker 与静态资源按匹配版本一起发布。异常时先检查 origin、readyz 和 Desktop 连接，再按 Cloudflare 版本管理恢复已记录的匹配版本；代码回退不等于 DO 数据恢复。

以仓库内 wrangler.jsonc 作为本服务配置。改变外部 origin 后重建 Web。本地 dev:reset 只用于清理本地测试数据。

参考：[Wrangler 部署与版本管理](https://developers.cloudflare.com/workers/wrangler/commands/workers/)、[Durable Objects 配置](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)。

## 8. 排障

| 现象                        | 定位与处理                                                                      |
| --------------------------- | ------------------------------------------------------------------------------- |
| healthz 404 或域名/TLS 失败 | 检查 Worker、Custom Domain/route、DNS、实际访问 origin                          |
| readyz 503                  | 检查 WEB_REMOTE binding、类导出、migration 与 Cloudflare 日志                   |
| v4 或静态 JS 404            | 检查 build:web 是否完成、ASSETS/public、SPA 回落；重新构建匹配 origin           |
| 授权过期/已使用             | 刷新 Desktop 二维码；保留浏览器既有独立凭据，不反复重用邀请                     |
| HTTP 401/403、AUTH_FAILED   | 区分长期 bearer 与短期 ticket；核对 owner/device、terminal 角色、SID/MID 及账户 |
| waiting / DEVICE_OFFLINE    | 检查 Desktop 是否在线、是否同一 SID、双方是否完成 auth_init                     |
| KICKED / 反复换代           | 检查多个页面或客户端是否争用同 SID/角色；关闭重复连接再测试                     |
| 手机重连后缺少消息          | 检查 Host 的 snapshot/resync 和原会话；Relay 无离线队列                         |
| 域名变更后仍访问旧服务      | 重新构建 Web、核对 manifest、Desktop 环境及浏览器旧会话                         |

可用 `mise exec -- pnpm --dir apps/kayingcode-relay-cloudflare exec wrangler tail` 观察 Worker 日志；不要添加输出凭据、完整授权 URL、token 查询或业务正文的调试日志。
