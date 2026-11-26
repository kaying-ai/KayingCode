# voice-input

Composer 语音输入的 UI 模块。归属规范见 [`packages/desktop/spec/composer-voice-input.md`](../../../desktop/spec/composer-voice-input.md)。

- `useComposerVoiceInput({ inputApiRef, sessionId, enabled, blocked })`：状态机唯一 owner，返回 `available`、`state`、`toggle`、`settle(reason)`。
- `VoiceInputButton`：纯展示组件；按下时不抢输入框焦点。tooltip 显示 `shortcut`（未分配时为空串）。
- `ui/useVoiceInputShortcut.ts`：快捷键 `toggleVoiceInput`。匹配读生效表；归属由调用方的 `ownsEvent` 判定（SessionPane 按对话区域路由）；命中后先聚焦输入框再调用 `toggle`，不持有状态。「识别中」完全不响应；纯 Shift 字符绑定在可编辑目标内不匹配。
- `ui/useMicrophonePermissionGuide.ts`：macOS / Windows 权限被拒时的引导浮层状态（重新授权、打开系统设置、重启 KayingCode、窗口获焦时重查一次权限）；浮层由 `VoiceInputButton` 渲染。
- `adapters/pcmCapture.ts`：getUserMedia + AudioWorklet，输出 16kHz 单声道 PCM16，每 100ms 一块。
- `domain/voiceInputFailure.ts`：失败分类、静音判定和提示文案选择，纯函数。
- `domain/voiceInputAvailability.ts`：`available` 的唯一推导（开启、`platform.microphone`、Host 提供 `voiceInputService`、已登录）；Composer 与测试共用。

与编辑器的交集：识别结果通过 `LexicalChatInputHandle.setVoiceText` 写入，结束时调用 `endVoiceText`。语音文字节点和上次写入内容由编辑器 handle 持有，本模块不保存第二份。

不变量：

- 每次录音一个 attemptId，旧 attempt 的事件和异步回调直接丢弃。
- 用户修改输入框（`onUserInputStart` 调用 `settle("user-input")`）、`setVoiceText` 返回 false、发送（`await settle("submit")`）都与点击停止一致：发送尾块和 finish，等待最终结果。用户接管后不再写临时结果，最终结果写入时不移动光标，用户在语音文字后追加的内容保留。
- `settle` 的等待可能跨越会话切换和状态变化：调用方恢复后必须校验目标，目标变化时中止；目标未变时要重新读取最新状态（Composer 交给最新渲染的 `submit`），不能沿用等待前闭包里的值。
- 只有 Escape 删除语音文字；失败、切换会话、输入框不可用（`blocked`）立即取消并保留语音文字。
- `blocked`（Composer 禁用或被交互卡片隐藏）时 `toggle` 不响应，按钮禁用，快捷键不注册。
- 不加客户端超时，依赖服务端超时。
- 可用条件：`platform.microphone` 存在、base 连接提供 `voiceInputService`、已登录；Web / 手机远控 / 旧 preload 缺 `platform.microphone` 时不显示入口。
- 401 不在本模块提示，由全局登录失效弹窗处理。

## 产品落地说明

- `VoiceInputErrorCode` 只从 `@zcode/services` 导入（`contract.ts` 仅再导出类型），Host 错误码与
  [`packages/services/spec/composer-voice-input.md`](../../../services/spec/composer-voice-input.md) 同源。
- `useComposerVoiceInput` 已按上游实现接线：Composer 在发送前 `settle("submit")` 等待最终文本，
  输入框 `onUserInputStart` 触发 `settle("user-input")`，Escape / 会话切换 / `blocked` 走 `cancel`；
  快捷键归属由 SessionPane 按 focused pane 传入 `ownsKeyboardShortcut`。
- 可用性唯一推导在 `domain/voiceInputAvailability.ts`，hook、按钮与测试共用同一口径。
