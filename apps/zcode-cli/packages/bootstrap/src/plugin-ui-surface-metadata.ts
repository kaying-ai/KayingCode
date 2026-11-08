import type { PluginMetadata, PluginUiSurfaceDefinition } from "@zcode/contracts";

/**
 * 上游把 A5 面板入口放在 `PluginMetadata.uiSurfaces`；本地 contracts 的 `PluginMetadata`
 * 目前仍只有 `uiContributions`（WS1 待补字段）。这里结构化读取运行时值，
 * 等 contracts 合并该字段后删除本模块并改回直接访问。
 */
export function readPluginUiSurfaces(
  plugin: PluginMetadata,
): readonly PluginUiSurfaceDefinition[] {
  return (plugin as PluginMetadata & { uiSurfaces?: PluginUiSurfaceDefinition[] }).uiSurfaces ?? [];
}
