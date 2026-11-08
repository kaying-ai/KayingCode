import type { GameDevelopmentPluginListing, PluginSkillDetails } from "@zcode/shared";

/** 官方插件发行元数据的运行时投影；源目录和构建策略属于仓库工具，不进入 Agent 运行时。 */
export interface OfficialPluginListingSeed {
  gameDevelopment?: GameDevelopmentPluginListing;
  skillDetails?: PluginSkillDetails;
  displayName?: string;
  displayName_i18n?: Record<string, string>;
  description_i18n?: Record<string, string>;
  category?: string;
  author?: { name: string; url?: string };
  icon?: string;
  homepage?: string;
  privacyPolicy?: string;
  termsOfService?: string;
  heroImage?: string;
  examplePrompts?: string[];
  examplePrompts_i18n?: Record<string, string[]>;
}

export interface OfficialPluginReleaseDefinition {
  defaultEnabled?: boolean;
  listing?: OfficialPluginListingSeed;
  hostMcpServerNames?: readonly string[];
  name: string;
  requiredSeedPaths?: readonly string[];
  rootCandidates: readonly string[];
  runtimeTopLevelPaths?: readonly string[];
  version: string;
}
