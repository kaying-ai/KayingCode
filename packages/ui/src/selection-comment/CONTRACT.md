# 选区注释

一条注释 = 一段被选原文 + 可选评论。本模块提供注释输入/编辑浮层、正文编号标记与共用的编号气泡；
调用方（`v4/ConversationSelectionTooltip.tsx`）冻结被选原文、文字锚点与浮层位置，评论随同一条对话引用的
`comment` 发给模型。

不变量：

- 浮层不跟随 `useTextSelection` 的选区状态：聚焦输入会折叠正文选区并触发 keyup/selectionchange，跟随会在键入第一个字时关闭。
- 评论可选：新增时空评论 = 只加原文；编辑时清空评论 = 回到只保留原文，不删除注释。删除只由编辑态“删除注释”或列表垃圾桶触发，并给 6 秒撤销。
- 保存值已 trim；输入法组字中的 Enter 不保存，Shift+Enter 换行，Esc/取消/点击浮层外由调用方关闭。
- `onSave` 返回 false（注释条数或总长已满）时浮层不关闭、输入保留，调用方通过 `error` 显示本地化原因。
- 正文标记只读文字锚点还原出的 Range 画在消息层覆盖层上，不改行组件；还原失败（行未挂载、文字已变）就不画。编号 = composer 列表位置。
- 入口能力由 `useSelectionCommentSupport` 决定：只有当前 workspace 的 CLI 在 `runtime/capabilities` 声明 `conversationQuoteComment` 才显示“注释”与编辑入口；查询失败、旧 Host 或远端未实现一律隐藏。
- 不持有引用作用域或草稿；去重、条数上限、rewind 剪枝、撤销恢复与已发送记录归 `lib/conversationSelectionReference.ts`。

依赖 `ui` 的按钮、toast、i18n 与选区浮层定位 hook。行为依据：[选区注释](../../../../docs/ui/conversation-selection-side-chat.md)。

## 产品集成说明（KayingCode）

上游为 `ZCode`，本仓按品牌与本仓运行时适配，语义与上游一致：

- i18n 使用 `useKayingCodeIntl`；本模块与注释入口的文案集中在 `selectionComment.*` 命名空间
  （`packages/ui/src/i18n/locales/{en-US,zh-CN}.ts`）。既有 `chat.selections.*` 键保持原状，
  只有超限提示复用既有 `chat.selections.limit.{count,single,total}`。
- Agent 服务取自 `useServices().kayingcodeAgentService`；能力探测方法
  `supportsConversationQuoteComment` 来自 `packages/services`（按 CLI 连接缓存、失败按不支持）。
- 状态所有者仍是 `lib/conversationSelectionReference.ts`：
  - 引用作用域（新增/删除/撤销/评论更新/已发送记录）与去重、条数/总长上限；
  - `retainSelectionCommentsWithLiveSource` 的 rewind 剪枝也已落在该文件；本仓
    `useConversationSelectionReferences` 不在本次波次范围，接线为后续独立改动。
  - 编辑/删除/撤销后通过既有 `conversation-selection-add` 事件让 composer 重读存储，
    `detail.scopeChanged = true` 与真正的“新增引用”区分。
- 集成点：`v4/SelectionActionMenu.tsx`（注释入口与 `useSelectionAnchoredPosition`）、
  `v4/ConversationSelectionTooltip.tsx`（浮层、编辑入口、正文标记）、
  `v4/SessionPane.tsx`（能力探测与作用域下发）、`v4/ConversationTimeline.tsx`（参数透传）、
  `v4/ConversationComposer.tsx`（编号列表、编辑入口、发送后记录已发送注释）、
  `v4/composer/ConversationSelectionReferenceChip.tsx`（编号/评论/编辑/删除）。
- 产品既有能力保持不变：工作区 worktree 入口、语音输入、插件入口、回复语言等 composer 控件
  不因注释入口改动，注释入口只占用附件行内 `ConversationSelectionReferenceChip` 与选区菜单。
- 辅助对话（selection side chat）中的选区动作沿用本仓既有门禁（辅助对话不提供选区动作），
  本次不扩大范围。

## 能力门禁

| 条件 | 结果 |
| --- | --- |
| CLI `runtime/capabilities.conversationQuoteComment === true` | 菜单显示“注释”，列表显示编辑/添加评论入口 |
| CLI 未声明、旧 Host | 隐藏注释与编辑入口（`useSelectionCommentSupport` 返回 false） |
| 查询抛错 / 远端未实现 | 同上，按不支持处理（fail closed） |
| Markdown 预览选区 | 不提供注释（`onComment` 只在会话时间线传入） |
