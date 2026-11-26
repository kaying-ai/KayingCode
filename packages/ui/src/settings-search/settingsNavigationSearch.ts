import { pinyin } from "pinyin-pro";

function normalizeSearchText(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, "");
}

export function settingsNavigationSearchKeys(labels: readonly string[]): readonly string[] {
  return labels.flatMap((label) => {
    const keys = [normalizeSearchText(label)];
    if (/\p{Script=Han}/u.test(label)) {
      const syllables = pinyin(label, { toneType: "none", type: "array" });
      keys.push(
        normalizeSearchText(syllables.join("")),
        normalizeSearchText(syllables.map((part) => part[0] ?? "").join("")),
      );
    }
    return keys;
  });
}

export function matchesSettingsNavigation(query: string, keys: readonly string[]): boolean {
  const keyword = normalizeSearchText(query);
  if (!keyword) return true;
  return keys.some((key) => {
    let offset = 0;
    for (const character of keyword) {
      const index = key.indexOf(character, offset);
      if (index < 0) return false;
      offset = index + character.length;
    }
    return true;
  });
}

/**
 * 行级目标状态：none = 结果只到分区；pending = 尚未确认行是否挂载；
 * mounted = 行已挂载，由行定位；missing = 行未挂载，需要分区兜底。
 */
export type SettingsSearchRowTargetState = "none" | "pending" | "mounted" | "missing";

/**
 * 分区定位兜底：结果只到分区，或行级目标未挂载
 * （平台条件隐藏、运行时数据未就绪或索引已移除）时由分区承接；
 * 行级目标确认挂载或仍在等待挂载时不抢先滚动，避免双重定位。
 */
export function shouldUseSettingsSearchSectionFallback(
  rowTargetState: SettingsSearchRowTargetState,
): boolean {
  return rowTargetState === "none" || rowTargetState === "missing";
}
