# voice-input-service

Composer 语音输入（[`packages/desktop/spec/composer-voice-input.md`](../../desktop/spec/composer-voice-input.md)）的本机 Host 服务：向官方 ASR 端点申请 realtime ticket，用 WebSocket 转发 renderer 采集的 PCM16 音频，把识别事件转成 `VoiceInputEvent`。

- `IVoiceInputService`（通道 `voice-input`）：`start`、`sendAudio`、`finish`、`cancel`，结果经 `onEvent` 发出 `started` / `result` / `completed` / `error`。
- `createVoiceInputService({ apiClient, getToken, resolveOrigin, createSocket })`（`node.ts`）：ticket 请求走 `NodeApiClient`（带 `kayingcodejwttoken`，401 由全局登录失效流程处理）；WebSocket 由 Host 网络 transport 按与 fetch 相同的代理 / No Proxy / 自定义 CA 选路，不带 `Origin` 头。

不变量：

- 唯一数据源是当前会话；同一时间只有一个会话，新的 `start` 取消旧会话。旧会话的回调和事件直接丢弃。
- 每个 attempt 最多发出一个终态事件（`completed` 或 `error`）；`cancel` 后不再发出事件。
- 不设客户端超时，依赖服务端 start / idle / finish 超时。
- 日志不记录识别文本、音频、ticket 和 JWT。
- 只在桌面 base 连接暴露给 renderer，不进入远程 workspace RPC 合同和手机白名单。
- 官方端点 origin 为空（KayingCode.localrun 无官方服务端）时直接返回 `unavailable`，不构造 `new URL`、不发请求。
