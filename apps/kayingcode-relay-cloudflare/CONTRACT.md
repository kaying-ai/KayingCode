# Cloudflare Relay 合同

公开边界是 `contract.ts`。Worker 将 `/api/v1/remote/*`、`/api/v1/account/*` 和 `/readyz` 发给 `WEB_REMOTE.idFromName("upstream-v2")`，静态页面经 ASSETS 提供。协议使用 `@zcode/shared/web-remote-relay`。

唯一持久所有者为 `WebRemoteRelayObject`：账号、凭据摘要、默认一次性邀请、一次性 relay token 和设备。邀请默认五分钟、单次领取；受控部署可用 Worker 变量调整邀请 TTL、同一邀请领取次数和终端凭据 TTL，默认值不变。Hibernation WebSocket attachment 保存角色、账号、SID 与 lease；换代关闭旧连接，迟到帧不能覆盖新 lease。凭据响应不缓存，日志不输出凭据。任务、正文、队列和业务快照不进入 Relay。

Desktop device 与 Web terminal 的角色隔离，auth_init/ack 校验 SID；每次连接重新申请 token。网络断开不重放 data，业务恢复由现有 Host 的 `web-remote-replayable` 负责。Desktop 原有 `desktop-continuous` 不变。

同源资产只开放 `/remote`、`/remote/*` 及受控图标/PDF 资源；无扩展名页面允许 SPA 回落且保留 `/remote/v4` 路由。构建先清理本应用 public 生成目录再复制 Web 制品。

HTTP 的 `/api/v1/*`、Relay V2 消息和 `/remote/v4` 页面分别编号，均为当前接口约定。用户只需开启远控并扫码；Desktop 身份、浏览器凭据及短期连接票据由客户端自动维护，不要求用户注册账号、设置密码或填写 token。部署使用随项目提供的 wrangler.jsonc。详见 `spec/upstream-v2.md`。
