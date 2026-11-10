# V2 Relay 与自动身份授权

## 产品与边界

本应用交付上游 Web、V2 Relay 和自动设备授权。协议由 `@zcode/shared/web-remote-relay` 定义，Worker 路由与资产边界见本模块 CONTRACT。HTTP `/api/v1/*`、Relay V2 与工作台 `/remote/v4` 分别是路径、消息和页面层的版本标识。

首次接入的用户动作是开启 Desktop 远控并扫码；身份注册、邀请领取、凭据保存及连接票据更新由客户端自动处理。内部 owner/terminal 是权限隔离机制，不是需要用户参与的账号产品。授权过期、注销或丢失本地浏览器凭据时重新扫码，不要求设置密码或手工传递 token。

SQLite-backed `WebRemoteRelayObject` 原子拥有账号、凭据摘要、一次性邀请、一次性 relay token 与设备；Hibernation attachment 拥有账号/角色/SID/lease。不保存任务、不解析业务 RPC、不重放 data。帧上限采用共享协议约束。

Desktop 首次注册独立 owner，本机安全存储 owner secret。owner 可创建邀请并登记/删除设备；terminal 可列设备、申请 terminal token 和注销。邀请默认五分钟且单次使用，终端凭据默认 30 天有效；relay token 短期单次。每次读取校验过期，跨账户/角色请求拒绝。HTTP 不缓存凭据响应，持久化只保存摘要。

### 邀请与凭据有效期配置

受控部署（例如应用商店审核、内部演示）可通过 Worker 变量调整邀请有效期、同一邀请可领取次数和终端凭据有效期。默认值保持现有一次性短邀请语义，多领取只在明确配置时启用。

| 变量                                  | 默认          | 允许范围        | 说明                        |
| ------------------------------------- | ------------- | --------------- | --------------------------- |
| `KAYINGCODE_REMOTE_INVITE_TTL_DAYS`   | 5 分钟        | 1 分钟–30 天    | 单条邀请从签发到失效的天数  |
| `KAYINGCODE_REMOTE_INVITE_MAX_CLAIMS` | 1             | 1–1000          | 同一邀请最多成功 claim 次数 |
| `KAYINGCODE_REMOTE_TERMINAL_TTL_DAYS` | 30 天         | 1 小时–90 天    | claim 成功后终端凭据有效天数 |

- 时长变量以**天**为单位，支持小数：`30` 表示 30 天，`0.5` 表示 12 小时。未设置时使用默认值。
- 变量只在 Worker 运行时读取；非法或越界值回退默认值，不阻断部署。
- 邀请响应仍只返回 `invitation` 与 `expiresAt`，客户端协议不变；领取次数是服务端策略。
- 邀请记录保存 `remainingClaims`。旧记录或未写该字段的记录按单次领取处理，滚动升级期间不会放宽既有邀请。
- 多领取会削弱一次性邀请的安全保证，只允许用于受控审核/演示环境；审核结束后应删除设备、停止远控并轮换邀请。不要把多领取配置用于普通用户部署。

## 顺序与恢复

Desktop owner 注册 → device 注册 → 创建邀请 → Web claim → 每个角色独立获取 token → ws2/auth_init → SID 校验/auth_ack → matched → opaque data。换 socket 更新 lease，删除设备或注销关闭对应连接。会话恢复和 snapshot/resync 属于已有 Host，时序见 [技术流程](../FLOWS.md)。

WEB_REMOTE 类名、对象名 upstream-v2 与存储 key 由本服务配置确定。首次部署使用随项目提供的 wrangler.jsonc 初始化 DO；后续配置变更须明确账号、设备及凭据数据的影响。

## 验收

本地集成入口兼容 Windows：通过 Node 直接启动 Wrangler JS 和 Node 测试入口，不依赖 pnpm shell shim；退出后只清理本测试启动的进程树及临时状态，不终止用户其他进程。

`test` 验证账号幂等、凭据摘要、邀请单次/过期/角色隔离及 Worker 路由；`test:integration` 构建 Web 后在临时本地 Wrangler 上验证真实 HTTP/WebSocket：页面与 manifest、非公开路由 404、匿名 401、角色/跨账号拒绝、token 重放、SID、lease 换代、转发和注销。临时状态测试后清理，不操作生产数据。真机扫码与生产验收另行执行，不能以构建成功代替。
