# 项目侧栏 Shell 接线（project-sidebar shell wiring）

> 批次：WS5 project-sidebar Shell 接线（2026-10-31）。上游基线 `3c5b2276`。
> 目标：ProjectSidebar 成为默认侧栏；旧 `WorkspaceSidebar` 保留为运行期回退。

## 产品规则

- 新侧栏默认启用。显式回退值才使用旧侧栏：
  - 环境变量 `KAYINGCODE_UI_SIDEBAR_V2=0`（也接受 `false`/`off`/`no`），优先于本地存储；
  - 本地存储 `kayingcode:ui:sidebar-v2=0`，用于运行期验证与排障。
- 连接能力由连接方式默认声明，不依赖调用方重复传参：
  - `connectViaWebSocket` 默认声明 `projectService` / `taskGroupService` /
    `remoteProjectService`（Web Host 由 `createLocalServices` 注册）；
  - `connectViaMessagePort` 默认声明同一组项目服务（Desktop 本地 Host 与 Source Server 同源）；
  - `windowControllerService` 仍按 Host 能力：Desktop 默认代理（真实 Controller），
    Web 默认关闭，UI 走 task service 事件降级；`windowProjectDirectory` /
    `sourceServerManagementService` 继续由 attachment 装配显式声明。
- 项目目录是项目行的唯一事实源。`IServiceAccessor` 的窗口目录组或 base
  `projectService` 缺失时，不渲染空项目树：回退旧侧栏并记录
  `[WorkspaceShell] 项目服务不可用，回退旧侧栏`。
- 官方能力保持关闭：OAuth / rewards / coding plan / 官方 marketplace / 官方遥测不进入侧栏；
  Kaying 游戏中心、远程控制（项目设备行/重连入口）与品牌 footer 保留。

## 状态所有权

| 状态                                  | Owner                                                                  | 说明                                  |
| ------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| 项目树、任务归属、分组结构            | Host（`projectService` / `remoteProjectService` / `taskGroupService`） | UI 不补行、不推断归属                 |
| 新任务创建前归属预留                  | Host（`projectService` → `reserveCreatedTask`）                        | CLI 只拿到稳定 sessionId 与固化目录   |
| 项目目录读取与排序/折叠偏好           | `ProjectDirectoryProvider`                                             | Shell 与 composer 共用的唯一 UI owner |
| 草稿项目/分组意图                     | `kayingcodeSessionStore.draftProjectId` / `draftTaskGroupId`           | 仅 Renderer 内存，一次草稿生命周期    |
| 草稿 scope 记忆                       | `composerDraftStore` 的 workspace scope + 项目草稿 key                 | Root 写入，composer 读取              |
| 侧栏视图（projects/grouped/timeline） | `useProjectSidebarPreferences`                                         | 单一浏览器偏好                        |

## 接口

- Shell：`WorkspaceShellLayout` 先解析运行时（`resolveProjectSidebarRuntime`）。
  - `project-sidebar`：`ProjectDirectoryProvider` 包住 Shell，再渲染 `ProjectSidebar`；
  - `legacy`：不引入项目目录 owner，渲染旧 `WorkspaceSidebar`。
- Root：`startNewTaskFromActiveWorkspace` 把 `CreateTaskOptions.projectId/taskGroupId`
  传给 `startDraft`，并在导航前调用 `rememberComposerWorkspaceScope`；
  `startDraftInWorkspace` 同样记忆 scope（显式项目优先，否则恢复该 workspace 上次 scope）。
- Composer：`useDraftConfigControl` 读取 `draftProjectId` 解析 root scope，用项目草稿 key
  读写 `__draft__`；`draftFocusVersion` 进入 scope key，保证 New Task 重新初始化；
  一次性 `composerInitialization` 只在匹配当前 task 时作为草稿种子并在挂载后消费。
- `SessionPane` 用同一 root scope 记录新任务 Recent；正式会话仍使用工作区级 Recent。
  `createSession` 发送前固定 `draftProjectId`，通过
  `sendCommand(envelope, { projectId })` → `sendConversationCommandV4(params.projectId)` 透传；
  项目概念不进入 v4 wire envelope。
- Host：`projectStorage.migrate` 在 `TaskIndexRepo.initialize` 内幂等执行（独立账本，
  不依赖 tasks prepared 标记），创建 `hosts/projects/project_roots/remote_project_entries`；
  Desktop Worker 把旧设置传入项目种子迁移。`prepareSessionCreation` 调
  `reserveCreatedTask`：用 clientId+commandId 派生稳定 sessionId，项目任务在 CLI 创建前
  写入归属；Host 没有项目服务时显式返回 `project.creation-unavailable`。
- 远端目录：`remote-projects` 的 target schema 同时接受 server `url` 变体与历史
  `transport: "ssh-tunnel"` 变体；`remote-agent` identity 的编码 path 按 host 身份原样切分，
  `buildRemoteHostWorkspaceIdentity` 对 remote-agent path 使用编码形态。
- `window-controller`：Web Server 显式注册 unavailable 实现（方法以
  `window-controller-unavailable` 拒绝，动态事件返回永不触发的 Event），避免 EventListen
  挂起；Web 连接默认不代理该服务，UI 使用 task service workspace 事件与 sessions-index 降级。
- `ProjectSidebar` 只组合已有 owner：导航、头部视图菜单、置顶任务、项目行、任务行、
  分组视图与 footer；项目行动作走 `projectService` / `remoteProjectService`。

## 验收场景

1. 默认启动：侧栏显示项目分区、任务分区与 New task；项目行可展开/收起并显示未读点。
2. 点击项目行内的任务：走 Shell 任务导航，选中态与 composer 同步。
3. 项目行 New task：以项目主目录为 `targetWorkspace`、携带 `projectId` 启动草稿；
   顶栏 New task 清除项目归属。
4. 项目菜单：置顶、编辑（名称）、删除（确认）与移动任务（缺 root 时二次确认）；
   无项目服务时不出现可点击但不可用的入口。
5. 回退：`KAYINGCODE_UI_SIDEBAR_V2=0` 或本地存储 `0` 时渲染旧侧栏；无项目服务时自动回退并记录日志。
6. 分组视图：任务分组、折叠、草稿分组行与新建任务复用同一 Host 分组结构。
7. 新任务归属：项目行 New task 发送后，Host tasks 行在 CLI 同步前即带项目 `project_id`；
   同一 command 重试复用预留行。Host 无项目服务时返回 `project.creation-unavailable`。
8. 远程项目：含历史 `remote-agent` target 的设置可渲染远程项目行；编码 path 的 host
   身份可被侧栏与任务 scope 往返构造。

## 批次 2 接线（2026-10-31）

### 项目文件树

- `ProjectSidebar` 复用 `useProjectFileTree`：项目文件按钮按 root 打开
  `WorkspaceFileTree`；多 root 时先由 `ProjectNodeContent` 的子菜单选择 root，
  零 root 或主目录失效时按钮禁用。打开目标仍由 Shell 的 `fileTreeOpenRequest`
  递增序号，hook 只消费一次并做代次校验；`onOpenFileManager` 不得再写回请求 setter，
  否则会形成自增循环。
- 文件树滑动层是旧侧栏的同一 owner：导航层在打开时左移，关闭后恢复；外部
  Markdown/Git 链接请求仍通过 `fileTreeOpenRequest` 进入。
- 任务行“查看文件”经 `ProjectTaskListContext.onOpenTaskFiles` 复用同一代次与远端
  attachment 校验。

### 远程项目

- `RemoteProjectPicker` 从项目行“添加到侧栏”进入，复用 `RemoteProjectList` 的
  Host 成员校验、`addEntry` 与错误语义；离线 Host 显示 `project.host-offline`。
- `remote-project-connection.requestRetainedRemoteProjectConnection` 只对仍存在的入口
  发起重连：`server` 目标直接 `connectHost`，其余走既有 `onReconnectRemoteWorkspace`；
  连接后成员被移除则抛 `remote-project.host-removed`。
- `useProjectRemoteSync` 为在线远端项目的 skills/MCP/plugins 提供同步动作与对话框；
  历史 `remote-agent` 快照不可转换为 `RemoteTarget` 时不渲染动作。

### 项目创建 / 编辑 / 聊天项目菜单

- `ProjectCreation` + `ProjectEditor` 成为唯一创建/编辑草稿 owner：多 root、主目录、
  目录增删、远端单 root 限制、`saveProject({ roots, primaryRoot })`、
  文件夹信任确认（`ProjectFolderTrustDialog`）与本地多选目录
  （`IPlatformService.selectDirectories`）。本地 Root 尚无设备管理返回结果接缝，
  因此侧栏与 composer 均以 `allowDeviceManagement=false` 调用，不显示会永久等待的入口。
- 设备全集来自 Source 管理快照（桌面）；没有该能力时只投影既有 Host 目录。
- `ProjectComposerMenu` 在草稿 composer 头部替换旧 workspace 菜单（旧侧栏回退时仍用旧菜单）：
  候选为未删除项目、保持侧栏顺序、按名称/设备/roots 搜索、离线项不可选、零 roots 保留；
  选中走 `onCreateTask({ projectId, hostId })`；`showEditProject` 提供当前项目 Plus 编辑入口。
- 本地“打开文件夹”入口保留在菜单内，不引入第二个 workspace 列表 owner。

## 本批未接（已知缺口）

- 设备管理返回结果接缝：Root/SSHDialog 尚未消费 `returnTarget`，创建表单暂不提供
  “添加远程设备”向导入口。
- `remote-project-connection` 未带 Source Profile 快照的线路/安装状态提示；重连仍由
  Root 既有恢复链路负责错误展示。
- 冷恢复/订阅的项目执行目录：`resolveSessionDirectories` 尚未注入 agent service，
  历史任务的 additionalDirectories 只依赖已持久化行。
