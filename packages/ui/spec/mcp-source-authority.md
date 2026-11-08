# MCP Source authority（2026-11-01）

## 1. 背景

设置页支持“配置来源”切换到远端 Source。Skills / Hooks / Commands 已经通过 Source
settings attachment 做到读写同源，MCP 仍被回退：`mcpStore` 是全局单例，读取可以传入
`directoryService`，但 `persistScopedChange` / `toggleServer` 不接收本次操作的目录服务，
Source user scope（无 workspace identity）会回退到本机平台服务，形成“读远端、写本机”。

同时，`mcpStore` 也是活动 workspace 的 MCP 投影源。如果把 Source 配置加载进同一个
store，活动 workspace 的设置页和状态刷新请求可能拿到另一个 Host 的配置。

## 2. 范围

- 只处理设置页的 **Source user scope**（`settingsSourceServerId` 有效且当前 Scope 为 `user`）。
- Source 的 project/workspace scope、普通本机 workspace、Web 端行为保持不变。
- 不改变 MCP 配置文件格式、`IMcpSyncService` 契约和 Agent 侧读取路径。
- 文件导入（`McpServersImportDialog`）在 Source user scope 下暂不提供：它需要本地文件
  选择器与路径语义，跨 Host 导入不在本批范围。

## 3. 状态所有权

| 状态                          | 唯一所有者                               | 说明                                                                          |
| ----------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| 活动 workspace 的 MCP 投影    | 默认 `useMcpStore` 单例                  | `useEnsureWorkspaceMcpLoaded` 与远端同步刷新继续写它                          |
| Source user scope 的 MCP 投影 | 每个 authority key 一个独立 store 实例   | key 为 `source-settings:<sourceServerId>`；与默认 store 完全隔离              |
| 目录服务（读写路由）          | 每个 store 实例自己的 `directoryService` | 不再使用模块级全局；默认 store 由 `setMcpStoreDirectoryService` 注入          |
| 插件投影                      | `pluginManagementStore`                  | 增加 `authorityKey`，按 authority 判定上下文是否变化；不跨 authority 复用缓存 |

事件顺序：

```text
设置页选择 Source user scope
  → useSettingsSourceServices(sourceServerId) 取得 Source settings attachment
  → McpSettingsSection 解析 target services（requireUnscopedServices）
  → 未就绪：保持 remote-waiting，不加载、不写入、不回退本机
  → 就绪：
      authorityStore.setDirectoryService(sourceServices.mcpSyncService)
      authorityStore.ensureLoadedForWorkspace(anchorPath, sourceServices.mcpSyncService)
      → 列表就绪，后续 add/update/delete/toggle 全部走该 directoryService
  → 活动 workspace 的默认 store 不受影响
```

## 4. 接口

### 4.1 mcpStore

- `createMcpStore(options?: { authority?: boolean })`：工厂；`authority: true` 时
  写入必须使用实例 `directoryService`，缺失则拒绝写入（fail-closed）。
- `useMcpStore`：默认单例，保持现有导出与行为。
- `getMcpAuthorityStore(authorityKey)`：按 key 缓存 authority store 实例。
- 新增 state 方法 `setDirectoryService(service)`。
- `persistScopedChange` 返回 `boolean`；authority store 在无服务或保存失败时返回 `false`，
  调用方不得更新本地投影。
- `deleteScopedMcpServer` 改为异步，先等待持久化成功再更新本地列表。

### 4.2 McpSettingsSection

新增可选 props：

- `unscopedServices?: IServiceAccessor`：Source settings attachment 的服务集合。
- `cacheAuthorityKey?: string`：Source user scope 的 authority key。

两者同时存在时：

- 服务解析改用 `useConfigWorkspaceServicesResolution`，`forceUnscoped` +
  `requireUnscopedServices`，未就绪保持 remote-waiting。
- 读取/写入改用 `getMcpAuthorityStore(cacheAuthorityKey)`。
- `mcpProjectionReady` 额外要求 target services `rpcReady`。
- 插件 MCP 分组要求 `pluginManagementStore.authorityKey === cacheAuthorityKey`。
- 表单只提供 `user` scope（不传 workspace tabs），不允许写入 Source 的 project scope。
- 隐藏导入入口和 remote-sync 入口。

缺省（未传两个 props）时行为与接入前完全一致。

### 4.3 PluginsSection

`mcpSourceUserScope = isRemoteSourceSettings && selectedScope.kind === "user"` 时：

- MCP target 使用 `{ workspacePath: /<sourceServerId> }`（与 Skills 的锚点一致）。
- 下传 `unscopedServices` 与 `cacheAuthorityKey`。

### 4.4 pluginManagementStore

- state 增加 `authorityKey: string | null`。
- `initialize` 增加可选 `authorityKey`；它参与 `contextChanged` / `hasCache` 判定。
- Skills 与 MCP 在 Source user scope 下都传入同一个 authority key。

## 5. 不变量与失败语义

1. Source user scope 的任何 MCP 写入不得调用本机 `platform.saveMcpToUserDirectory`。
2. Source attachment 未就绪或缺失时保持 remote-waiting；禁止用本机服务兜底。
3. 默认 store 的 `currentProjectPath` / `servers` / `statusSnapshots` 不因 Source 设置页变化。
4. 每次加载/状态请求都带 target key；迟到的结果只能写回发起时的 authority。
5. 保存失败时本地投影不更新，列表不会显示“已保存但实际未落盘”的状态。

## 6. 验收场景

1. Source user scope 打开 MCP：列表来自 Source；新增/编辑/删除/启停调用 Source
   `mcpSyncService.saveMcpToUserDirectory`；本机 platform 未被调用。
2. 同时打开本机 workspace 设置：本机 MCP 列表与状态不受 Source 操作影响。
3. 断开 Source attachment：MCP 页保持 loading/remote-waiting，写按钮不可用；恢复后重新加载。
4. 未传 authority props 的调用方：行为与接入前一致（现有测试全绿）。
5. `pnpm --filter @zcode/ui run test`、根 typecheck/lint、source:check、
   architecture:check --changed 全绿。

## 7. 迁移与回滚

- 现有调用方无需改动；默认 store 保留原导出与语义。
- 回滚只需移除 `PluginsSection` 对 MCP 的 `unscopedServices` / `cacheAuthorityKey` 下传，
  设置页回到本机行为；authority store 实例不参与运行时投影，残留实例可安全丢弃。
