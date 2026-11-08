export type PluginStoreEnablementState = "enabled" | "disabled" | "unavailable";

export interface PluginStoreEnablementProjection {
  installed: boolean;
  info?: { enabled: boolean } | null;
}

/**
 * 安装记录和启用配置是正交状态。只有已安装且已被运行时枚举的插件才能切换；
 * 残留安装记录不能把缺失的 info 误判为“已停用”，否则会给出一个实际不可执行的开关。
 */
export function resolvePluginStoreEnablement(
  item: PluginStoreEnablementProjection,
): PluginStoreEnablementState {
  if (!item.installed || !item.info) return "unavailable";
  return item.info.enabled ? "enabled" : "disabled";
}

export function canTogglePluginStoreItem(item: PluginStoreEnablementProjection): boolean {
  return resolvePluginStoreEnablement(item) !== "unavailable";
}
