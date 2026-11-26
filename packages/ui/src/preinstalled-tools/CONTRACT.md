# 预装工具对话框

本目录是桌面「帮助 → 预装工具」管理界面的唯一实现。后端（`packages/shared/src/preinstalled-tools/`、
`packages/desktop/src/preinstalled-tools/`）负责目录、下载、校验、入口与设置持久化；本模块只做展示与命令转发，
不保存任何安装事实。

## 入口与能力检测

- 唯一入口是 `WorkspaceHelpMenuButton` 的帮助菜单项 `workspace-help-menu-preinstalled-tools`，对话框由该组件
  渲染。菜单项与对话框都只在 `isDesktop === true` 且能力齐全时出现。
- 能力判定使用 `canManagePreinstalledTools(platform)`：`getPreinstalledToolsState`、
  `executePreinstalledToolsCommand`、`onPreinstalledToolsState` 三个方法必须同时存在。任一缺失（Web、手机远控、
  旧 preload）都不渲染入口，也不渲染对话框，避免出现点了没有反应的菜单项。
- 不使用 `executeDesktopCommand` 之类的旁证判定桌面端：Web 的 `IPlatformService` 桩同样实现了 no-op 命令。

## 状态所有权

- 预装进程（utilityProcess）是 `PreinstalledToolsState` 的唯一写者，`autoInstallEnabled`、每个工具的
  `status`/`phase`/`downloadedBytes`/`installed`/`target`/`agentEnabled`/`entryOutOfSync`/`deletionBlocked`
  都只来自它推送的快照。
- Renderer 不读磁盘、不推导安装事实、不写 `preinstalledToolsAutoInstall` /
  `preinstalledToolsAgentDisabled` 设置；设置只由预装进程写入。UI 一律通过命令表达意图。
- 对话框内不维护第二份「已接受状态」：命令回执只结束本次控件的 pending，显示值永远取最新推送快照。

## 订阅与查询顺序

打开对话框时（`open` 变为 `true`）：

1. 先订阅 `onPreinstalledToolsState`，再调用 `getPreinstalledToolsState()`。
2. 推送快照到达后忽略迟到的初始查询结果（`eventReceived` 标记），防止旧快照回滚新状态。
3. 初始查询失败且期间没有推送时结束加载态并显示 `preinstalledTools.loadFailed`；之后若收到推送仍按推送显示。
4. 关闭对话框只解除订阅、清空本地快照，不取消正在进行的准备（准备由预装进程持有）。

## 命令回执

- 命令（`set-auto-install` / `set-agent-enabled` / `sync-entries` / `prepare` / `cancel` / `delete`）的成功回执
  不携带新状态，也不替换快照；成功时不弹 Toast。
- 命令失败只在所属控件附近显示 `preinstalledTools.commandFailed`（自动预装开关在对话框内，工具命令在对应卡片内）。
- 每张卡片只持有自己的 pending / 错误 / 删除确认状态，命令携带 `toolId`，不阻塞其他卡片。

## 删除确认与占用

- 删除必须先经过 `AlertDialog` 确认；确认文案显示 `installed.installedSizeBytes` 对应的释放空间，自动预装开启时
  追加 `preinstalledTools.deleteAutoNotice`，Python 额外提示会删除 Agent 安装的包。
- 预装进程检测到工具正在被使用时不删除、也不抛错，而是推送 `deletionBlocked: true`。UI 收到后显示
  `preinstalledTools.deletionBlocked` 占用提示，不自动重试删除；用户稍后可再次手动删除。
- 删除按钮与占用体积取自 `installed`；没有 `target` 但已有安装时仍可删除。

## 卡片渲染

- 按 `tools[]` 顺序渲染；显示名来自 catalog 投影（`displayName`），用途按 `toolId` 查
  `preinstalledTools.purpose.<toolId>`，缺失时回退为 key 本身（`createIntl` 行为）。
- 状态徽标：`not-installed` 在 `installed.resourceId !== target.resourceId` 时显示 `status.update-available`；
  其余按 `status.<status>`。
- 信息行按优先级：失败错误（`error.<code>`，缺省 `runtime`）→ 无 target（`unavailable`）→ 准备中（下载进度或
  `phase.<phase>`）→ 已就绪（`readyInfo`）→ 可更新（`updateInfo`）→ 未安装（`sizeInfo`）。存在旧版本且正在
  准备/失败/无目标时追加 `currentInfo`。
- 进度条只在 `preparing` 时出现：下载阶段按 `downloadedBytes / archiveSizeBytes` 显示确定进度；其余阶段显示
  35% 宽度的脉冲条。产品 `Progress` 没有 `indeterminate` 属性（上游有），这里用固定宽度 + `animate-pulse`
  表达不确定进度，不修改共享基础组件。
- `entryOutOfSync` 时显示重试入口，发送 `sync-entries`；`preparing` 时只显示取消按钮；否则按已安装/目标显示
  删除与下载/更新/重试按钮。
- 颜色使用产品 token（`bg-surface`、`bg-success/14 text-success`、`bg-destructive/10 text-destructive`、
  `bg-warning/10 text-warning`），不引入上游的 `*-surface` token。

## 远端工作区

- 对话框管理的是本机。当前激活 tab 是远端工作区（`remoteSessionId` / `remoteTarget` /
  `isRemoteWorkspaceIdentity(workspaceIdentity)`）时显示 `preinstalledTools.remoteNotice`，但命令仍作用于本机，
  不向远端安装。

## Web / 手机缺席

- Web 与手机远控的 `IPlatformService` 不实现上述三个方法，因此帮助菜单不出现该入口，`PreinstalledToolsDialog`
  也不会被挂载。远端链路不转发预装工具命令，不新增远端管理入口。

## 与上游的映射

| 上游（`upstream/main:packages/ui/src/preinstalled-tools/`） | 产品                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `PreinstalledToolsDialog.tsx`                               | 同名文件；`useZCodeIntl` → `useKayingCodeIntl`，`Progress` 去掉 `indeterminate`，颜色 token 换为产品 token |
| `contract.ts` / `index.ts` / `module.ts`                    | 同名文件；`index.ts` 额外导出 `canManagePreinstalledTools`                                                 |
| `CONTRACT.md`                                               | 本文件（产品行为、能力检测与验收场景）                                                                     |
| 帮助菜单挂载（`WorkspaceHelpMenuButton.tsx`）               | 同一位置：资源管理器之后、更新/关于之前；新增能力检测                                                      |

## 验收场景

- 平台三方法缺失时不出现菜单项；三方法齐全且 `isDesktop` 时出现菜单项并打开对话框。
- 打开对话框时先订阅后查询；推送快照先到时，迟到的查询结果不覆盖它。
- 命令回执成功不改变界面状态；只有推送快照改变状态。
- 删除需二次确认；`deletionBlocked` 时显示占用提示且不自动重试。
- 自动预装开关发送 `set-auto-install` 命令，显示值来自快照。
- 单元测试见 `packages/ui/test/preinstalledToolsDialog.test.ts`。
