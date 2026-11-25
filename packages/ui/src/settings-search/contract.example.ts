import type { SettingsSearchResult } from "@/settings-search/contract.js";

/** 搜索结果交给 SettingsPage 原导航；目标分区挂载后按 id 滚动定位。 */
export const fontSizeSearchResult = {
  section: "appearance",
  setting: "settings.uiFontSize",
} satisfies SettingsSearchResult;
