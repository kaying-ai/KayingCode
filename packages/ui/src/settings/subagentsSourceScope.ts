/**
 * Subagents 设置页的 Source scope 推导。
 *
 * 背景：设置页可以切到远端 Source 的 user scope。该 scope 没有本机 workspace，
 * 读写必须走 Source settings attachment（`packages/ui/spec/subagents-source-scope.md`）。
 * 这里把「是否远端、锚点路径、作用域、要不要同步本机投影」集中成纯函数，
 * 让组件只消费结果，也便于单测覆盖，不在 JSX 里散落条件。
 */
export interface SubagentsSourceScopeInput {
  settingsSourceServerId?: string | null;
  /** 当前选中的本机 workspace scope；Source scope 下不参与计算。 */
  selectedWorkspacePath?: string | null;
}

export interface SubagentsSourceScope {
  isRemoteSourceSettings: boolean;
  /** 远端 Source 的 id；本机 scope 下为 undefined，供 attachment hook 使用。 */
  remoteSourceServerId: string | undefined;
  /** Source 用 `/<sourceServerId>` 锚点，与 Hooks / Skills / MCP 保持一致。 */
  targetWorkspacePath: string;
  activeScope: "user" | "workspace";
  /** Source scope 不刷新本机 `@` 提及投影，避免跨 Host 串数据。 */
  syncMentionProjection: boolean;
  /** Source scope 不初始化插件 inventory：`pluginManagementStore` 未做 authority 隔离。 */
  syncPluginInventory: boolean;
}

function normalizeSourceServerId(settingsSourceServerId?: string | null): string | undefined {
  return typeof settingsSourceServerId === "string" && settingsSourceServerId.trim().length > 0
    ? settingsSourceServerId.trim()
    : undefined;
}

/** 渲染早期（workspace tabs 之前）就需要知道是否远端，先单独取一次判断结果。 */
export function hasRemoteSubagentsSource(settingsSourceServerId?: string | null): boolean {
  return normalizeSourceServerId(settingsSourceServerId) !== undefined;
}

export function resolveSubagentsSourceScope(
  input: SubagentsSourceScopeInput,
): SubagentsSourceScope {
  const remoteSourceServerId = normalizeSourceServerId(input.settingsSourceServerId);
  if (remoteSourceServerId) {
    return {
      isRemoteSourceSettings: true,
      remoteSourceServerId,
      targetWorkspacePath: `/${remoteSourceServerId}`,
      // Source 只有 user scope 可写；project scope 属于该 Source 上的 workspace。
      activeScope: "user",
      syncMentionProjection: false,
      syncPluginInventory: false,
    };
  }
  const selectedWorkspacePath = input.selectedWorkspacePath ?? "";
  return {
    isRemoteSourceSettings: false,
    remoteSourceServerId: undefined,
    targetWorkspacePath: selectedWorkspacePath,
    // 与本机接入前一致：选了 workspace 才是 workspace scope。
    activeScope: selectedWorkspacePath ? "workspace" : "user",
    syncMentionProjection: true,
    syncPluginInventory: true,
  };
}
