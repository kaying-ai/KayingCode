# 侧栏任务列表头部

> 目标：对齐上游 `packages/ui/src/project-sidebar/ProjectSidebarListHeader.tsx` 的顶部结构，
> 让侧栏任务区具备「标题 + 搜索 + 视图切换」的统一入口，同时复用现有侧栏状态 owner。

## 范围

- `packages/ui/src/WorkspaceSidebar.tsx` 任务区顶部的原胶囊标签（分组 / 项目）替换为任务列表头部。
- 头部包含：任务列表标题、搜索入口、视图菜单（按项目 / 按分组 / 最近更新）、排序选项。
- 归档开关、全部展开/收起、新建分组等既有操作保留在原位。

## 状态所有权

- 视图状态唯一 owner 仍是 `packages/ui/src/lib/sidebarTaskPreferences.ts` 的
  `SidebarTaskOrganizeBy`（`"project" | "chronological" | "grouped"`），持久化复用
  `persistSidebarTaskPreferences`。
- 头部不新增持久化字段，也不维护第二份视图状态；渲染值由
  `resolveWorkspaceSidebarTaskListView` 从 `taskOrganizeBy` 派生。
- 搜索弹窗（Command Center）由 Shell 唯一持有；侧栏只接收并调用 `onOpenCommandCenter`。

## 视图映射

| 头部选项             | `taskOrganizeBy` | 渲染区域                                |
| -------------------- | ---------------- | --------------------------------------- |
| 按项目（projects）   | `project`        | 现有 `WorkspacePurposeSection` 项目分组 |
| 按分组（grouped）    | `grouped`        | 现有 `WorkspaceGroupedTasksSection`     |
| 最近更新（timeline） | `chronological`  | 现有 `WorkspaceTimelineTasksSection`    |

规则：

- 选择分组时沿用现有行为，先重置 grouped hydrate 状态再切换，避免切换帧闪动。
- 选择项目或最近更新时同时更新 `workspaceTaskOrganizeBy`，保持旧偏好恢复路径一致。
- 未知或缺失的持久化值由 `readSidebarTaskPreferences` 的既有解析回退到项目视图。

## 交互与失败语义

- 搜索按钮仅在 Shell 提供 `onOpenCommandCenter` 时渲染；未提供时不出现可点击但无行为的入口。
- 视图菜单使用单选语义，选中项与当前渲染区域一致；切换只改本端偏好，不导航、不改归属。
- 排序（updated / created）继续复用 `taskSortBy`，归档视图下仍可用。
- 归档开关保持独立按钮，打开归档视图时头部视图值不写回偏好；从归档视图选择任一视图会退出归档。

## 验收场景

1. 默认打开侧栏显示「任务」标题、搜索按钮、视图菜单，渲染项目分组。
2. 选择「按分组」后渲染分组区域，新建分组 / 全部展开按钮可用。
3. 选择「最近更新」后渲染时间线区域，视图菜单选中项同步。
4. 点击搜索打开 Command Center。
5. 刷新后按持久化的 `organizeBy` 恢复对应视图。
6. 归档开关与排序选项行为与改动前一致。

## 标题对齐（2026-11-04）

- 新项目侧栏的列表总标题「任务」和分区标题「项目／任务」文字左边缘统一距侧栏 18px。
- 分区标题的内缩由 PurposeSections 传给 WorkspacePurposeSection 的 headerClassName 控制；不改变项目行、拖动、折叠状态或旧侧栏布局。
- 视图、分区顺序和展开状态仍由现有偏好 owner 持有，不增加状态或服务接口。
- 验收：桌面与窄屏、中英标题下左右边缘一致；点击分区标题可折叠／展开，拖动入口和操作按钮保持可用。

浏览器回归入口：`node packages/ui/test/startupBranding.e2e.mjs`（需要本机 Chrome）。
