# 上游 Web 项目与控制器能力对齐

官方 Web 工作台按上游 3.17.2 原样构建，页面会直接调用 `project`、`remote-projects`、`window-controller` 与 `zcode-agent` 频道。本规范记录这些频道在 KayingCode Host/服务层的对齐边界；页面与 `packages/web` 覆盖白名单不在本规范内。

## Project：按 hostId 路由

`IProjectService` 的 `hostId` 不是本 Host 的 `ownerHostId` 时，必须由 `resolveHost(hostId)` 解析到当前在线的目标 Host；解析器缺失或目标离线一律抛 `project.host-offline`，禁止回退读取本地 SQLite。

- `createLocalServices` 通过 `resolveProjectHostService` 注入解析器，内部传给 `createProjectService({ resolveHost })`。
- Desktop Window Host 的解析器：由 `hostId` 反解 `sourceServerId`，优先查窗口连接 registry 的在线 Source，其次查 Source 连接管理器的在线连接。
- 远端返回的树必须经 `bindRemoteProjectIdentities` 补齐稳定 `workspaceIdentity`；身份登记按物理连接代际缓存，失败不缓存。
- 远端 Host 没有虚拟项目能力时使用 `resolveServerProjectService` 的 legacy 单 root 只读面。
- 读取、`prepareSession`、`resolveSessionDirectories` 使用同一解析路径；导航仍由 `createProjectWorkspaceNavigation` 统一校验 host、成员关系与 stale。

## Remote projects：连接状态与重连

`createRemoteProjectService` 的 `controller` 目录必须能获得实时连接状态，并能发起重连：

- `readConnectionStates` 返回 `hostId → connectionStatus / lastConnectionError / lastConnectionStatus / upgradeTarget`；缺失时目录只保留持久字段，UI 不得把未知状态当成在线。
- `connectHost` 只对仍存在的 host 生效；重连后成员关系变化必须报 `remote-project.host-removed`，不能把旧 host 映射到新成员。
- 项目/远端项目写入完成后广播 `state:projects`，窗口目录与侧栏以该广播刷新，不另建缓存。

## 任务列表：host scope 与 all

官方 Web 的命令中心/全局搜索使用 `listTaskList({ kind: "all", workspaceScopes: "host" })`。

- 查询类型允许 `kind: "all"` 与 `workspaceScopes: "host"`。
- `workspaceScopes: "host"` 直接查询持久化 owner（`host_id` 为当前 Host，排除 `cli_deleted` 且要求 `cli_created_at` 已同步），不要求工作区已打开，不为查询创建 runtime/远端连接。
- `kind: "all"` 不追加 pinned/archived 过滤；`pinned`/`archived` 仍按原语义。
- Window Controller 对 host scope 结果叠加本地投影的 `liveStatus` / `activity`，其余 source 状态按持久事实返回。

## Window Controller 契约

- `getTaskMeta` 是 controller attachment 的必需读取：直接读唯一持久 owner，读取前后校验 source 未被替换；不得用列表投影代替已读 CAS 依据。
- mutation 支持 `rename`；其余 `pin/archive/delete/mark-read/mark-unread/open/resume` 语义不变。
- 全局未读信号只向 `desktop-continuous` 的本地 attachment 暴露；`web-remote-replayable` 与远端 scope 不消费桌面完成信号。
- 远端 source 的地址键优先使用 `sourceServerId ?? remoteSessionId`，并携带 `serverDisplayName`；离线历史与多 Source 不能按本地或错误 source 归类。`remoteSessionId` 保留为回退键。
- 断连 source 替换必须支持 `canCommit` / `rollbackOnFailure`：owner 已换代时回滚，不把新代数据写进旧投影。
- 提供只读 `readTaskRows` / `subscribeTaskRows` 供窗口项目树叠加待处理交互；没有订阅者时不得额外广播。

## Agent hello 能力

官方 Web 依据 hello 能力决定是否发送新字段，缺失等价于 false：

- 声明 `genUiContext: true`、`workflowRunDeltas: true`、`historyFirst: true`。
- `initializeConversationV4` 保存客户端对 `workflowRunDeltas` / `historyFirst` 的声明，并在可信连接上下文中转发；不得让下游伪造顶层 `clientMode`。
- 发送带非空 `genUiContext` 的命令前必须确认执行端支持；不支持时保留草稿并抛 `proto.genUiContextUnsupported`，不得回退到拼接用户正文。
- `inputPrediction`、`residentRowsRange` 当前 3.17.2 Web UI 未消费，保持不声明；恢复时必须同时接上 hello 与真实转发。

## 验收

- project：本地树、远端在线树、远端离线拒绝、身份登记失败重试、导航远端准备。
- remote-projects：在线状态映射、重连成功、成员被移除、写入后广播。
- task list：host scope 返回未打开工作区任务、`all` 不过滤归档、分页与搜索。
- controller：getTaskMeta 地址校验、rename、未读信号隔离、source 身份键、重连回滚。
- agent：hello 能力、client 声明转发、genUi 支持检查与拒绝语义。
