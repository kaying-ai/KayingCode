import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import enUS from "@/i18n/locales/en-US.js";
import zhCN from "@/i18n/locales/zh-CN.js";
import { resolveSettingsSearchNavigation } from "@/settings-search/contract.js";
import { SettingsSearchSectionTarget } from "@/settings-search/SettingsSearchSectionTarget.js";
import {
  matchesSettingsNavigation,
  settingsNavigationSearchKeys,
  shouldUseSettingsSearchSectionFallback,
} from "@/settings-search/settingsNavigationSearch.js";
import {
  findSettingsSearchItem,
  isSettingsSearchId,
  SETTINGS_SEARCH_ITEMS,
  type SettingsSearchAvailability,
  type SettingsSearchId,
} from "@/settings-search/settingsSearchIndex.js";
import {
  buildSettingsSearchEntries,
  filterSettingsSearchEntries,
  type SettingsSearchEntry,
  type SettingsSearchSection,
} from "@/settings-search/settingsSearchResults.js";

const sections: readonly SettingsSearchSection[] = [
  { id: "general", titleId: "settings.systemTitle" },
  { id: "appearance", titleId: "settings.appearanceTitle" },
  { id: "browser", titleId: "settings.browser.title" },
  { id: "memory", titleId: "settings.memory" },
];

const allAvailable: SettingsSearchAvailability = {
  desktop: true,
  macDesktop: true,
  windowsDesktop: true,
  windowsHost: true,
  notWindows: true,
};

function buildEntries(
  availability: SettingsSearchAvailability = allAvailable,
  isSectionAvailable: (section: SettingsSearchSection["id"]) => boolean = () => true,
) {
  return buildSettingsSearchEntries({
    sections,
    translate: (id) => zhCN[id] ?? "",
    fallbackTranslate: (id) => enUS[id],
    availability,
    isSectionAvailable,
  });
}

describe("settingsNavigationSearch", () => {
  it("按顺序字符匹配忽略大小写与空白", () => {
    const keys = settingsNavigationSearchKeys(["Chrome 硬件加速"]);
    expect(matchesSettingsNavigation("chr", keys)).toBe(true);
    expect(matchesSettingsNavigation("acc", keys)).toBe(false);
    expect(matchesSettingsNavigation("  ", keys)).toBe(true);
  });

  it("为中文标签生成拼音全拼与首字母 key", () => {
    const keys = settingsNavigationSearchKeys(["外观"]);
    expect(matchesSettingsNavigation("waiguan", keys)).toBe(true);
    expect(matchesSettingsNavigation("wg", keys)).toBe(true);
  });
});

describe("settingsSearchIndex", () => {
  it("索引里的名称与说明在 zh-CN / en-US 都有翻译", () => {
    const missing = SETTINGS_SEARCH_ITEMS.flatMap((item) =>
      [
        ["id", item.id],
        ["description", item.description],
      ].flatMap(([field, key]) => [
        ...(zhCN[key] ? [] : [`${field} ${key} 缺少 zh-CN`]),
        ...(enUS[key] ? [] : [`${field} ${key} 缺少 en-US`]),
      ]),
    );
    expect(missing).toEqual([]);
  });

  it("只投影当前分区与可见性允许的条目", () => {
    const webEntries = buildEntries({
      ...allAvailable,
      desktop: false,
      windowsDesktop: false,
      notWindows: false,
      windowsHost: false,
    });
    const ids = new Set(webEntries.map((entry) => entry.setting));
    expect(ids.has("settings.locale")).toBe(true);
    expect(ids.has("settings.desktopChromiumHardwareAcceleration")).toBe(false);
    expect(ids.has("settings.closeToTrayOnWindows")).toBe(false);
    expect(ids.has("settings.integratedTerminalShell")).toBe(false);
    expect(ids.has("settings.browser.import.title")).toBe(false);

    const withoutMemory = buildEntries(allAvailable, (section) => section !== "memory");
    expect(withoutMemory.some((entry) => entry.setting === "settings.memory.workspaceMemory")).toBe(
      false,
    );
    expect(withoutMemory.some((entry) => entry.section === "memory")).toBe(false);
  });

  it("平台条件隐藏的行不进入行索引", () => {
    const withoutMac = buildEntries({ ...allAvailable, macDesktop: false });
    expect(withoutMac.some((entry) => entry.setting === "settings.fontSmoothing")).toBe(false);
    expect(withoutMac.some((entry) => entry.setting === "settings.themeMode")).toBe(true);

    const withoutDesktop = buildEntries({
      ...allAvailable,
      desktop: false,
      windowsDesktop: false,
      windowsHost: false,
      notWindows: false,
    });
    expect(withoutDesktop.some((entry) => entry.setting === "settings.receivePreviewUpdates")).toBe(
      false,
    );
    expect(
      withoutDesktop.some(
        (entry) => entry.setting === "settings.desktopChromiumHardwareAcceleration",
      ),
    ).toBe(false);
    expect(withoutDesktop.some((entry) => entry.setting === "settings.themeMode")).toBe(true);
  });

  it("按 id 查找设置行，未登记的旧 id 返回 undefined", () => {
    expect(findSettingsSearchItem("settings.themeMode")?.section).toBe("appearance");
    expect(findSettingsSearchItem("settings.pluginAutoRecommendation")?.section).toBe("general");
    expect(findSettingsSearchItem("settings.removedRow")).toBeUndefined();
    expect(isSettingsSearchId("settings.themeMode")).toBe(true);
    expect(isSettingsSearchId("settings.removedRow")).toBe(false);
  });

  it("索引只描述入口，不持有任何配置值", () => {
    for (const item of SETTINGS_SEARCH_ITEMS) {
      expect(Object.keys(item).sort()).toEqual(["description", "id", "section", "visibility"]);
    }
  });
});

describe("filterSettingsSearchEntries", () => {
  it("按中文名称、拼音和英文回退过滤", () => {
    const entries = buildEntries();
    const byChinese = filterSettingsSearchEntries(entries, "外观");
    expect(byChinese.some((entry) => entry.section === "appearance" && !entry.setting)).toBe(true);
    expect(
      filterSettingsSearchEntries(entries, "主题").some(
        (entry) => entry.setting === "settings.themeMode",
      ),
    ).toBe(true);

    const byPinyin = filterSettingsSearchEntries(entries, "waiguan");
    expect(byPinyin[0]?.section).toBe("appearance");
    expect(byPinyin[0]?.setting).toBeUndefined();

    const byEnglish = filterSettingsSearchEntries(entries, "font smoothing");
    expect(byEnglish[0]?.setting).toBe("settings.fontSmoothing");
  });

  it("空查询返回全部条目，无命中返回空列表", () => {
    const entries = buildEntries();
    expect(filterSettingsSearchEntries(entries, "").length).toBe(entries.length);
    expect(filterSettingsSearchEntries(entries, "zzzzzzzz")).toEqual([]);
  });

  it("名称命中排在仅说明命中之前，结果是稳定顺序", () => {
    const entries: SettingsSearchEntry[] = [
      {
        section: "appearance",
        label: "外观",
        sectionLabel: "外观",
        keys: settingsNavigationSearchKeys(["外观"]),
        descriptionKeys: [],
      },
      {
        section: "general",
        label: "其它设置",
        sectionLabel: "常规",
        keys: settingsNavigationSearchKeys(["其它设置"]),
        descriptionKeys: ["这段说明提到外观"],
      },
    ];
    const results = filterSettingsSearchEntries(entries, "外观");
    expect(results.map((entry) => [entry.section, entry.rank])).toEqual([
      ["appearance", 0],
      ["general", 1],
    ]);
  });
});

describe("resolveSettingsSearchNavigation", () => {
  it("保留仍可见的分区与索引内的设置行", () => {
    expect(
      resolveSettingsSearchNavigation({
        result: { section: "appearance", setting: "settings.uiFontSize" },
        visibleSections: sections,
      }),
    ).toEqual({ section: "appearance", setting: "settings.uiFontSize" });
  });

  it("旧分区不可见时降级到回退分区并丢弃行目标", () => {
    expect(
      resolveSettingsSearchNavigation({
        result: {
          section: "remoteDevices",
          setting: "settings.uiFontSize",
        },
        visibleSections: sections,
      }),
    ).toEqual({ section: "general" });
  });

  it("索引已移除或与分区不一致的旧行 id 只保留分区", () => {
    expect(
      resolveSettingsSearchNavigation({
        result: {
          section: "appearance",
          setting: "settings.removedRow" as SettingsSearchId,
        },
        visibleSections: sections,
      }),
    ).toEqual({ section: "appearance" });
    expect(
      resolveSettingsSearchNavigation({
        result: { section: "general", setting: "settings.uiFontSize" },
        visibleSections: sections,
      }),
    ).toEqual({ section: "general" });
  });

  it("导航收敛不修改传入结果，也不携带配置值", () => {
    const result = Object.freeze({
      section: "appearance" as const,
      setting: "settings.themeMode" as const,
    });
    const resolved = resolveSettingsSearchNavigation({ result, visibleSections: sections });
    expect(resolved).toEqual({ section: "appearance", setting: "settings.themeMode" });
    expect(result).toEqual({ section: "appearance", setting: "settings.themeMode" });
    expect(Object.keys(resolved).sort()).toEqual(["section", "setting"]);
  });
});

describe("shouldUseSettingsSearchSectionFallback", () => {
  it("行级目标已挂载或仍在等待挂载时让位给设置行", () => {
    expect(shouldUseSettingsSearchSectionFallback("mounted")).toBe(false);
    expect(shouldUseSettingsSearchSectionFallback("pending")).toBe(false);
  });

  it("只到分区或行未挂载（平台隐藏、数据未就绪）时由分区兜底", () => {
    expect(shouldUseSettingsSearchSectionFallback("none")).toBe(true);
    expect(shouldUseSettingsSearchSectionFallback("missing")).toBe(true);
  });
});

describe("SettingsSearchSectionTarget", () => {
  it("命中当前分区时标记高亮，未命中时只渲染分区标识", () => {
    const matched = renderToStaticMarkup(
      createElement(
        SettingsSearchSectionTarget,
        { section: "appearance", target: { section: "appearance" } },
        createElement("span", null, "目标分区"),
      ),
    );
    expect(matched).toContain('data-settings-search-section="appearance"');
    expect(matched).toContain('data-settings-search-highlighted="true"');
    expect(matched).toContain("目标分区");

    const otherSection = renderToStaticMarkup(
      createElement(
        SettingsSearchSectionTarget,
        { section: "general", target: { section: "appearance" } },
        createElement("span", null, "当前分区"),
      ),
    );
    expect(otherSection).toContain('data-settings-search-section="general"');
    expect(otherSection).not.toContain("data-settings-search-highlighted");
  });

  it("行级目标不预先高亮分区，等行挂载失败后再兜底", () => {
    const html = renderToStaticMarkup(
      createElement(
        SettingsSearchSectionTarget,
        {
          section: "appearance",
          target: { section: "appearance", setting: "settings.themeMode" },
        },
        createElement("span", null, "目标分区"),
      ),
    );
    expect(html).toContain('data-settings-search-section="appearance"');
    expect(html).not.toContain("data-settings-search-highlighted");
  });
});
