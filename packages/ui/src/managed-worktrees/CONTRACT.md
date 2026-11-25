# managed-worktrees（UI）

受管 worktree 的 renderer 展示层。服务层契约见 `packages/services/src/managed-worktree-tasks/CONTRACT.md`；本文件只约定 UI 的职责、数据来源与失败语义。

## 1. 状态所有权：服务是唯一事实源

UI **不写** worktree 状态，也不推算创建阶段、任务归属或 worktree 目录事实。

| 事实                                          | 唯一所有者                                  | UI 读取方式                                                         |
| --------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- |
| 正在进行的创建记录                            | 本机 Host 内存（`IManagedWorktreeService`） | `listCreations()` + `onDidChangeCreations`                          |
| 一次创建结束                                  | 本机 Host                                   | `onDidSettleCreation`                                               |
| worktree 目录 / HEAD / 分支 / dirty / missing | Host 的 git 事实                            | `listWorktrees({projectId})`                                        |
| worktree 上挂的任务                           | tasks-index 投影                            | `listWorktrees` 返回的 `tasks`                                      |
| 入口是否可用                                  | 项目 CLI 的 `capabilities.worktreeCwd`      | `supportsWorktreeCwd()` + `gitService.getWorkspaceRepositoryInfo()` |

UI 只保存三类本地状态，均不是 worktree 事实：

- 订阅到的最新快照（`creations`、`groups`）；
- 读取中 / 读取失败的展示状态；
- 用户界面状态（当前查看的创建记录、管理弹窗是否打开、composer 里草稿 worktree 起点）。

删除、重试、继续本地、放弃、清理缺失记录都只调用服务方法；成功后**重新读取**快照，不在本地删行或改行。测试 `no optimistic list mutation` 守住这条规则。

## 2. 快照与事件顺序

### 创建记录

1. 先订阅 `onDidChangeCreations`，再调用 `listCreations()`。
2. 订阅后收到的第一条推送优先：若推送早于 `listCreations` 返回，丢弃读取结果（`pushed` 标记），避免旧快照覆盖新状态。
3. `onDidSettleCreation` 表示一次创建结束。结束事件可能先于新的创建列表推送到达，调用方需要从**当前列表**读取最后一份记录再做交接；UI 不自行构造结束状态。
4. 创建记录只在 Host 内存中，重启后不存在；UI 不持久化创建记录。

### worktree 列表

- 没有 `onDidChangeWorktrees` 事件。列表在以下时机重新读取：
  - 组件挂载 / `projectId` 或服务实例变化；
  - 创建记录集合变化（`creating` 标记随创建开始/结束变化）；
  - 创建结束事件；
  - `broadcastService` 的 `state:projects`（删除、任务归属等 Host 侧变更）；
  - 删除或清理成功后。
- 重新读取期间保留上一次结果（`loading` 单独表达），避免列表闪空；读取失败保留旧结果并展示错误。
- 不允许按 cwd、目录名或任务列表缓存反推 worktree 归属；任务行只读 `listWorktrees` 的 `tasks`。

### 过期代次（stale generation）

- 每次重新订阅（服务实例变化、`projectId` 变化、effect 重跑）视为新一代；订阅前的异步读取结果不得写入新一代。
- 读取结果只在“发起请求的代次 === 当前代次”且“期间没有更新的推送/读取”时采纳；迟到的旧结果直接丢弃。
- 同代次内多次手动刷新用单调序号收敛：只采纳最后一次请求的结果。
- 组件卸载或订阅释放后，任何未完成的 Promise 都不得写入状态。

## 3. 能力门控（capability gating）

- 入口可见：本地 workspace、非 office 模式、当前草稿属于项目、且 workspace 是 Git 仓库（`gitService.getWorkspaceRepositoryInfo` 的 `kind !== "not-repository"`）。
- 入口可用：在可见基础上，`supportsWorktreeCwd({workspacePath, workspaceIdentity?})` 为 `true`。
- `supportsWorktreeCwd` 在当前 CLI 协议波次落地前固定返回 `false`：入口保持可见但 **disabled**，tooltip 解释“当前 Agent 版本不支持 worktree”；不能隐藏入口，否则能力翻转时用户无从发现。
- 能力查询失败按不可见处理（保留原有普通新建/分叉路径，不阻断对话），与上游一致。
- 远程 workspace（`workspaceIdentity` 非空或存在 `remoteSessionId`）不展示 worktree 入口；worktree 只属于本机 Host。
- 能力翻转（`false → true`）只依赖一次重新查询的结果；UI 不缓存跨 workspace 的能力值，也不在本地推断。

## 4. 删除失败语义（fail closed）

`removeWorktree` 失败时 UI 不改列表、不重试、不降级为强制删除，只按结构化 `code` / `detail` 展示本地化原因：

| code                   | detail     | UI 文案                                          |
| ---------------------- | ---------- | ------------------------------------------------ |
| `worktree-dirty`       | —          | worktree 有未提交改动                            |
| `worktree-in-use`      | `running`  | 有任务正在运行（会话驻留，不是可重试的瞬时错误） |
| `worktree-in-use`      | `terminal` | 先关闭该目录下的终端                             |
| `worktree-in-use`      | `creating` | worktree 仍在创建中                              |
| `worktree-in-use`      | `tasks`    | 有任务正在使用该 worktree                        |
| `worktree-in-use`      | `removing` | 该 worktree 正在被删除                           |
| `release-unsupported`  | —          | 当前 Agent 版本无法卸载驻留会话，worktree 已保留 |
| `session-close-failed` | —          | 卸载使用该 worktree 的任务失败，worktree 已保留  |
| `not-managed`          | —          | 目录不是受管 worktree                            |
| `git-failed`           | —          | Git 操作失败                                     |
| 其他                   | —          | 通用失败文案 + 诊断 detail                       |

- `worktree-in-use` 的语义是“有会话/终端/创建驻留”，UI 明确说明原因，**不提供重试按钮**，也不自动强制删除。
- 只有“没有任务使用且有改动”的残留 worktree 才允许在确认后带 `force` 删除；确认框写明改动会丢弃。有任务使用时有改动直接禁用删除。
- 创建中的 worktree 不显示删除（由创建记录的“放弃”处理）。
- 缺失（`state === "missing"`）的 worktree 只提供“移除记录”（`pruneWorktrees`），不执行删除。

## 5. 创建记录 UI

- `phase === "creating"`：显示“正在创建 worktree”，可展开 git 输出。
- `phase === "starting-session"`：显示“正在启动任务”。
- `phase === "failed"`：显示结构化错误与 detail，并提供：
  - `retryCreation`（重新创建或只重做会话创建，由服务决定）；
  - `continueWithoutWorktree`（仅 `kind === "new-task"`，改在主目录创建会话）；
  - `dismissCreation`（删除残留并放弃；首条消息由 settlement 交还草稿）。
- 操作进行中禁用全部按钮，避免重复提交；失败只 toast，不改创建记录。
- 创建行/卡片只渲染 `listCreations` 的记录，阶段与进度不做本地推算。

## 6. 桌面与移动端交付差异

- `managed-worktrees` 只绑定**本机 base services**（`useOptionalBaseWorkspaceServices()`）。当前 tab 是远程 workspace 时，`useServices()` 指向远端，不能用于 worktree 订阅。
- Desktop：本机 Host 通过 `desktop-continuous` 实时推送创建记录与结束事件；列表按需重新读取。
- 手机 / Web 远控：没有本机 Host 的 `managedWorktreeService` 时所有入口不渲染，列表为空；手机不能创建或删除 worktree。手机看到的“已创建 worktree”历史项来自 CLI 写入的时间线，与桌面同源，不需要额外通道。
- 远端 workspace 的 worktree 事实属于远端 Host；本模块不跨 Host 读取，也不把本机 worktree 列表套用到远端路径。

## 7. 产品适配与已知缺口（本波次）

- 上游把草稿 worktree 选择、创建记录查看、handoff 放在 session store（`draftWorktree`、`draftWorktreeCreationId`、`worktreeHandoff`）。本产品本波次不改 session store 的草稿字段，因此：
  - composer 的 worktree 开关仍由 Shell 局部状态持有；`ManagedWorktreeComposerEntry` 每次渲染把这份受控值投影到 `worktreeDraftSelection`（模块内、只读订阅、单一写入者），SessionPane 的发送路径在点击时同步读取。投影跟随开关展示，Shell 在新草稿时不清空，因此新草稿沿用上一次勾选状态（上游是每个新草稿重置为关闭），这是 Shell 侧的待修缺口。
  - 创建记录的“查看”仍由模块 Provider 的局部状态持有；
  - 会话首个快照到达前的 handoff 覆盖层未接入。会话启动后由 settlement 在 store 里选中新会话，首个快照到达前主区仍可能短暂空白。
- 产品 `KayingCodeTaskMeta` 尚未声明 `worktreeRoot` / `cwd`（services 的 `ProjectTask` 投影已暴露）。任务行、Header 与 fork 目的地的 worktree 标识改为读取 `listWorktrees` 的任务归属，按 `workspaceIdentity + workspacePath + taskId` 匹配，不按路径匹配（`useTaskWorktreeEntry`）。
- 上游 `ForkDestinationMenu` 由 assistant 行直接渲染；产品行组件只有单一 fork 动作，本波次把两个目的地的菜单语义下沉到 `ForkDestinationMenu`，由 SessionPane 在点击时按指针位置/焦点元素渲染（§8）。上游 `useTaskWorktreePlacement` 的 cwd 与只读派生（worktree 被删除后任务只读）未接入，本波次只用任务归属判断“父任务是否在 worktree 中”。
- 上游共享 test-id 常量（`TID_WORKTREE_*`、`TID_TASK_ROW_WORKTREE_ICON`）在产品 `@zcode/shared/test-ids` 中不存在；本模块导出本地 `managedWorktreeTestIds`，待共享层补齐后再切换。

## 8. 创建发起、分叉与交接

### 8.1 信封所有权（谁构造）

- 新任务的 `createSession` payload 由 `worktreeCreationActions.ts` 的 `buildDraftCreateSessionPayload` 组装，信封由 `@zcode/v4` 的 `createCommandEnvelope` 生成。SessionPane 的普通首发与 worktree 首发**共用同一 builder**（`workspaceId` + `firstInput{text,attachments,modelSelection,mode,planEnabled}` + 草稿 `config`），不允许出现第二种形状。
- SessionPane 只负责点击时的用户意图（正文、已就绪附件、Submission、ref）与把 `startNewTask` 交给本机 Host；worktree 创建、会话创建、首条消息发送都由 Host/服务编排。renderer 不拼 `cwd`、`worktreeCreation`、`additionalDirectories`，也不预写任务行。
- worktree 模式下 slash 命令没有语义，发送直接 `blocked`（不进入 goal/compact 解析），草稿保留。
- 入口能力：`supportsWorktreeCwd` 为 false 时入口可见但禁用；发送路径不重复查询能力，服务返回 `unsupported-agent` 时 toast 并保留草稿。

### 8.2 失败与幂等

- 双击/并发发送只提交一次创建：per workspace + kind 的同步 in-flight 占位（`beginWorktreeInitiation`）在 RPC 返回前拒绝第二笔；composer 的 `pending` 与创建视图覆盖是另外两层保护；服务端再按 `commandId` 幂等兜底。
- `startNewTask` / `forkToWorktree` 返回 `ok:false` 或 transport 抛错：toast 结构化错误，返回 `blocked`，composer 回滚草稿；不写入任何本地创建状态。
- 发起成功后只做两件事：登记结束事件归属（`recordWorktreeCreationIntent`，模块内、按窗口隔离）与把主区切到该创建记录（`viewCreation`）。创建阶段、进度、错误全部来自 `listCreations`。

### 8.3 结束事件与交接顺序

1. `onDidSettleCreation` 到达（可能早于新的创建列表推送）。
2. Provider 用 `creationId` 消费本窗口登记的 intent；未命中（其他窗口发起、已消费、非本机发起）直接忽略——这是 stale settlement 规则。
3. `session-started`：调用 session store 的 `setActiveTaskId(workspacePath, sessionId, workspaceIdentity)` 选中新会话（store 是选择态的唯一 owner；Shell 的 `activeTaskId` 由它派生）。`dismissed`：把 `promptText` 通过 store 的 `requestComposerTextInsert` 放回当前草稿，不自动发送；fork 的 `dismissed` 没有 `promptText`，不做草稿改写，界面留在父会话（上游会另开草稿，本产品不额外导航）。
4. 之后重新读取 worktree 列表；创建记录已从 Host 移除，创建视图随列表消失自动退出。

### 8.4 草稿清空与回填

- composer 只在发送结果 `"sent"` 时清空本次提交的正文/附件/引用；worktree 首发在 Host 受理（`startNewTask` 返回 creationId）后才返回 `"sent"`，因此**清空发生在发起 accepted 边界**，不依赖 settlement。
- `session-started` 不再改写草稿（正文已被发送边界清空）；`dismissed` 只回填 `promptText`，附件已作为 ready ref 交给 Host，失败后不重建上传态。
- `dismissed` 的 `promptText` 是序列化后的首条消息（含上下文尾块），回填到输入框时按纯文本展示；这与上游一致，产品若需要结构化回填需另立规格。
- 创建进行中不写入乐观列表；失败行只由 Host 记录渲染，UI 不增删。

### 8.5 分叉与权限迁移边界

- 行内 fork 入口在 worktree 入口可见时先选目的地（原地 / 新 worktree）；worktree 入口不可见（非 Git 仓库、远程 workspace）时保持一键原地分叉。
- `forkToWorktree` 的信封与原地分叉完全同形：`forkAssistant` + `{ target }` + 当前投影的 `baseRevision` / `baseLogEpoch`；Host 建 worktree、预留子任务并注入 `targetCwd` 后再转发给项目 CLI。
- renderer 不携带任何权限字段（permission scope、mode、迁移意图）；fork 子会话的权限继承/迁移属于 CLI/runtime 边界，本模块只保证“与原地分叉同一 CAS 语义”。
- 父任务是否已在 worktree 中只由 `listWorktrees` 的任务归属派生（§7），不向共享协议增加 `worktreeRoot` / `cwd` 字段。
