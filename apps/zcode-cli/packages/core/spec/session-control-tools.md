# 模型会话控制工具（session-control）

## 规则

- 模型只看到 `tool` 变体 schema：不含完整会话引用、`callerSessionId`、`callId` 与 `requestId`；请求身份由执行层注入。
- 普通调用用本次 `toolCallId` 作为 `requestId`；模型把上次回执的 `requestId` 放进 `retryOf` 时复用该身份，避免重复建会话或重复发消息。
- 超时或执行中取消会在请求可能已被受理后打断 handler：`describeUnsettledCall` 把同一身份追加到 ToolTimeout/ToolCancelled 错误，模型据此对账而不是另起请求。
- 工具只在可信启动绑定存在且根会话匹配时注册/执行；子代理运行时（`runtimeScope=subagent`）、不同根会话与客户端类调用方一律 `forbidden`。
- CLI 暴露 8 个共有工具；App 另暴露 `ListProjects`、`OpenSession`、`SetSessionArchived`、`SetSessionPinned`，由 `registerBuiltInTools({ sessionControlKind })` 选择同名变体；未指定 kind 时不注册任何会话工具。
- `ListModels` 有 CreateWorkflow 与 CreateSession 两个消费者：灰度关闭但会话控制在场时仍保留。
- 工具只做 schema 校验、facade 调用与结果映射，不读存储、不建 runtime、不发 source/权限字段。

## 状态与接口

- `SessionControlBinding` 由 CLI/App 启动装配构造并注入 `AgentRuntimeDeps.sessionControl`，再经 `sessionControlForRuntime` 收口到根会话。
- 工具执行上下文新增 `sessionControl`；executor 原样传给 handler，不通过模型 JSON 构造身份。
- 共享 DTO、8/12 操作与 wait 规则来自 `@zcode/session-control`。

## 验收

- 工具名集合：CLI 8、App 12，App 是 CLI 超集；同名 PascalCase，避免旧 kind 前缀启发式。
- 只读工具不需要审批；写工具保留审批、结果预算、artifact 与超时策略。
- 子代理/错根/客户端类调用被拒绝且不触达 facade。
- 取消回执包含 `requestId=<注入身份>`。
- 回归：`core/tests/session-control` 24/24 通过。

## 非目标

- 不在工具层保存 ledger/queue、不自动重试已接纳 mutation、不停止目标任务。
