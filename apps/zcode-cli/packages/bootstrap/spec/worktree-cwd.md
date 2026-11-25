# 受管 worktree 作为会话 cwd（协议与 CLI 侧）

状态：已实现（4.0.0 同步波次）。
上游来源：ZCode 4.0.0 `docs/git/worktree.md`（§1.1 / §6.6 / §7.3 / §8.2 / §8.3 / §9.3）；
本仓库只在协议与 CLI 侧承载该能力，worktree 的创建 / 删除由 Host 的 `managed-worktree-tasks`
服务负责（见 `packages/services/src/managed-worktree-tasks/CONTRACT.md`）。

## 1. 问题

Host 需要让一个会话在「项目主目录之外、但仍属于该项目」的受管 worktree 中执行：

- workspace **身份**（`workspaceKey` / `workspaceIdentity`）仍属于项目，决定权限、记忆、
  Hook Trust、MCP 授权、会话索引归属；
- 执行**路径**（`cwd`）是 worktree，决定文件读写、Bash cwd、Git 操作与路径展示。

上游协议此前把二者绑定在同一个 `workspacePath`，Host 无法表达该组合；旧 CLI 会静默丢弃
`createSession.cwd` / `forkAssistant.targetCwd`，Host 会误以为已生效。因此必须先做能力协商。

## 2. 能力协商

`runtime/capabilities` 新增：

| 位 | 语义 |
| --- | --- |
| `worktreeCwd: true` | CLI 认识 `createSession.cwd` / `createSession.worktreeCreation` / `forkAssistant.targetCwd`，并按 Host 请求的 workspace key + 持久化 cwd 冷恢复。 |
| `conversationQuoteComment: true` | CLI 认识对话引用的 `comment` / `agent` 字段，并随模型材料下发。 |

两者都是 optional（旧 Host 的结果 schema 非 strict）。Host / services 必须用 `=== true`
判断后才发送对应字段；缺失等价于不支持，worktree 入口关闭、批注入口关闭（fail-closed）。

`fork_target_workspace` 从未在 KayingCode 产品中存在，不新增该位。

## 3. 请求面

- `createSession.cwd?: string`：只允许本地 workspace。`workspaceId` 仍是项目 key。
- `createSession.worktreeCreation?: WorktreeCreationRecord`：与 `cwd` 同时出现；
  仅缺 `cwd` 时在创建 record 之前以 `proto.invalidPayload` 拒绝。
- `forkAssistant.targetCwd?: { cwd, childSessionId, worktreeCreation }`：
  子会话留在同一 workspace / 同一 CLI 进程，`cwd` 换成新 worktree；`childSessionId`
  由 Host 预分配，幂等仍以 `(parent, sourceCommandId)` command fact 为准。
- `session/releaseUnderDirectory`：参数 `{ directory }`，结果
  `{ released: string[], busy: string[] }`，随 `worktreeCwd` 能力提供。

`worktreeCreation` 形如 `{ path, sha, ref: string | null, output }`；CLI 把它落盘为
timeline part（`timelineType = "worktree_creation"`，首轮前或 fork 分隔标记之后），live
投影为 `worktreeCreated` 时间线标记，冷恢复从 transcript 重建同一标记。
它不进入模型上下文（`providerVisibility = hidden`）。

## 4. cwd 校验与归属

1. **本地限定**：`workspace.workspaceIdentity` 非空或 key 以 `remote:` 开头时，
   `workspaceRefWithCwd` 抛 `WorktreeCwdLocalOnlyError`（`guard.worktreeCwdLocalOnly`），
   在创建 record / 读取历史之前拒绝。
2. **身份不变、路径替换**：`workspaceRefWithCwd(workspace, cwd)` 返回
   `{ workspaceKey, workspacePath: cwd }`；`projectID` 由路径派生，权限 / 记忆 / Hook Trust
   使用 workspace key。
3. **fork 权限迁移**：`targetCwd` 下子会话的 session 级 `allow` 规则带绝对路径，不跨目录继承；
   `deny` / `ask` / `mode` / `scope` / `version` 原样保留（只收紧，不放宽）。
4. **冷恢复归属**：`isLocalSessionDirectoryInWorkspace` 是唯一判定：
   - 与 workspace 是同一真实目录（realpath，吸收 Host key 的大小写差异）；
   - cwd 是受管 worktree，严格 resolver 映射回该真实目录；
   - cwd 是已删除的受管 worktree 时，才用创建时持久化的 `projectID` 兜底。
   `projectID` 是有损 slug，不能作为一般的归属证明；两个不同目录 slug 相同时必须拒绝。
5. **冷恢复执行路径**：Host 请求携带的本地 workspace 只提供身份（key）；请求路径与持久化
   session 目录指向同一目录时沿用请求路径，不同时执行路径取持久化目录（cwd 创建后不变）。
   因此 worktree 会话在主目录 attach 时仍在 worktree 执行。

## 5. `session/releaseUnderDirectory` 语义

Host 删除受管 worktree 前要求 CLI 卸载 cwd 位于该目录内的驻留会话：

- 选择与忙闲都以**本进程驻留表**为准（包括 Host 镜像尚未同步的同目录 fork 子会话）；
- 忙 = 驻留阻塞工作 / 待处理交互 / 排队命令任一项；**任一会话忙时全部不卸载**，
  返回 `{ released: [], busy }`；
- 判断与开始卸载之间没有 await；之后的新命令由 Host 删除租约拦截；
- 只做驻留去激活（deactivate），不删除持久会话、不发 `session.removed`；
- 目录内没有驻留会话时返回 `{ released: [], busy: [] }`。

## 6. 陈旧 / 缺失 cwd

- 会话持久化的 cwd 已删除且 worktree 布局无法证明归属时，只有 `projectID` 与 workspace
  一致才允许恢复；否则 `project.session-lineage-invalid`。
- Host 未携带 workspace 时按存储的 `workspaceID` / 目录重建（旧行为）。
- 普通目录不能借用项目 key 绕过归属校验。
- CLI 不猜测 worktree 布局：解析与校验复用 `@zcode/shared/managed-worktree` 与
  `@zcode/adapters/config` 的 `classifyLocalSessionDirectory`。

## 7. 会话索引

目录扫描看不到 worktree 会话。`sessions-index` 订阅新增可选 `worktreeSessionIds`：
Host 从 tasks-index 精确提供 id，CLI 只读校验归属后补入摘要，不改写任何存储字段。
worktree 被删除后，`projectID` 兜底仍允许该 id 列出。

## 8. 桌面 / 手机交付

- Desktop：`desktop-continuous` 与本地 Host 直接使用上述字段；worktree 创建 / 删除由
  Desktop Host 服务执行，CLI 只负责会话 cwd 与卸载。
- 手机 / Web：远控连接到桌面已有 Host，复用同一 attachment 与运行时；协议新增字段
  （`worktreeSessionIds`、`worktreeCreated` 标记）随 `web-remote-replayable` 快照下发。
  手机端不创建 worktree，也不调用 `session/releaseUnderDirectory`；收到未知字段时按
  optional 忽略。
- 旧 CLI 与新 Host 配对：能力位缺失，Host 隐藏 worktree 入口；新 CLI 与旧 Host 配对：
  CLI 不发送、不要求新字段，行为退化为普通目录会话。

## 9. 验收

- `bootstrap/tests/v4-worktree-cwd.test.ts`：能力位、createSession.cwd、首轮标记落盘、
  冷恢复归属（大小写 / 已删除 worktree / slug 冲突）、forkAssistant.targetCwd、索引补列。
- `bootstrap/tests/session-release-under-directory.test.ts`：只卸载目录内空闲会话、
  忙时全部不卸载、空目录。
- `bootstrap/tests/v4-native-session-mgmt.test.ts`、`v4-native-fork-edit-retry.test.ts`、
  `selection-side-chat-sqlite-fork.test.ts`：命令层字段透传与拒绝路径。
- `core/tests/session-fork-target-cwd.test.ts`：fork child 的 cwd / projectID / 权限迁移 /
  标记顺序。
- `core/tests/worktree-creation-timeline.test.ts`：只记录一次、首轮落盘一次。
- `adapters` 的 `classifyLocalSessionDirectory` 由上述冷恢复用例间接覆盖。
