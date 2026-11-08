# Subagents Source scope（2026-11-02）

## 1. 背景

设置页的“配置来源”可以在本机与远端 Source 之间切换。Skills / MCP / Hooks / Commands 都已
做到读写同源，**Subagents 仍固定使用本地 Host 服务**：`SubagentsSection` 直接取
`useBaseWorkspaceServices().subagentsService`，于是选中远端 Source 时，列表、新建、编辑、
删除、启停、模型覆盖全部落回本机磁盘，与本页其他分区行为不一致。

与 MCP 那批不同的是：`SubagentsSection` 的列表是组件内 `useState`，不读
`subagentsStore`；store 只用于 `@` 提及投影（`refreshLoadedSubagentsStoreForWorkspace`）。
因此本批不需要工厂化 store，只需要：

1. 把 `subagentsService` 换成 Source attachment 提供的实例；
2. 让 Source scope 不写本机的 `@` 提及投影。

## 2. 范围

- 只处理设置页的 **Source user scope**（`settingsSourceServerId` 为非空字符串，即远端 Source）。
- 本机 Source（`settingsSourceServerId === null`）、普通本机 workspace、Web 端行为不变。
- 不改变 `ISubagentsService` 契约、agent 文件格式、Agent 侧读取路径。
- **插件只读投影暂不在 Source scope 展示**：`pluginManagementStore` 是全局单例且未做
  authority 隔离（`packages/ui/spec/mcp-source-authority.md` 只为 MCP 做了实例隔离），
  在 Source scope 下调用 `initializePlugins` 会把远端插件写进活动 workspace 的投影。
  本批直接跳过插件 inventory，插件分组不渲染；后续为其加 authority 维度后再放开。

## 3. 状态所有权

| 状态                     | 唯一所有者                                  | 说明                                                     |
| ------------------------ | ------------------------------------------- | -------------------------------------------------------- |
| Subagent 列表            | `SubagentsSection` 组件内 state             | 由 `subagentsService.list` 填充，不进入全局 store         |
| 读写路由                 | Source settings attachment 的 `subagentsService` | 未就绪时禁止回退本机（fail-closed）                 |
| `@` 提及投影（`subagentsStore`） | 本机活动 workspace                    | Source scope 不写、不刷新，避免跨 Host 串投影             |
| 插件投影                 | `pluginManagementStore`                     | 本批不参与 Source scope                                   |

事件顺序：

```text
设置页切到远端 Source
  → SettingsPage 传 settingsSourceServerId 给 SubagentsSection
  → useSettingsSourceServices(sourceServerId) 请求 Source settings attachment
  → 未就绪：sourceServices === undefined
      → 列表保持 loading（remote-waiting），新增/编辑/删除/启停不可用
      → 不调用本机 subagentsService，不写 @ 提及投影
  → 就绪：
      subagentsService = sourceServices.subagentsService
      targetWorkspacePath = `/<sourceServerId>`（与 Hooks/Skills 锚点一致）
      activeScope 强制 user，workspace scope 下拉不出现
      list / createAgent / updateAgent / deleteAgent / setEnabled /
      setBuiltInModelOverride / setPluginAgentModelOverride 全部走该实例
```

## 4. 接口

### 4.1 SubagentsSection

新增可选 prop：

- `settingsSourceServerId?: string | null`

派生规则（新增 `resolveSubagentsSourceScope`，纯函数，可直接单测）：

- `isRemoteSourceSettings`：`typeof settingsSourceServerId === "string"`。
- `targetWorkspacePath`：远端时为 `/${sourceServerId}`，否则沿用 workspace scope 推导。
- `activeScope`：远端时恒为 `"user"`。
- `syncMentionProjection`：远端时 `false`（不刷新 `@` 提及投影）。

服务来源：

- `subagentsService`：远端取 `sourceServices?.subagentsService`，否则取 `useBaseWorkspaceServices()`。
- `pluginManagementService` / `modelSelectionService`：仍取本地服务。
  模型覆盖写的是 `subagentsService`，因此已随上面路由到 Source。

未就绪语义：

- `subagentsService === undefined` 时 `loadAgents` 只设置 loading，不发 RPC、不清空已有列表、
  不产生 error 文案；写操作按钮由 `canManageUserAgents === false` 关闭。

### 4.2 SettingsPage

`activeSection === "subagents"` 分支下传 `settingsSourceServerId={effectiveSettingsSourceServerId}`。

## 5. 不变量与失败语义

1. Source scope 下任何 Subagent 写入不得调用本机 `subagentsService`。
2. Source attachment 未就绪时保持 remote-waiting；禁止用本机服务兜底。
3. Source scope 不刷新 `subagentsStore`，活动 workspace 的 `@` 提及列表不受影响。
4. Source scope 不调用 `initializePlugins`，插件投影不被远端资源覆盖。
5. 缺省（未传 `settingsSourceServerId`）时行为与接入前完全一致。

## 6. 验收场景

1. Source user scope 打开 Subagents：列表来自 Source；新建/编辑/删除/启停/模型覆盖均调用
   Source `subagentsService`；本机服务未被调用。
2. 同时打开本机 workspace 设置：本机 Subagent 列表与 `@` 提及投影不受 Source 操作影响。
3. 断开 Source attachment：页面保持 loading，写入口不可用；恢复后重新加载。
4. 未传 `settingsSourceServerId` 的调用方：行为与接入前一致。
5. `pnpm --filter @zcode/ui run test`、根 typecheck/lint、`source:check`、
   `architecture:check --changed` 全绿。

## 7. 迁移与回滚

- 现有调用方无需改动；不传新 prop 即保持原行为。
- 回滚只需移除 `SettingsPage` 对该 prop 的下传。
