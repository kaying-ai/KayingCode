# Composer 语音输入（桌面）

状态：已落地（2026-11-25，Wave 6）。桌面端语音输入从权限、Host 服务、Composer 接线到打包已完成；真实 ASR 端点配置与 E2E 仍为后续项。本 spec 是语音输入在桌面端的归属规范；上游同源文档为 ZCode 4.0.0 `docs/chat/composer-voice-input.md`。

## 范围与当前进度

- 第一版只支持桌面端（Electron）。Web 端与手机远控端不显示入口：`IPlatformService.microphone` 缺席即视为不可用，UI 不注册快捷键、不渲染按钮。
- 只给已登录用户开放；识别服务由本机 Host 的 `voice-input` RPC 提供（`ServiceChannels.VoiceInput`），服务实现见 [`packages/services/spec/composer-voice-input.md`](../../services/spec/composer-voice-input.md)。
- 已落地：系统麦克风权限（Main）、`IPlatformService.microphone` 可选能力、preload / renderer bridge 与 `window.kayingcode` 声明、快捷键命令 `toggleVoiceInput`（默认 `CmdOrCtrl+Shift+D`）、编辑器语音文字 handle、UI voice-input 的契约 / 失败分类 / PCM 采集 / 按钮 / 权限引导 / 快捷键 hook、i18n。
- 已落地（Wave 6）：`packages/services` 的 `IVoiceInputService`（ticket + WebSocket、取消/清理、失败分类）与 `services/node.ts` 装配、Host 网络 transport 的 `createWebSocket` 代理选路、`useComposerVoiceInput` 状态机与 Composer/SessionPane 接线（发送/用户输入走 settle，Escape/会话切换/blocked 走 cancel）、`electron-builder.config.js` 的 `NSMicrophoneUsageDescription` 与 macOS entitlement `com.apple.security.device.audio-input`、`styles.css` 的 `voice-input-surface` / `voice-input-wave` token。
- 后续项：真实 ASR 端点配置（KayingCode.localrun 端点 origin 为空时服务返回 `unavailable`）、E2E（含 ASR mock server）。

## 权限所有者与顺序

- **系统权限所有者是 Main**（`packages/desktop/src/main/microphone-access/`）。renderer 只经 preload 暴露的 `ensureMicrophoneAccess` / `resetMicrophoneAccess` / `openMicrophoneSettings` 调用，不接触 `systemPreferences`、`tccutil` 或系统设置 URL。
- **授权顺序固定**：点击麦克风 → main `ensureAccess()` → 仅当结果不是 `denied` 才 `getUserMedia` → `AudioWorklet` 采集 → Host `start`。`denied` 时不申请 ticket、不打开设备。
- Linux 没有系统权限接口：`ensureAccess()` 返回 `unsupported`，由 `getUserMedia` 的错误决定失败分类，仅 toast，无设置页按钮。
- macOS `not-determined` 才由 main 弹系统授权；Windows 的 `unknown` / `not-determined` 不当作拒绝。
- `getUserMedia` 抛 `NotAllowedError` / `SecurityError` 时，即使 `ensureAccess()` 曾返回 `granted`，也按该系统 `denied` 处理（Windows 关闭「允许桌面应用访问麦克风」）。

## 拒绝语义（不重复弹框）

- 系统状态为 `denied` / `restricted` 时**不再调用** `askForMediaAccess`，只显示权限引导浮层；同一失败在 UI 用 `dedupeKey: "voice-input-failure"` 合并，避免重复点击叠加 toast。
- macOS「重新授权」只在 `not-determined` 或被重置后重新请求一次；成功后关闭浮层并 toast，**不自动开始录音**。
- 重置请求在 main 串行合并：并发的 `resetAccess()` 共用同一次 `tccutil` / 系统授权结果。
- 已 `granted` 时重置为 no-op，避免删除有效授权；`restricted`（MDM）返回 `failed`，引导用户打开系统设置。
- 开发版跳过 `tccutil`，状态仍 `denied` 时同样返回 `restart-required`（仅开发版路径，E2E 用）。
- 权限失败不自动重试，不写第二份状态；按钮保持可用，用户可再次主动点击。

## 录音生命周期与清理

- 每次录音一个 `attemptId`；`useComposerVoiceInput` 是状态唯一 owner（`idle → requesting → recording → finishing → idle`）。
- 结束路径：点击停止 / 用户修改输入框 / 发送 → 先 flush 尾块再 `finish`，等待 `completed`；Escape / 会话切换 / 输入框不可用 / 组件卸载 → `cancel`（Escape 同时删除语音文字）。
- 采集资源（`MediaStream` 轨道、`AudioContext`、`AudioWorklet`、Blob URL）由 `PcmCapture.stop()` / `abort()` 释放；attempt 换代后旧回调丢弃，不再发音频。
- 语音文字唯一存储在编辑器 handle（`beginVoiceText` / `setVoiceText` / `endVoiceText`），voice-input 模块不保存第二份；草稿保存即保存语音文字。
- 不加客户端超时；start / finish 超时由服务端产生 `error` 事件结束会话。

## 插件沙箱权限闸门

- 插件 UI 沙箱的 `microphone` / `camera` 权限仍由 `pluginSandbox` 的 `permissionGate` 决定：资源未声明直接拒绝；首次使用弹原生确认框；macOS 再由 `requestSystemMediaAccess("microphone")` 请求系统授权。
- 该闸门与 Composer 语音输入**互不复用状态**：Composer 不经过插件沙箱，沙箱同意也不投影到 `IPlatformService.microphone`。两者只在系统层共享 macOS TCC 授权结果。
- 沙箱 `check()` 只读本次运行的内存同意记录；重启后重新询问，不持久化。

## Web / 手机远端缺席

- `IPlatformService.microphone` 为可选能力：Web、手机远控与旧 preload 均不提供，UI 的 `isVoiceInputAvailable` 返回 false，按钮隐藏且 `toggleVoiceInput` 快捷键不启用（生效表有绑定也不注册监听）。
- 手机远控不代理麦克风；即使桌面宿主有权限，手机端仍按自身平台能力判断，不显示入口。

## 过期结果规则

- Host 事件与异步回调只在 `event.attemptId === 当前 attempt.id` 时生效；旧 attempt 的 `result` / `completed` / `error` 直接丢弃，不写编辑器。
- 用户接管后不再写临时结果；`setVoiceText` 返回 false（语音文字前缀被用户改过）时按用户接管处理并结束录音。
- `completed` 只替换语音文字本身，保留用户追加内容；最终文本为空则删除语音文字。
- `settle` 等待可能跨越会话切换：调用方恢复后必须校验目标未变，并重新读取最新状态；目标变化时中止，不发送任何内容。

## 验收

- 单元：`packages/shared/test/voiceInputContract.test.ts`（频道名、快捷键绑定、可选平台方法）、`packages/desktop/test/microphoneAccess.test.ts`（granted / denied / unsupported、重置串行与重启判定）、`packages/desktop/test/pluginSandboxMicrophonePermission.test.ts`（沙箱闸门）、`packages/services/test/voiceInputService.test.ts`（ticket / 流生命周期 / 取消 / 失败分类）、`packages/ui/test/voiceInput*.test.ts`（快捷键不重复注册、平台方法缺席时隐藏、Composer 发送路径写入最终文本）。
- 手动 / 后续 E2E：macOS 打包版权限拒绝后「重新授权」能再次弹框；静音、设备断开、空结果提示；Web / 手机不显示入口。
