import {
  GENERATED_OFFICIAL_PLUGIN_DEFINITIONS,
  KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE,
} from "@zcode/contracts";

export type { OfficialPluginListingSeed } from "@zcode/contracts";
import type { OfficialPluginListingSeed } from "@zcode/contracts";

const OFFICIAL_BROWSER_USE_PLUGIN_NAME = "browser-use";
export const OFFICIAL_BROWSER_USE_PLUGIN_ID = `${OFFICIAL_BROWSER_USE_PLUGIN_NAME}@${KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE}`;
/** node_repl 宿主只承载 Browser Use；Computer Use 使用自己的原生 stdio MCP 进程。 */
export const OFFICIAL_NODE_REPL_HOST_PLUGIN_NAME = "node-repl-host";
export const OFFICIAL_NODE_REPL_HOST_PLUGIN_ID = `${OFFICIAL_NODE_REPL_HOST_PLUGIN_NAME}@${KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE}`;
const OFFICIAL_CUA_PLUGIN_NAME = "computer-use";
export const OFFICIAL_CUA_PLUGIN_ID = `${OFFICIAL_CUA_PLUGIN_NAME}@${KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE}`;

export interface OfficialPluginDefinition {
  /** 商店目录条目的组件类型（上游 3.16.2 新增）；由生成清单提供，缺省时按 metadata 推断。 */
  componentTypes?: readonly string[];
  // 内容型 plugin (无 MCP server / 无系统依赖) 可以设为 true,
  // 这样用户首次 `/skill <name>` 就能用,不必先 `kayingcode plugins enable`。
  // 默认 false 保持 ios-simulator / android-emulator 这类重负载 plugin 原来行为。
  defaultEnabled?: boolean;
  listing?: OfficialPluginListingSeed;
  /**
   * 由宿主为该官方插件提供、但不属于 plugin manifest 的 MCP server。
   * 仅用于产品归属和设置页状态展示；运行时仍保留宿主 identity。
   */
  hostMcpServerNames?: readonly string[];
  name: string;
  /** filesystem/SEA seed 缺少任一项时拒绝生成残缺的官方插件缓存。 */
  requiredSeedPaths?: readonly string[];
  rootCandidates: readonly string[];
  /** Extra top-level paths intentionally staged as plugin runtime assets. */
  runtimeTopLevelPaths?: readonly string[];
  version: string;
}

// 版本、默认启用态、listing 和 seed 路径由唯一发行清单生成，避免各制品平行维护。
export const OFFICIAL_PLUGIN_DEFINITIONS: readonly OfficialPluginDefinition[] =
  GENERATED_OFFICIAL_PLUGIN_DEFINITIONS;

export const OFFICIAL_BROWSER_USE_REQUIRED_SEED_PATHS = OFFICIAL_PLUGIN_DEFINITIONS.find(
  ({ name }) => name === OFFICIAL_BROWSER_USE_PLUGIN_NAME,
)!.requiredSeedPaths!;

export const DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS: ReadonlySet<string> = new Set(
  OFFICIAL_PLUGIN_DEFINITIONS.filter((definition) => definition.defaultEnabled).map(
    (definition) => `${definition.name}@${KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE}`,
  ),
);

export function resolveOfficialPluginHostMcpServerNames(pluginId: string): string[] {
  const definition = OFFICIAL_PLUGIN_DEFINITIONS.find(
    (candidate) => `${candidate.name}@${KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE}` === pluginId,
  );
  return definition?.hostMcpServerNames ? [...definition.hostMcpServerNames] : [];
}

/**
 * 官方插件由 host CLI 注入的 MCP（如 browser-use 的 `node_repl`）server name 不带 `plugin:` 前缀，
 * 资源管理器归属插件时需要反查所属官方插件名。
 */
export function resolveOfficialPluginNameByHostMcpServerName(
  serverName: string,
): string | undefined {
  return OFFICIAL_PLUGIN_DEFINITIONS.find((definition) =>
    definition.hostMcpServerNames?.includes(serverName),
  )?.name;
}
