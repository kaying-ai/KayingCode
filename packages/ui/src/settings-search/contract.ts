import type { SettingsSectionId } from "@/lib/settingsNavigation.js";
import {
  SETTINGS_SEARCH_ITEMS,
  type SettingsSearchId,
} from "@/settings-search/settingsSearchIndex.js";

/** 仅导航到分类或固定设置行；调用方不得据此修改设置值。 */
export interface SettingsSearchResult {
  section: SettingsSectionId;
  setting?: SettingsSearchId;
}

export type { SettingsSearchId } from "@/settings-search/settingsSearchIndex.js";
export { useSettingsSearchTarget } from "@/settings-search/SettingsSearchTarget.js";

/**
 * 把搜索结果收敛到当前可见分区与索引里仍存在的行 id。
 * 旧持久化目标、运行时被隐藏的分区（如 Web 端的远程设备）或已移除的设置行
 * 只降级到原分区，不把过期 id 传给定位于上下文。
 */
export function resolveSettingsSearchNavigation({
  result,
  visibleSections,
  fallbackSection = "general",
}: {
  result: SettingsSearchResult;
  visibleSections: readonly { id: SettingsSectionId }[];
  fallbackSection?: SettingsSectionId;
}): SettingsSearchResult {
  const isVisible = (section: SettingsSectionId) =>
    visibleSections.some((candidate) => candidate.id === section);
  if (!isVisible(result.section)) {
    return {
      section: isVisible(fallbackSection)
        ? fallbackSection
        : (visibleSections[0]?.id ?? fallbackSection),
    };
  }
  const setting = result.setting;
  if (
    setting &&
    !SETTINGS_SEARCH_ITEMS.some((item) => item.id === setting && item.section === result.section)
  ) {
    return { section: result.section };
  }
  return setting ? { section: result.section, setting } : { section: result.section };
}
