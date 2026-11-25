// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsRow } from "@/settings/SettingsPageParts.js";
import type { SettingsSearchResult } from "@/settings-search/contract.js";
import {
  SettingsSearchSectionTarget,
  SettingsSearchTargetContext,
} from "@/settings-search/index.js";
import type { SettingsSearchId } from "@/settings-search/settingsSearchIndex.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const scrollIntoView = vi.fn();
let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(children: ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(children));
  return container;
}

async function settle(ms = 40) {
  // 两轮：第一轮触发行挂载检查与兜底状态更新，第二轮让滚动 effect 的 rAF 落地。
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function row(searchId?: SettingsSearchId) {
  return createElement(SettingsRow, {
    searchId,
    label: "主题",
    description: "界面主题",
    control: createElement("input", { defaultValue: "dark", "data-testid": "row-control" }),
  });
}

function targetProvider(id: SettingsSearchId, children: ReactNode) {
  return createElement(SettingsSearchTargetContext.Provider, { value: { id } }, children);
}

function sectionTarget(target: SettingsSearchResult, children: ReactNode = "外观") {
  return createElement(
    SettingsSearchSectionTarget,
    { section: "appearance", target },
    createElement("h2", null, children),
  );
}

beforeEach(() => {
  // jsdom 不实现元素滚动；行级与分区级定位都通过 scrollIntoView 表达。
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: scrollIntoView,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  scrollIntoView.mockReset();
});

describe("SettingsRow 行级定位", () => {
  it("命中设置行时滚动到行、聚焦并高亮，分区让位给行", async () => {
    const target: SettingsSearchResult = {
      section: "appearance",
      setting: "settings.themeMode",
    };
    const view = render(
      targetProvider(
        "settings.themeMode",
        createElement(
          "div",
          null,
          sectionTarget(target),
          row("settings.themeMode"),
          row("settings.uiFontSize"),
        ),
      ),
    );

    const targetRow = view.querySelector<HTMLElement>(
      '[data-settings-search-id="settings.themeMode"]',
    );
    expect(targetRow).not.toBeNull();
    expect(targetRow?.getAttribute("data-settings-search-highlighted")).toBe("true");
    expect(targetRow?.getAttribute("tabindex")).toBe("-1");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "instant" });

    // 行已挂载：分区不滚动、不高亮，避免双重定位。
    await settle();
    const section = view.querySelector<HTMLElement>('[data-settings-search-section="appearance"]');
    expect(section?.getAttribute("data-settings-search-highlighted")).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalledWith({ block: "start", behavior: "instant" });
  });

  it("未命中的行与未登记 searchId 的行不参与定位", () => {
    const view = render(
      targetProvider("settings.themeMode", createElement("div", null, row("settings.uiFontSize"))),
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(
      view
        .querySelector('[data-settings-search-id="settings.uiFontSize"]')
        ?.getAttribute("data-settings-search-highlighted"),
    ).toBeNull();

    act(() => root?.unmount());
    root = null;
    container?.remove();

    const untracked = render(row(undefined));
    expect(untracked.querySelector("[data-settings-search-id]")).toBeNull();
    expect(untracked.firstElementChild?.getAttribute("tabindex")).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("行级定位不修改设置值控件", async () => {
    const view = render(
      targetProvider("settings.themeMode", createElement("div", null, row("settings.themeMode"))),
    );
    await settle();
    const control = view.querySelector<HTMLInputElement>('[data-testid="row-control"]');
    expect(control?.value).toBe("dark");
    expect(control?.disabled).toBe(false);
  });
});

describe("SettingsSearchSectionTarget 兜底", () => {
  it("行被平台条件隐藏时回退到分区滚动并高亮", async () => {
    const target: SettingsSearchResult = {
      section: "appearance",
      setting: "settings.fontSmoothing",
    };
    const view = render(
      targetProvider("settings.fontSmoothing", createElement("div", null, sectionTarget(target))),
    );
    const section = view.querySelector<HTMLElement>('[data-settings-search-section="appearance"]');
    // 首帧不预先高亮，避免行尚未挂载时闪一下分区。
    expect(section?.getAttribute("data-settings-search-highlighted")).toBeNull();

    await settle(80);
    expect(section?.getAttribute("data-settings-search-highlighted")).toBe("true");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
  });

  it("分区级结果仍由分区定位", async () => {
    const view = render(sectionTarget({ section: "appearance" }));
    const section = view.querySelector<HTMLElement>('[data-settings-search-section="appearance"]');
    expect(section?.getAttribute("data-settings-search-highlighted")).toBe("true");
    await settle();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
  });

  it("索引外或已移除的旧行 id 也只保留分区定位", async () => {
    const target = {
      section: "appearance",
      setting: "settings.removedRow" as SettingsSearchId,
    } satisfies SettingsSearchResult;
    const view = render(
      targetProvider("settings.removedRow" as SettingsSearchId, sectionTarget(target)),
    );
    await settle(80);
    const section = view.querySelector<HTMLElement>('[data-settings-search-section="appearance"]');
    expect(section?.getAttribute("data-settings-search-highlighted")).toBe("true");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
  });
});
