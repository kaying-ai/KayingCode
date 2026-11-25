import type { SettingsSectionId } from "@/lib/settingsNavigation.js";
import {
  matchesSettingsNavigation,
  settingsNavigationSearchKeys,
} from "@/settings-search/settingsNavigationSearch.js";
import {
  isSettingsSearchItemVisible,
  SETTINGS_SEARCH_ITEMS,
  type SettingsSearchAvailability,
  type SettingsSearchId,
} from "@/settings-search/settingsSearchIndex.js";

export interface SettingsSearchSection {
  id: SettingsSectionId;
  titleId: string;
}

export interface SettingsSearchEntry {
  section: SettingsSectionId;
  setting?: SettingsSearchId;
  label: string;
  sectionLabel: string;
  keys: readonly string[];
  descriptionKeys: readonly string[];
}

export interface RankedSettingsSearchEntry extends SettingsSearchEntry {
  /** 0 = 名称命中，1 = 仅说明命中；名称命中始终排在说明命中之前。 */
  rank: number;
}

function normalizeDescription(text: string): string {
  return text.normalize("NFKC").trim().toLowerCase();
}

/**
 * 从当前可见分区、翻译和可见性投影搜索条目。
 * 只读取索引与翻译，不挂载未选中的设置页，也不持有任何配置值。
 */
export function buildSettingsSearchEntries({
  sections,
  translate,
  fallbackTranslate,
  availability,
  isSectionAvailable,
}: {
  sections: readonly SettingsSearchSection[];
  translate: (id: string) => string;
  fallbackTranslate?: (id: string) => string | undefined;
  availability: SettingsSearchAvailability;
  isSectionAvailable: (section: SettingsSectionId) => boolean;
}): SettingsSearchEntry[] {
  const fallback = (id: string) => fallbackTranslate?.(id) ?? "";
  return sections.flatMap((section) => {
    if (!isSectionAvailable(section.id)) return [];
    const sectionLabel = translate(section.titleId);
    const sectionEntry: SettingsSearchEntry = {
      section: section.id,
      label: sectionLabel,
      sectionLabel,
      keys: settingsNavigationSearchKeys([sectionLabel, fallback(section.titleId)]),
      descriptionKeys: [],
    };
    const itemEntries = SETTINGS_SEARCH_ITEMS.filter(
      (item) => item.section === section.id && isSettingsSearchItemVisible(item, availability),
    ).map((item) => ({
      section: section.id,
      setting: item.id,
      label: translate(item.id),
      sectionLabel,
      keys: settingsNavigationSearchKeys([translate(item.id), fallback(item.id)]),
      descriptionKeys: [translate(item.description), fallback(item.description)],
    }));
    return [sectionEntry, ...itemEntries];
  });
}

/** 名称采用顺序字符（含拼音首字母）匹配；说明较长，只做片段匹配。 */
export function filterSettingsSearchEntries(
  entries: readonly SettingsSearchEntry[],
  query: string,
): RankedSettingsSearchEntry[] {
  const keyword = normalizeDescription(query);
  return entries
    .flatMap((entry) => {
      const nameMatch = matchesSettingsNavigation(query, entry.keys);
      const descriptionMatch =
        keyword.length > 0 &&
        entry.descriptionKeys.some((text) => normalizeDescription(text).includes(keyword));
      if (!nameMatch && !descriptionMatch) return [];
      return [{ ...entry, rank: nameMatch ? 0 : 1 }];
    })
    .sort((left, right) => left.rank - right.rank);
}
