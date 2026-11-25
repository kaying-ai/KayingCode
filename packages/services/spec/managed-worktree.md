# 受管 worktree 的 Host 装配

上游 4.0.0 规格：`docs/git/worktree.md` §2.1、§3.3–§3.6、§3.11–§3.12、§5、§6.6.1、§8。仅本地桌面 Host；
手机 attachment 与远端 Source Server 不放行 `managed-worktrees` 通道。

## 状态所有者

- **worktree 是否存在**：`git worktree list --porcelain` + 受管目录布局
  （`<dataBaseDir>/.kayingcode/worktrees/<4位hex>/<仓库名>`）。Git 仓储（`git/managed-worktree`）不缓存、
  不持久化副本；`fork` 带入改动时补丁文件前缀为 `.kayingcode-carry-*`。
- **任务与 worktree 的归属**：tasks-index `tasks.worktree_root`（列与部分索引
  `idx_tasks_host_worktree`）。`root_path` 是任务 cwd；worktree 任务的 `workspace_path` 仍是项目主目录。
  只由 `ProjectRepository.reserveCreatedTask` 在首次预留时写入一次。
- **正在进行的创建**：`IManagedWorktreeService` 内存中的创建记录，是创建视图的唯一数据源；
  renderer 只订阅 `onDidChangeCreations`，不自行推算阶段。
- **删除租约**：`createWorktreeRemovalGate()` 的内存租约。同一实例必须交给 Agent 服务
  （会话命令、冷订阅）、终端服务（新建终端）与 worktree 服务（删除），一台机器只有一个本地 Host。
- 远端 identity（`workspaceIdentity`）不进入受管 worktree：本地判断统一用
  `workspaceIdentity?.trim() || workspacePath`，禁止只按路径匹配远端任务。

## 创建与准入顺序

1. `startNewTask` / `forkToWorktree` 先按原命令 ID 同步登记创建记录（去重并发重放），再异步执行。
2. `git worktree add` 分配 bucket 后立即回写 `worktreePath`，供中断清理与"创建中"占用检查。
3. worktree 建好、会话命令发出之前，`reserveCreatedTask` 先写任务行：workspace = 项目主目录，
   `cwd`/`worktree_root`/附加目录一次固化（附加目录按 §2.1 映射到 worktree 内，起点不存在的目录不加入）。
4. 再以 Host 可信身份发送 `createSession`（payload 带 `sessionId`、`cwd`、`worktreeCreation`）或
   `forkAssistant`（payload 带 `targetCwd`）。这些字段只允许本 Host 的 worktree 服务设置
   （`HOST_WORKTREE_COMMAND` 标记），RPC 调用方无法伪造。
5. 会话命令被接受 → settlement `session-started`；被拒绝 → 记录 `failed`，worktree 保留供重试。

## 恢复与幂等

- 每次重试/放弃/不使用 worktree 之前，先按最后一次发出的 `{sessionId, commandId}` 向 CLI `commands/query`
  确认裁决：已执行则按已启动结束；返回 `queryUnavailable` 或查询请求失败则抛
  `worktree.command-unconfirmed`，不接受超时推断；确认未执行才撤销预留、换新的 sessionId/commandId。
- `releaseReservedTask` 有三种结果：`released`（已撤销）、`absent`（没有行或已撤销）、`kept`
  （行已有 CLI 事实，任务真实存在）。只有 `kept` 表示会话已存在；不能因返回 falsy 就强删目录。
- 放弃时先撤销预留，再请 CLI 卸载 worktree 内驻留会话，最后 `git worktree remove --force`。
- worktree 已在创建记录里时，管理弹窗删除返回 `worktree-in-use/creating`。
- 删除顺序固定：同步取得租约 → `settle()` 等待已通过闸门的会话操作 → 读任务行 → 检查终端 →
  （非 force）检查 dirty → 请 CLI 卸载目录内会话 → `git worktree remove` → 释放租约。
  任一检查拒绝都不留下"会话已被卸载"的副作用。

## 协议门禁（worktreeCwd / session/releaseUnderDirectory）

产品 CLI/协议已提供两项能力，Host 侧由 `kayingcode-agent/worktreeCwdSupport.ts` 统一收口：

- **能力探测**：`runtime/capabilities.worktreeCwd`，只认严格 `=== true`。缓存键是具体
  `KayingCodeProtocolClient` 物理连接（`WeakMap`），同一连接只探测一次；探测失败（-32601、超时、
  解析失败）不缓存并返回 false，下一次发送重新探测。`getClient` 在 CLI 换代后返回新连接，
  结果随之重算。连接/探测失败一律 fail closed（`supportsWorktreeCwd` 返回 false），
  UI 据此禁用入口，Host 也不向旧 CLI 发送 `cwd` / `worktreeCreation` / `targetCwd`。
- **目录级卸载**：`session/releaseUnderDirectory { directory }` → `{ released, busy }`。
  `releaseSessionsUnderDirectory` 只使用已存在的 CLI 进程（没有进程 = 没有驻留会话，返回空结果，
  绝不为卸载拉起 CLI）。会话选择与忙闲以 CLI 驻留表为准：任一会话忙时 CLI 返回
  `released: []` + `busy: [...]`，不卸载任何会话。传输/协议失败收敛为 typed failure
  （`KayingCodeWorktreeReleaseFailedError`，code `KAYINGCODE_WORKTREE_RELEASE_FAILED`），
  原始错误只保留在 `cause`，不把异常当成“无驻留会话”。
- **删除占用判定**：`removeWorktree` 在取得删除租约并 `settle()` 后调用卸载。`busy.length > 0`
  返回 `{ ok: false, error: { code: "worktree-in-use", detail: "running" } }`，**不删除目录**；
  强制删除时只要有会话被卸载（`released.length > 0`）也返回 `worktree-in-use/tasks`。
  卸载抛 typed failure 时映射为 `session-close-failed`，目录同样保留。只有 `busy.length === 0`
  才继续 `git worktree remove`。`not-managed`、`worktree-dirty`、`git-failed`、
  `session-close-failed` 语义不变。
- **过期结果**：能力探测结果绑定物理连接，不跨连接复用；卸载结果即时消费、不缓存，
  仅在持有删除租约期间作为删除依据。租约释放后到达的旧结果不会授权任何删除。

## 信封字段（受管 worktree）

- `createSession`：payload 带 `sessionId`、`cwd`、`worktreeCreation`；`forkAssistant`：payload 带
  `targetCwd`。只允许本 Host 的 worktree 服务设置（`HOST_WORKTREE_COMMAND` 标记），
  RPC 调用方传来的 JSON 无法伪造 Symbol 键。`sendConversationCommandV4` 用已声明的
  `commandPayloadSchemas` 解析后再判定 `targetCwd`，不再从原始 payload 猜测。
- **冷恢复命令**：`sendConversationCommandV4` 为本地 workspace 的 V4 命令信封注入
  `workspace`（`buildWorkspaceRef`，含 workspaceKey）；远程 identity 或 `remoteSessionId`
  不注入。rename/delete 等会话级命令在 runtime 卸载后先到时，CLI 才能按 workspace key
  而不是存储的 cwd 恢复 worktree 会话身份。
- **sessions-index 订阅**：本地 workspace 从 tasks-index 读取 `worktree_root` 非空的会话 id，
  以 `worktreeSessionIds`（最多 `MAX_LEGACY_TASK_IDS_PER_SUBSCRIBE`）随 `conversationSubscribe`
  下发；目录扫描看不到的 worktree 任务由此补出冷摘要。读取失败只记 warn，不影响普通任务列表；
  远程 identity 不读取该字段。

## 持久化边界

- tasks-index 是唯一任务事实库；`worktree_root` 由迁移 `0010_task_worktree_root` 添加，旧行全部为 NULL。
- `resolveSessionDirectories` 对 worktree 任务返回 `{ workspacePath: workspace_path, cwd: root_path }`；
  其他任务两者相同。`readTaskCwd` 只返回本 Host 的行，不回退 workspace。
- fork 的任务行继承父行的 `worktree_root`、`root_path` 与 `execution_directories`：
  ACK 预留（`prepareForkCreation`）与 CLI 首次事实（`admitTaskIdentity`）两条写入路径共用
  `readInheritedWorktreePlacement`，避免子任务丢失 worktree 标记。
- `ProjectTask`（项目任务投影）在 services 层附加可选的 `cwd` / `worktreeRoot`；共享
  `KayingCodeTaskMeta` 尚未声明这两个字段，UI 波次可直接消费该投影或在共享类型补字段。
- 删除租约、创建记录、git 列表都不落库，重启后由 CLI 事实与 `git worktree list` 重建。

## UI 将消费的契约（本轮不实现 UI）

- RPC 通道 `ServiceChannels.ManagedWorktrees`；服务方法见
  `packages/services/src/managed-worktree-tasks/contract.ts`：`startNewTask`、`forkToWorktree`、
  `retryCreation`、`continueWithoutWorktree`、`dismissCreation`、`listCreations`、
  `onDidChangeCreations`、`onDidSettleCreation`、`listWorktrees`、`removeWorktree`、`pruneWorktrees`、
  `listStartRefs`、`isWorktreeAvailable`、`supportsWorktreeCwd`。
- 任务 cwd / worktreeRoot 的 UI 投影：services 的项目任务投影已带可选 `cwd` / `worktreeRoot`；
  `listWorktrees().groups[].worktrees[].tasks` 给出按 `worktree_root` 精确匹配的任务归属。
- `supportsWorktreeCwd` 按物理 CLI 连接探测 `runtime/capabilities.worktreeCwd`，只有明确声明才返回
  true；未声明、探测失败或连接不可用时返回 false，UI 据此禁用入口。旧 CLI 会静默丢弃
  `cwd`/`targetCwd`，Host 不能盲发。`releaseSessionsUnderDirectory` 通过
  `session/releaseUnderDirectory` 交给 CLI 判定忙闲，失败为 typed failure，删除按
  `worktree-in-use` / `session-close-failed` fail closed。

## 验收

- 装配后 `ServiceCollection` 暴露 `IManagedWorktreeService`，且终端服务与 Agent 服务共享同一删除租约。
- create → list → recover：真实 git 仓库建 worktree，`listWorktrees` 归类为 `ok`；删除目录后为 `missing`；
  受管目录外的 worktree 不出现在列表。
- trust identity：受管 worktree 内的 workspace 归一到源仓库；远端 identity 保持 host 命名空间。
- 协议门禁：capability 只在严格 `worktreeCwd === true` 时为 true，缺省/非布尔/探测异常为 false，
  失败不缓存；`session/releaseUnderDirectory` 透传 `{released, busy}`，传输失败为 typed failure；
  删除在 `busy.length > 0` 时返回 `worktree-in-use/running` 且不执行 `git worktree remove`。
- 信封与列表：本地 rename/delete 命令信封带 `workspace`（远程不注入）；sessions-index 订阅带
  tasks-index 中 `worktree_root` 非空的 `worktreeSessionIds`，普通任务 id 不混入。
- `pnpm --filter @zcode/services exec tsc --noEmit -p tsconfig.json` 与
  `pnpm --filter @zcode/services test` 通过（既有 Windows sqlite EBUSY 失败除外，单独报告）。
