# 项目侧栏模块采纳（project-sidebar）

> 目标：按「整目录归一化采纳」把上游 `packages/ui/src/project-sidebar` 导入本地，
> 让项目行、任务行与项目目录读取成为可复用的 owner，同时不重新接回官方能力。
> 本批次只交付可编译子集；完整侧栏组合等待 U3 状态层、WS2 services 与 U2 v4 composer。

## 范围

- 新增 `packages/ui/src/project-sidebar/`（上游 3c5b2276，跳过 `*.test.ts`）。
- 新增过渡公开入口 `packages/ui/src/project-sidebar/index.ts`（只导出可编译子集）。
- 点状依赖补齐（均为上游归一化后的小改动）：
  - `src/ControlHintTooltip.tsx`：`SidebarTooltipProvider` / `SidebarNativeTooltip`；
  - `src/lib/taskListOrdering.ts`、`src/lib/taskQueryCache.ts`：导出项目行排序/实体键纯函数；
  - `src/lib/remoteWorkspaceServiceError.ts`：`getRemoteConnectionFailureCode`；
  - `src/lib/remoteConnectionPresentation.ts`：展示层接受 Host 快照（含 Remote Agent 变体）；
  - `src/hooks/useServices.tsx`：`useComposerClientNamespace`；
  - `src/store/kayingcodeSessionStoreNavigation.ts`：`onTaskNavigationCommitted` 事件；
  - `src/store/remoteWorkspaceSessionStore.ts`：`RemoteWorkspaceSession` 增补 Source 身份字段；
  - `src/v4/{taskListRowActivity,taskListItemStabilization,windowControllerTaskListRegistry}.ts`：
    导出/目录 revision/activity 投影；
  - `src/app-shell/types.ts`、`src/root/types.ts`、`src/lib/settingsNavigation.ts`：补类型与 section id。
- 新增 Kaying 过渡契约 `src/lib/localrunServiceSurface.ts`（见下）。
- 新增 `remoteOperationProgress.ts`：上游连接阶段投影落在拥有者模块内，避免改写本地连接向导。
- 不接线 Shell：旧 `WorkspaceSidebar` 仍是默认实现。

## 状态所有权

- 项目目录、任务分组、归档与项目排序的权威来源是 Host（`projectService` / `remoteProjectService` /
  `taskGroupService`）；UI 只保存折叠、视图与表单草稿。
- `ProjectDirectoryProvider` 是侧栏与 composer 共享的唯一目录 owner；未接线前不产生第二个 owner。
- `localrunServiceSurface.ts` 只声明「侧栏期望的 accessor 形态」，不复制服务实现：
  `projectService|remoteProjectService|windowProjectDirectory|taskGroupService|sourceServerManagementService`
  与窗口 Controller 的 `getTaskMeta` / `onDynamicTaskUnreadSignal`。运行时字段缺失时组件按
  `project.service-unavailable` 降级，不伪造项目树。
- 官方能力开关仍由 `@zcode/shared` 的 `LOCALRUN_FEATURES` 持有，本批次新增两个本地 stub：
  - `settings/CodingPlanUpgradeDialogProvider.tsx`：默认 `openCodingPlanUpgrade` 返回 false，不渲染购买面板；
  - `sidebar-activity/SidebarBottomActivity.tsx`：默认渲染 `null`，不加载营销 banner / highspeed 分享。

## 交互与失败语义

- 项目行：`ProjectNode` / `ProjectNodeContent` / `ProjectTaskRows` 复用 CONTRACT.md 的折叠、
  项目菜单与任务行契约；任务行已按 U5 补齐 `organizationActions` / `taskRowVariant` /
  `onOpenFileTree` / `providerConfigFile`（见 `project-sidebar-state-layer.md`）。
- 连接进度：`RemoteConnectionProgressSection` 使用 `resolveRemoteOperationProgress`；
  最近一次操作已到终态（ready / error）时按「尚无进度」展示，避免显示上一次的完成态。
- 远程设备名：受管 server 快照与本地 Remote Agent 变体都回退到设备名 / SSH 主机，不显示 token。
- 分组右键菜单：U5 已提供 `organizationActions` 与 provider 配置入口；本地 services 尚未暴露
  `getWorkspaceProviderConfigFile`，`providerConfigFile` 只能由调用方注入，缺省禁用该项。

## 未采纳部分（按依赖阻断）

| 上游文件                                                                     | 阻断原因                                                                   |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `index.tsx`（完整侧栏）                                                      | 本地以 `ProjectSidebar.tsx` 组合同一批子组件，不引入上游整页入口           |
| `ChatRemoteFolderSelection.tsx`                                              | 依赖上游 remote-connection-flow 的目录确认；本地聊天目录仍由 Root 向导持有 |
| `RemoteConversationDisconnected.tsx`                                         | 依赖上游 remote-connection-flow 的断线投影                                 |
| `ProjectSidebarNode.tsx`、`ArchiveManagement.tsx`、`useArchiveManagement.ts` | 设置页 section intent、确认框 `intent` 字段                                |
| `RemoteProjectMenu.tsx`                                                      | 依赖上游 remote-navigation 的自动重连菜单；本地用项目行重连/移除入口       |
| `remote-connection-flow/`（新模块）                                          | 上游整套向导（2000+ 行）与本地上游 `SSHDialog` 未对齐                      |

已采纳并接线：`ProjectCreation`、`ProjectEditor`、`ProjectComposerMenu`、
`RemoteProjectPicker`、`remote-navigation`、`remote-project-connection`、
`useProjectRemoteSync`、`useProjectFileTree`、`project-file-navigation`、
`useProjectTaskNavigation`。`ChatRemoteFolderSelection` 的“连接后选择目录”仍由
Root 的远程向导承担。

## 验收

- `pnpm exec tsc -b packages/ui`：0 error。
- `pnpm --filter @zcode/ui run test`：20 文件 / 96 用例通过（新增 `test/sidebarStateSurface.test.ts`）。
- `pnpm --filter @zcode/web run build`：通过。
- `pnpm --filter @zcode/ui run lint`：0 error（83 warning 与基线一致）。
- 状态层语义与跨包缺口见 `project-sidebar-state-layer.md`。

## 项目跨区置顶拖拽（2026-11-04）

- 侧栏顶部标题显示「置顶」（英文 Pinned），搜索与视图按钮保留。
- Desktop 项目视图中，普通项目可拖到顶部置顶标题/区域，置顶项目可拖回「项目」分区；空置顶区和折叠项目区仍可接收。
- 同区项目继续沿用偏好排序，分区标题拖拽继续只改变分区顺序；任务拖放不作为项目置顶处理。
- ProjectSidebar 的共享 DndContext 是拖拽 owner；PurposeSections 监听同一个 context 处理分区排序，不另建隔离项目的容器。
- pinned 的唯一事实 owner 仍是所属 Host projectService。菜单和拖拽共用显式 setProjectPinned(project, pinned) → saveProject({hostId,id,pinned}) → refresh。相同值不写；在途同一 Host+project ID 不重复提交；失败走已有错误提示并保持权威树。
- 跨 Host 同名/同 ID 项目按 projectKey 路由，绝不按名称、路径匹配。Web 远控/手机不注册项目拖动手势。
- 取消拖动或落在非目标区域不修改数据。落点高亮由当前拖拽派生。

```text
项目指针/键盘拖动 → 单一 DndContext → 项目/分区类型与落点判定
  → ProjectSidebar 保存 pinned → 所属 Host saveProject → refresh 权威树
  → 置顶/普通区重新投影；刷新及重启后继续读取 Host pinned
```

验收：普通→空置顶、置顶→折叠项目区、同区排序、取消、跨 Host 同名项目隔离、刷新保持、手机无项目拖动；使用真实新侧栏组件的浏览器回归，不能仅验证旧 WorkspaceSidebar fixture。

浏览器回归：`node packages/ui/test/projectPinningV2.e2e.mjs`。使用真实 ProjectNode、共享拖拽与分区组件，隔离任务内容和 Host IO；保存/刷新持久化由 fixture 模拟，生产代码复用既有 Host saveProject。

## 拖拽视觉反馈（2026-11-04）

- 项目拖动显示独立、单行的浮动预览：项目名、文件夹图标、远端设备名（可用时），深色/浅色沿用菜单/浮层 token。原项目保留布局并淡化，不把展开后的任务列表整块带走。
- 预览提示由同一 DndContext 的 active/over 派生：跨区显示「松开置顶／松开取消置顶」；同区排序显示「松开放在此处」；区域外显示「移到目标区域」。松手、取消均移除预览。
- 顶部置顶标题和普通项目分区在接收时显示明显的蓝色边框；同区排序沿用实际 before/after 插入线。跨区项目行显示接收边框，避免暗示未实际提交的行间排序。
- DndContext 是临时拖动状态唯一 owner，浮层通过 useDndContext 读取；不新增拖动状态副本或写入路径。保存/刷新语义不变，移动端继续禁用项目拖动。
- 验收必须在鼠标按住时检查预览文本、源行淡化、目标边框与排序插入线，并在取消/松手后检查清理。
