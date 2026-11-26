# 会话输入来源的 CLI 装配、持久化与冷恢复

状态：已实现（4.0.0 同步波次）。
上游来源：ZCode 4.0.0 `apps/zcode-cli/docs/design/v2/conversation-input-source.md`；
共享协议见 `packages/shared/spec/conversation-input-source.md`；services 门禁见
`packages/services/spec/conversation-input-source.md`。

本文件只描述 CLI（bootstrap / core / adapters）侧：能力位、命令入参、写入与冷恢复。
来源的种类、谁能设置、旧端兼容结论由共享协议文档定义，这里不重复。

## 1. 能力位与协商

- `runtime/capabilities` 返回 `extensionInputSource: true`，条件是**本 CLI 真的把来源落库**：
  `createSession.firstInput.source` 与 `sendText.source` 都进入 canonical intent、
  排队账本与 `userInput` 行，冷恢复读回同一份来源。
- 只有能力位在场，Host（services app-control / 扩展网关）才会发送 `{kind:"extension"}`。
  旧 CLI 不具备该位：Host 报 `unavailable`，不去掉来源后发送。
- 该位与 `worktreeCwd` / `conversationQuoteComment` 同属 additive optional：
  旧 Host 的结果 schema 非 strict，多一个键不影响解析。

## 2. 命令入参

| 命令                       | 字段      | schema 位置                                              |
| -------------------------- | --------- | -------------------------------------------------------- |
| `sendText`                 | `source?` | `kayingcode-protocol-v4/command.ts`                      |
| `createSession.firstInput` | `source?` | 同上（`firstInput` 对象非 strict，`source` 需 optional） |

- `source` 使用共享的 `conversationInputSourceSchema`；每种 kind 内部 strict，非法来源
  整条命令 `proto.invalidPayload`，不创建消息、不建会话。
- 命令层只透传，不做归一化：CLI 的 stdio 对端只有 Host，来源由 Host 的可信组件注入。

## 3. 写入路径（唯一 owner）

```text
sendText ────────────┐
createSession.firstInput ──► startPromptTurn(intent.source)
                             │
                             ├─ core: buildPersistedConversationInputIntent
                             │    └─ message.data.metadata.conversationInputIntent.source（权威）
                             │       与 metadata.inputIntent.source（旧种子）
                             └─ 排队：session_input.payload.conversationInputIntent.source
                                      （session-inputs repository 只 patch 该 JSON）
```

- `inputIntentMetadata`（`commands/input-intent.ts`）是 `TurnInputIntentMetadata.source` 的
  唯一组装点；`createSession` 与 `sendText` 都经它固定来源，不允许各层重建字段。
- `editUserQuery` / `retryTurn` 经 `inputIntentMetadataFromCanonical` 继承原 intent 的来源；
  `sendQueuedNow` 经 `inputIntentMetadataFromQueueItem` 继承原 queue item 的来源。
- 排队的 `source` 随 `QueueItem`（`conversationInputIntentSchema.extend`）一起投影；
  live 投影从 `TurnSteerQueued` 事件的 `intent.source` 读取，编辑重发事件缺 intent 时保留
  同项原事实，不读取当前会话补值。
- 队列的编辑 / 重排（`updateSessionInputs`）只 patch 已有 `conversationInputIntent`，
  不会丢来源。

## 4. 冷恢复

- `transcript-hydration.ts` 用 `conversationInputIntentSchema` 校验
  `metadata.conversationInputIntent`；成功时把 `source` 带进 `TurnInputIntentMetadata`，
  经 `event-normalizer` 投影到 `userInput` 行（`source` 字段）。
- 校验失败（例如旧 CLI 读到 `extension`）退回 `metadata.inputIntent` 种子（不校验），
  `source` 原样进入行；这就是共享协议文档 §8 记录的回退行为。
- 冷恢复与 live 必须产出同一份来源；测试以同一条会话的 live snapshot 与重开 snapshot 对比。

## 5. 失败语义

| 输入                                   | 结果                                                         |
| -------------------------------------- | ------------------------------------------------------------ |
| 合法来源（四种 kind）                  | 接受，写入 canonical intent                                  |
| 缺必填字段 / 空 `pluginId` / 多余字段  | `proto.invalidPayload`，整条拒绝，不写任何行                 |
| `createSession.firstInput.source` 非法 | `proto.invalidPayload`，不创建会话（先在创建 record 前校验） |
| 正文长得像来源提示                     | 普通用户输入，不产生来源                                     |
| 未协商能力的旧 CLI                     | 不认识该字段：`sendText` 整条拒绝；`firstInput` 静默剥掉     |

## 6. 验收

- `apps/zcode-cli/packages/bootstrap/tests/v4-extension-input-source.test.ts`：
  - `runtime/capabilities` 声明 `extensionInputSource: true`；
  - `createSession.firstInput.source` 与 `sendText.source` 落库，进入排队项与 `userInput` 行；
  - 冷恢复（重开 server + 新 store）保持三行来源一致；
  - 纯文本输入不产生 `source`；
  - 非法来源（缺 `pluginId`、空 `pluginId`、多余 `toolCallId`）整条拒绝且不产生消息；
  - 用基线 schema 复现旧 App / 旧 CLI 的读取结果（行降级、A 区整帧拒绝、delta 拒绝、
    `firstInput.source` 被静默剥掉）。
- `apps/zcode-cli/packages/bootstrap/tests/v4-native-session-mgmt.test.ts`、`v4-queue-edit-lock.test.ts`：
  命令层字段透传与既有队列编辑锁行为不回归。
