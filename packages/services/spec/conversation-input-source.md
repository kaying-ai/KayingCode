# 扩展输入来源（extensionInputSource）能力门禁

`{kind:"extension"}` 输入来源是 **strict** 的判别联合成员：旧 CLI 对 `sendText.source`
整条 `proto.invalidPayload`，对 `createSession.firstInput.source` 静默剥掉（消息照常创建，
但没有来源）。因此 services 是 Host 侧唯一门禁 owner：只有 CLI 明确声明
`extensionInputSource: true` 时，扩展网关注入的来源才允许进入命令。

协议定义见 `packages/shared/spec/conversation-input-source.md`；CLI 侧见
`apps/zcode-cli/packages/bootstrap/spec/conversation-input-source.md`。

## 事实源与 owner

- CLI 在 `runtime/capabilities` 响应中声明 `extensionInputSource: true` 才是唯一事实源。
- `packages/services/src/kayingcode-agent/extensionInputSourceSupport.ts` 的
  `supportsExtensionInputSource` 是探测与缓存的唯一实现：复用 `worktreeCwdSupport.ts` /
  `conversationQuoteCommentSupport.ts` 的模式，按**物理 CLI client** 用 `WeakMap` 缓存
  Promise，只认 `=== true`，探测失败按不支持处理且**不缓存失败**。
- `IKayingCodeAgentService.supportsExtensionInputSource?(target)` 把它暴露给 Host 进程内
  调用方（app-control / 扩展网关）；未实现（远端、旧 Host）时调用方按不支持处理。
- 扩展网关注入来源的位置是 `extensions/sessionsBackend.ts`
  （`inputSource: { kind: "extension", pluginId }`，握手时登记在 `AppControlClientBinding`）。

## 门禁语义

```text
createSession / sendToSession（客户端类调用方）
  ├─ binding.inputSource 缺省                     → unavailable（不发没有来源的消息）
  ├─ source.kind !== "extension"                  → 不探测，直接使用
  └─ source.kind === "extension"
       ├─ supportsExtensionInputSource === true   → 命令带 firstInput.source / sendText.source
       └─ false / 缺省 / 探测失败                 → unavailable，且不去掉来源后发送
```

- **不退化**：没有能力位时不去掉 `source` 后发送。去掉来源等于把插件消息伪装成用户亲自输入，
  比失败更糟（上游设计文档 §7 的决策）。
- 只有明确 `=== true` 才算支持；`"true"`、`1` 等歧义值一律按不支持。
- 探测失败（method-not-found、超时、解析失败）按不支持处理，且不缓存失败：
  下一次调用允许重试；探测成功的结果随 client 生命周期缓存。
- 探测结果只用于决定是否发送来源；不改变其他命令参数，不改写调用方对象。
- App 侧仍是权威：渲染进程和手机发来的带 `extension` 来源的命令由 Host 在进入 facade 前拒绝
  （`inputSource` 只来自可信绑定，不来自命令 payload）。

## 与其他能力位的关系

- 与 `worktreeCwd` / `conversationQuoteComment` 同构：独立探测、独立缓存，互不短路。
- UI 不感知该位：扩展 UI 只消费会话行上的 `source`；「没有能力位」由 app-control 折成
  稳定错误码 `unavailable`，扩展进程按名映射。

## 验收

- `packages/services/test/extensionInputSource.test.ts`：
  - advertised（`extensionInputSource: true`）→ 探测为 true，app-control 的客户端类
    `createSession` 发命令时 `firstInput.source` 在场；
  - not advertised（缺省 / false / 非布尔）→ 探测为 false，`createSession` 抛
    `unavailable` 且**不发命令**（来源不出现）；
  - 同一 client 只探测一次；探测失败返回 false 且下一次重新探测。
