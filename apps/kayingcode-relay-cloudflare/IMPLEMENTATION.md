# Relay 实现说明

**中文（默认）** | [English](IMPLEMENTATION.en.md) · [总览](README.md) · [技术流程](FLOWS.md) · [部署](DEPLOYMENT.md)

核对日期：2026-11-07。本说明描述当前实现。

## 1. 模块

| 源码                                                               | 责任                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| [index.ts](src/index.ts) / [contract.ts](src/contract.ts)          | Worker/DO 导出及 WEB_REMOTE、ASSETS 宿主端口                 |
| [worker.ts](src/worker.ts)                                         | API、readyz 固定进入 idFromName("upstream-v2")；静态资源分流 |
| [webRemoteRelayObject.ts](src/webRemoteRelayObject.ts)             | HTTP 鉴权、设备、票据、WS 配对、转发、注销、alarm            |
| [remoteAccounts.ts](src/remoteAccounts.ts)                         | 随机凭据、SHA-256 摘要、owner 幂等注册、邀请领取             |
| [mobileWebAssets.ts](src/mobileWebAssets.ts)                       | 路径白名单、GET/HEAD、SPA 回落                               |
| [共享协议](../../packages/shared/src/web-remote-relay/contract.ts) | 严格请求 schema、消息与 HTTP 操作                            |

生产依赖为 @zcode/shared；Wrangler、workers-types、ws 属于开发/验证工具。DO 使用 SQLite-backed storage 的键值 API，没有独立 D1、KV namespace、SQL 初始化或外部数据库。

所有账户共用一个命名 DO，以 userId 隔离，不是每账户一个 DO。fetch 与 webSocketMessage 的关键路径使用 blockConcurrencyWhile；RemoteAccounts 依赖调用方串行保护，不是独立的并发事务服务。

## 2. 身份与状态所有者

用户看到的是扫码连接流程，无注册表单、密码或 token 输入。Desktop 自动维护 owner 身份；手机扫码后，浏览器取得该身份下的 terminal 凭据。下表描述内部授权机制，不是需要用户操作的账号功能。用户仍需扫码授权，到期、注销或清除浏览器存储后可能需要再次扫码。

### 内部所有者

| 状态                                       | 唯一所有者                                            |
| ------------------------------------------ | ----------------------------------------------------- |
| owner secret 原文                          | Desktop 本机安全凭据服务；重试复用同一 secret         |
| terminal token 原文                        | Web adapter 的内存及 localStorage；存储不可用时仅内存 |
| 账号、摘要、邀请、设备、票据               | WebRemoteRelayObject storage                          |
| role、SID、terminalSid、lease、initialized | Hibernation WebSocket attachment                      |
| 任务、CommandInbox、运行/快照              | 既有 CLI/runtime                                      |
| attachment、跨 Host 路由、业务恢复         | Desktop 既有窗口 Host                                 |

owner/terminal 是账号权限，device/terminal 是 WS 角色。owner 只能申请 device 票据，terminal 凭据只能申请 terminal 票据。device_sid、device_mid、terminal_sid 不是任务或 workspace 身份。workspaceIdentity、remoteSessionId 由业务链路贯穿，Relay 不按路径重建它们。

## 3. 存储与有效期

| key / attachment       | 内容                                                    | 当前时效                              |
| ---------------------- | ------------------------------------------------------- | ------------------------------------- |
| `credential:<SHA-256>` | userId、owner/terminal、expiresAt                       | owner 使用远期到期值；terminal 30 天  |
| `invitation:<SHA-256>` | userId、expiresAt                                       | 5 分钟；成功 claim 删除               |
| `device:<device_sid>`  | SID、MID、userId、created_at、meta                      | owner 删除前保留                      |
| `token:<SHA-256>`      | authority、WS 角色、credentialDigest、expiresAt         | 60 秒；upgrade 前删除，失败也不能重用 |
| socket attachment      | ticket 信息及 lease、SID、terminalSid、initialized、mid | 每个 SID 每种角色一个配对资格         |

账号凭据和邀请是 32 字节随机数的无填充 Base64URL（43 字符）；连接票据是 16 字节（22 字符）。storage 不存 bearer、邀请或票据原文。读取时检查有效期；alarm 约每分钟扫描到期记录并关闭到期或超时未初始化连接。alarm 不负责业务心跳或业务重放。

online 从已初始化的 OPEN device socket 推导，持久化字段不是在线事实。注销删除凭据摘要并关闭同摘要 socket；删除设备检查账户归属并关闭同 SID 连接。

## 4. 协议版本分层

| 层次       | 当前标识                            | 含义                        |
| ---------- | ----------------------------------- | --------------------------- |
| HTTP API   | /api/v1/account/_、/api/v1/remote/_ | 当前服务使用的接口路径      |
| Relay 消息 | V2、ws2                             | socket 握手、配对和转发协议 |
| Web 工作台 | /remote/v4                          | 页面和业务会话入口          |

三者独立编号，不构成版本冲突。接口路径应与当前客户端保持一致，不应为统一名称而修改。

### HTTP 契约

API JSON 响应使用 Cache-Control: no-store。账号成功直接返回对象；remote 成功为 `{code:0,msg:"ok",data:...}`，错误通常为 HTTP 状态加 `{code,msg,data:null}`。不要混用两种成功响应解析方式。

| 方法与路径                             | 授权                     | 输入 / 输出                                                        |
| -------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| POST `/api/v1/account/register`        | 无 bearer                | `{ownerSecret}` → `{userId}`；同 secret 幂等                       |
| POST `/api/v1/account/invite`          | owner Bearer             | `{}` → `{invitation,expiresAt}`                                    |
| POST `/api/v1/account/claim`           | 无 bearer                | `{invitation}` → `{token,userId,expiresAt}`                        |
| POST `/api/v1/account/logout`          | terminal Bearer          | 撤销当前凭据，remote 风格 envelope                                 |
| POST `/api/v1/remote/device`           | owner Bearer             | `{device_mid}` → device；每次生成新 SID，不按 MID upsert           |
| GET `/api/v1/remote/device`            | owner 或 terminal Bearer | 同账户设备列表                                                     |
| POST `/api/v1/remote/device/delete`    | owner Bearer             | `{device_sid}`，拒绝跨账户删除                                     |
| POST `/api/v1/remote/token`            | 与 role 对应的 Bearer    | `{role:"device"}` 或 `{role:"terminal"}` → `{token,expires_in:60}` |
| GET `/api/v1/remote/ws2?token=…&mid=…` | 一次性票据               | WebSocket Upgrade；device 的 mid 必须匹配设备 MID                  |
| GET `/healthz`                         | 无                       | `{ok:true}`，不触及 DO                                             |
| GET `/readyz`                          | 无                       | DO 读取探针，失败 503                                              |

remote 输入按共享 schema 严格验证，多余字段可能 400。content-length 大于 4096 或 POST 文本 length 超过 4096 时 413；无效 JSON 为 400，无凭据 401，角色/归属错误 403，非 WS upgrade 为 426。

## 5. WebSocket

客户端只接受 auth_init、pair_status_query、data；服务端为 auth_ack、pair_status_ack、data、error，带秒级 server_ts。首帧必须 auth_init/device_sid，可含 meta/client_ts。服务端校验账户、SID 和 device MID；terminal 初始化时生成 terminal_sid，返回 waiting 或 matched。

每次 upgrade 生成 lease。新连接初始化同 SID/角色时，先清除旧 attachment 的 initialized 资格，再发 KICKED 并关闭旧 socket；旧 close 不影响新配对。支持一条 device 与一条 terminal，不提供同 SID 多手机广播。

payload 必须为 JSON，Relay 不解释业务 RPC。另一角色不在线时返回 DEVICE_OFFLINE，不排队。非文本或超过共享 WEB_REMOTE_CONTROL_RPC_TRANSPORT_LIMITS.maxPhysicalFrameBytes 的帧关闭 1009；授权错误关闭 1008，发送异常 1011。错误码及字段以共享协议为准。

客户端通过 pair_status_query/ack 检测存活；共享默认间隔 5 秒、抖动 1 秒、ack 超时 15 秒。客户端负责重试和重新取票据；快照/增量恢复属于 Host，不属于 Relay。

## 6. Web 资源与构建

仅开放 /remote、/remote/_、/material-icons/_、/pdfjs/\*，仅 GET/HEAD；/remote 308 到 /remote/。无扩展名的 remote 页面资源 404 时回落 /remote/，保留浏览器路由；带扩展名的丢失文件不回落 HTML。

[Web 构建](../../packages/web/scripts/build-upstream.mjs) 由 upstream-web.json 固定官方 Git 提交，必要时从官方获取对象，使用本仓锁定依赖。仅覆盖两个账号 adapter、bootstrap 和受哈希审计的品牌资产；关键工作台源码核对哈希。产物写 packages/web/dist，copy-web.mjs 清理本应用 public 后复制至 public/remote，排除 .map。public 是生成目录，不存放手工文档。

manifest 记录来源、relayOrigin 和审计哈希。当前产品 THIRD-PARTY-NOTICES.md 与上游原文 UPSTREAM-THIRD-PARTY-NOTICES.md 一起交付，HTML 有两个 license 链接。构建读取已有声明，不自动执行全仓 strict；见 [许可规则](../../third-party/SPEC.md)。

## 7. 运行边界与验证

当前没有账户分片、专用 admin、密码找回、业务队列或独立推送服务；schema 出现的其他类型不等于 Worker 已实现。单 DO、设备列表及 alarm 扫描的容量应按真实负载评估。

TLS/WSS 保护传输，本实现没有业务 payload 端到端加密。terminal token 位于浏览器存储；不要记录完整授权 URL、bearer 或票据查询参数。Hibernation 可保留连接 attachment，不保证部署和网络中断时不断线，也不提供业务 exactly-once。

单测覆盖账号幂等/过期、静态资源和路由；本地真实集成覆盖 HTTP/WS、重放、SID/lease、转发、注销和双声明哈希；真机验收另行执行。

Cloudflare 参考：[WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)、[attachment](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)。首次部署使用项目随附的 wrangler.jsonc 中的 DO 配置。
