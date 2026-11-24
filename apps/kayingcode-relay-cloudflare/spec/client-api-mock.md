# Relay 客户端 API mock / proxy

状态：阶段 1 完成（2026-11-24）。包含客户端公开配置/场景与 CLI OAuth mock；proxy 只开放 client 两个路径。

## 目标

在同一个 Relay 域名下提供 ZCode/KayingCode 客户端公开 API 的 staging/e2e 入口：

- `mock`：返回共享 fixtures，不访问网络；用于本地、staging、e2e 和无官方端点环境。
- `proxy`：按精确路径 allowlist 转发到配置的上游 origin；用于联调官方端点。
- 未配置模式：保持现状返回 404，生产默认不会误开 mock。

## 路由与所有权

| 路径 | 所有者 | 说明 |
| --- | --- | --- |
| `/api/v1/remote/*`、`/api/v1/account/*` | `WebRemoteRelayObject` | 设备身份、邀请、连接，逻辑不变 |
| `/api/v1/client/configs` | `src/clientApi.ts` | 公开客户端配置 |
| `/api/v1/client/scenes` | `src/clientApi.ts` | 推荐场景目录 |
| `/api/v1/oauth/cli/init`、`/poll/:flowId`、`/profile` | `src/oauthApi.ts` | CLI 登录 mock，仅 `mock` 模式 |
| 其他路径 | ASSETS / 404 | 不新增开放代理 |

`/api/v1/client/*` 由 Worker 在进入 ASSETS 前处理；不写 Durable Object、不读写设备身份。

## 模式

- `KAYINGCODE_API_MODE=mock`：返回共享 fixtures；`configs` 返回空 configs（与 localrun 同义），`scenes` 返回 `localClientScenesDefaults()`；OAuth CLI init/poll/profile 返回固定 mock flow 与用户。
- `KAYINGCODE_API_MODE=proxy` + `KAYINGCODE_API_UPSTREAM_ORIGIN=https://...`：仅转发两个 client 精确路径，保留 query；不转发 `Authorization`、`Cookie` 等凭据头。OAuth 路径在 proxy 模式下保持 404，不经 Relay 代理。
- 未知模式或 proxy 缺少合法 https origin：404 / 503，不回落 mock，避免生产误开。
- 响应统一 `cache-control: no-store`。

## 安全边界

- 不做开放代理；路径固定，不能拼接任意 URL。
- 不持久化账号、凭据、配置或业务状态。
- 不代理模型推理、OAuth token、官方 MCP 鉴权；这些后续按阶段 1 的端点解析单独设计。
- mock 只返回固定 fixtures，不接受调用方注入任意数据。

## 验收

- `mock` 下 configs/scenes 返回可解析 envelope，且不触发 `WEB_REMOTE`。
- `proxy` 下只允许两个路径；上游 origin 非 https 或缺失时失败。
- 未配置模式时保持 404，现有 remote/account 路由不受影响。
- `pnpm --filter @kayingcode/relay-cloudflare test` 与 typecheck 通过。
