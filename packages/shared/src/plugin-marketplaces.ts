import { GENERATED_DEFAULT_OFFICIAL_PLUGIN_IDS } from "./official-plugin-defaults.generated.js";

export interface DefaultPluginMarketplace {
  id: string;
  source: string;
  name: string;
  description: string;
  pluginCount: number;
  lastUpdated?: string;
}

export const KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID = "kayingcode-plugins-official";

/** TapTap Maker 官方插件 id；右栏「游戏预览」入口以此判定已安装且启用。 */
export const KAYINGCODE_TAPTAP_PLUGIN_ID = "kaying-for-taptap@kayingcode-plugins-official";

/**
 * KayingCode.localrun：插件仅「内置 + 本地安装」。
 * 官方 CDN 市场列表已移除；id 暂保留常量名以降低协议/测试机械对照成本，展示名走 KayingCode 文案。
 */
export const KAYINGCODE_BUILTIN_PLUGIN_MARKETPLACE_ID = KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID;

/**
 * Claude Code 官方市场（GitHub git 源）。它不是 ZCode 的强依赖：GitHub 不可达时刷新必然失败，
 * 该失败不应作为错误提示打扰用户，UI 侧按此 id 静默处理其刷新失败（任何原因）。
 */
export const CLAUDE_OFFICIAL_PLUGIN_MARKETPLACE_ID = "claude-plugins-official";

/** Settings 三类资源发现共用；Bootstrap 单测与官方 definition 的 defaultEnabled 机械对照。 */
export const DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS: ReadonlySet<string> = new Set(
  GENERATED_DEFAULT_OFFICIAL_PLUGIN_IDS,
);

export const DEFAULT_PLUGIN_MARKETPLACES: DefaultPluginMarketplace[] = [
  {
    // KayingCode.localrun：无远程 source。内置插件由本地 seed 写入该市场 id；
    // 用户可通过本地目录 / 本地 marketplace.json / 本地 zip 安装，不拉取 CDN 列表。
    id: KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID,
    source: "builtin://local",
    name: "kayingcode-plugins-builtin",
    description: "KayingCode built-in plugins (local only, no remote catalog).",
    pluginCount: 0,
  },
  {
    id: CLAUDE_OFFICIAL_PLUGIN_MARKETPLACE_ID,
    source: "anthropics/claude-plugins-official",
    name: CLAUDE_OFFICIAL_PLUGIN_MARKETPLACE_ID,
    description:
      "Directory of popular Claude Code extensions including development tools, productivity plugins, and MCP integrations",
    // 只内置官方 catalog 来源，不把远端 manifest 快照打包进仓库；首次刷新前数量未知。
    pluginCount: 0,
  },
];

// 商店「公开」分段只有一个 KayingCode 官方市场 id，内置与 CDN 不再拆分身份。
export const PUBLIC_STORE_MARKETPLACE_IDS = [KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID] as const;

export function isPublicStoreMarketplaceId(id: string): boolean {
  return (PUBLIC_STORE_MARKETPLACE_IDS as readonly string[]).includes(id);
}
