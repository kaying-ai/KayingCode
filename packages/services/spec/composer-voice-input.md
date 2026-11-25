# 语音输入 Host 服务

上游 4.0.0 规格：ZCode `docs/chat/composer-voice-input.md`。桌面端归属与 UI 语义见
[`packages/desktop/spec/composer-voice-input.md`](../../desktop/spec/composer-voice-input.md)；
RPC 通道 `ServiceChannels.VoiceInput`（`voice-input`）。

## 状态所有者

- **当前识别会话**：`createVoiceInputService` 闭包内的 `current: Session | null`，是 attempt 的唯一数据源。
  同一时间最多一个会话；新的 `start` 先取消旧会话，再建立新会话。
- **ticket 与 WS 连接**：由本服务持有；renderer 只发起 `start` / `sendAudio` / `finish` / `cancel`，
  永不接触 ASR ticket、WebSocket 或鉴权头。
- **音频缓冲**：`started` 之前到达的 `sendAudio` 块按调用顺序缓存（`pending`），`started` 后一次清空并转发；
  `started` 后直接转发。不落盘、不写日志内容。
- **终态**：每个 attempt 最多一个 `completed` / `error`；发出终态后 `settled = true`，后续关闭帧不再报错。
- **ticket / token**：ticket 请求读当前登录凭据（`kayingcodejwttoken`），只放请求头，不写日志、不回传 renderer。

## 事件与顺序

```
start ──▶ [ticket POST] ──▶ [WS connect] ──▶ onopen: send {type:"start"} ──▶ started
                                                   │
sendAudio ─┬─ started 前：pending.push ─────────────┘（started 后按序 flush）
           └─ started 后：socket.send(chunk)
finish ────▶ started 后 send {type:"finish"}；started 前记 finishRequested，started 时补发
cancel ────▶ settled=true；已连上则 send {type:"cancel"}，随后关闭 socket；该 attempt 不再发事件
```

- 事件只有四种：`started`、`result`（完整文本快照，替换而非追加）、`completed`、`error`。
- `result` / `completed` 的文本由服务端给出，Host 不改写、不拼接。
- `emit` 同时校验 `current === session` 与 `session.settled`，旧会话事件直接丢弃。

## 失败分类

`mapAsrErrorCode(code, status)` 把服务端错误码 / HTTP 状态折叠成 UI 可提示的联合类型：

| 条件 | 结果 |
| ---- | ---- |
| 官方端点 origin 为空（KayingCode.localrun） | `unavailable`（不构造 URL、不发请求） |
| ticket 请求无 HTTP 状态（DNS / 断网 / 超时 / 代理） | `network` |
| ticket 401 / `unauthorized` | `unauthorized`（UI 不提示，交给全局登录失效流程） |
| 429 / `rate_limited` | `rate_limited` |
| 503 / `unavailable` / `upstream_unavailable` | `unavailable` |
| `upstream_timeout` | `upstream_timeout` |
| `audio_limit_exceeded` | `audio_limit_exceeded` |
| `empty_audio` / `audio_too_short` | `audio_too_short` |
| 其他 HTTP 状态或 `error` 帧 | `failed` |
| WS 握手前 `onerror`（服务端用非 101 拒绝） | `failed` |
| 经 HTTP 代理、握手成功、`started` 前非正常关闭 | `proxy` |
| 其他 WS 关闭 | `failed` |

- 代理选路与 `fetch` 共用：WS 走 Host 网络 transport 的 `createWebSocket`，继承 HTTP 代理、No Proxy 与自定义 CA；
  代理配置无效时 fail-closed（`network`），不回退直连。
- 不设客户端超时；start / idle / finish 超时由服务端发 `error` 结束会话。

## 取消与清理

- `cancel(attemptId)`：仅当 attempt 是当前会话时生效；`settled=true`，已连上则发 `{type:"cancel"}` 并关闭 socket；
  之后到达的事件、`onclose`、ticket 回调全部丢弃。
- `dispose()`：取消当前会话并释放 emitter；Host 释放网络 transport 时一并关闭 dispatcher/socket。
- 新 `start` 替换旧会话等价于 cancel：旧 attempt 不再发事件，旧 socket 关闭。
- 未知或已结束的 attempt 调用 `cancel` / `sendAudio` / `finish` 是 no-op，不报错。

## 过期结果规则

- 所有异步回调（ticket、socket create、onmessage、onclose）进入前先比较 `current === session`。
- `completed` / `error` 之前离场的 attempt（取消、替换、dispose）不得再写 UI 或改变状态。
- 同一 attempt 的 `result` 可多次到达，按快照语义替换；终态之后不再接受任何非终态事件。

## 桌面与手机边界

- 服务只在桌面本机 Host 注册；renderer 只在桌面 base 连接声明 `voiceInputService` 能力。
- 远程 workspace、Web Host、手机 relay 连接不声明该能力，`IServiceAccessor.voiceInputService` 为 undefined。
- 手机没有 `IPlatformService.microphone`；即使 Host 注册了通道，手机 UI 也不会显示入口，且手机 RPC allowlist 不含该通道。
- 不进入远程 workspace RPC 合同，不新增手机白名单条目。

## 配置与限制

- ticket 路径 `POST /api/v1/asr/tickets`，body `{ mode: "realtime" }`，10s 超时，不跟随重定向。
- WS 启动帧：`pcm_s16le` / 16000 Hz / 单声道，`punctuation: true`、`itn: true`。
- KayingCode.localrun 无官方 ASR 端点时，服务存在但调用返回 `unavailable`；接入真实 ASR 端点属于后续配置项。

## 验收

- 单测：`packages/services/test/voiceInputService.test.ts`（ticket 请求与鉴权头、started 前缓冲顺序、
  result/completed 事件、cancel 后静默、失败分类、新 start 替换旧 attempt、空 origin 返回 unavailable）。
- UI 单测：`packages/ui/test/voiceInputComposer.test.ts`（平台无麦克风时 toggle no-op；
  发送/停止路径写入最终文本并结束语音文字区域）。
- `pnpm --filter @zcode/services test`、`pnpm --filter @zcode/ui test` 通过；
  既有 Windows sqlite `EBUSY` 失败单独报告。
