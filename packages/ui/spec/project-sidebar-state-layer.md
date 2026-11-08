# 项目侧栏状态层（U3 / U2 / U5）

> 目标：为 ProjectSidebar Shell 接线准备状态与类型面，不接 Shell、不改 `WorkspaceShellLayout`。
> 上游基线 `3c5b2276`；本批只做 Renderer 状态层与组件属性面。

## 状态所有权

| 状态                         | 所有者                                           | 生命周期                                                      | 持久化                |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------------- | --------------------- |
| `draftProjectId`             | `kayingcodeSessionStore` workspace 桶            | 进入草稿 → 提交/换项目/换 task                                | 否（Renderer 内存）   |
| `draftTaskGroupId`           | `kayingcodeSessionStore` workspace 桶            | 进入草稿 → `clearDraftTaskGroup` / 提交 / 换草稿              | 否（Renderer 内存）   |
| `composerInitialization`     | `kayingcodeSessionStore` workspace 桶            | `setActiveTaskId` 写入 → `consumeComposerInitialization` 消费 | 否                    |
| `groupedDraftTask`（legacy） | `kayingcodeSessionStore` workspace 桶            | grouped 列表 New task 行锚点                                  | 否                    |
| v4 草稿正文/配置             | `v4/composer/composerDraftStore`（localStorage） | 输入 → 发送/清理                                              | 是，按 composer scope |
| workspace → composer scope   | `v4/composer/composerDraftStore`（localStorage） | `rememberComposerWorkspaceScope`                              | 是                    |

约束：

- `draftProjectId` / `draftTaskGroupId` 只表达「未提交草稿的组织意图」；真实归属由 Host 在
  `createSession` / `sendText` 时决定。
- `draftTaskGroupId` 与 legacy `groupedDraftTask.placement` 不互为副本：前者是真实 task group 意图，
  后者是 grouped 列表临时行的 UI 锚点。两者各有独立 setter，禁止在一个 setter 里隐式同步另一个。
- 旧调用方（`groupedDraftPlacement` / `createSource`）继续可用；`startDraft` 同时接受
  `projectId` / `taskGroupId`。

## U3：session store

- `startDraft(workspacePath, provider, workspaceIdentity, { projectId?, taskGroupId?, groupedDraftPlacement?, createSource? })`
  - 写入 `draftProjectId` / `draftTaskGroupId`；
  - 清空 `composerInitialization`；
  - 仅当项目真正变化时递增 `draftRuntimeInvalidationVersion`（同 cwd 可属于多个项目，预热目录范围必须失效）。
- `clearDraftTaskGroup`：只撤销 `draftTaskGroupId`，不动正文、项目与预热。
- `setActiveTaskId(..., composerConfig?)`：显式配置写入 `composerInitialization`；
  重新打开同一 task 保留；切换 task 丢弃。
- `consumeComposerInitialization`：只在仍是同一对象时清除，迟到消费者不能清掉新初始化。
- `CreateTaskOptions.projectId` / `taskGroupId`：只作为 `startDraft` 输入，不在 UI 侧另存副本。

## U2：v4 composer scope

- `resolveComposerScope(projectId, workspaceIdentity, clientNamespace)` →
  `{ clientNamespace, hostId, projectId }`；远程 identity 通过 `remoteHostIdFromWorkspaceIdentity`
  解析，本地为 `"local"`。
- 同目录多项目：`__draft__` 草稿按 scope 写入
  `kayingcode-v4-composer-project-drafts:v1:<scope>`；session 草稿仍用工作区 key。
- `rememberComposerWorkspaceScope` / `readComposerWorkspaceScope`：按 clientNamespace + workspace key
  记忆导航身份；host 不一致或旧版无身份时返回 `undefined`，不从目录猜项目。
- 旧草稿兼容：旧工作区 key 中带相同 `projectId` 的 `__draft__` 草稿可被新项目 key 认领一次
  （`legacyClaimed`），其余旧草稿保持原样，不迁移、不删除。
- `clearV4ComposerDraftTaskGroup`：只删 `taskGroupId`，保留正文与项目。
- `captureV4ComposerDraftHandoff`：优先读编辑器当前值（`registerV4ComposerDraftReader`），
  未挂载时回退到同一 scope 的持久化草稿；附件取当前工作区附件 scope。

## U5：任务行属性

`TaskList` / `TaskListItem` / `useTaskListItemContextActions` 新增：

| 属性                  | 语义                            | 兼容                         |
| --------------------- | ------------------------------- | ---------------------------- |
| `organizationActions` | 右键菜单顶部项目/分组操作       | 可选；缺省菜单结构不变       |
| `taskRowVariant`      | `default` / `timeline` 行布局   | 缺省 `default`               |
| `onOpenFileTree`      | 打开任务文件树，参数为目标 task | 无参回调仍可赋值             |
| `providerConfigFile`  | Provider 配置路径状态           | 由调用方注入；缺省禁用菜单项 |
| `isArchived`          | 归档视图文案「取消归档」        | 缺省 `false`                 |

`useTaskListItemContextActions` 新增 `providerConfigFile` 输入、返回值与
`handleOpenProviderConfig`；文件不存在时回退打开父目录（`resolveProviderConfigOpenTargetPath`）。

## 事件顺序（选择项目后的草稿迁移，下一批接线）

```
ProjectCreation.saved(project)
  → onCreateTask({ projectId, taskGroupId, initialComposerDraft })
  → Root.startNewTaskFromActiveWorkspace
  → store.startDraft(options.projectId/taskGroupId)   // 单一意图写入点
  → rememberComposerWorkspaceScope(workspace, scope)  // 持久化导航身份
  → composer 读取 scope → readV4ComposerDraft(root)
```

## 验收

- `pnpm exec tsc -b packages/ui`：0 error。
- `pnpm --filter @zcode/ui run test`：20 文件 / 96 用例通过（新增 `test/sidebarStateSurface.test.ts` 15 例）。
- `pnpm --filter @zcode/web run build`：通过。
- `pnpm --filter @zcode/ui run lint`：0 error / 83 warning（与基线一致）。

## 仍未完成（跨包）

- WS2 services：`getWorkspaceProviderConfigFile` 与 `IServiceAccessor` 的 project / remoteProject /
  taskGroup / windowProjectDirectory / sourceServerManagement 面；`providerConfigFile` 目前只能由调用方注入。
- Root 接线：`useRootWorkspaceActions` 把 `CreateTaskOptions.projectId/taskGroupId` 传入 `startDraft`，
  并调用 `rememberComposerWorkspaceScope`；本批未改 `root/` 与 `app-shell/WorkspaceShellLayout`。
- U2 附件 scope 仍是工作区级；项目级附件 key 随 composer scope 迁移。
