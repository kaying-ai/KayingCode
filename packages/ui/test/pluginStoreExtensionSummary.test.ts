// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, test, vi } from "vitest";
import { EXTENSION_API_VERSION } from "@zcode/shared/extension-host";
import {
  canUpdatePluginItem,
  hasInstallableUpdate,
  isExtensionIncompatible,
  isPluginStoreUpdateBlocked,
  isStoreItemInstallBlocked,
  type StorePluginItem,
} from "../src/settings/pluginStoreListing.js";
import { PluginStoreDetailView } from "../src/settings/PluginStoreDetailView.js";
import { PluginStoreCard, type PluginStoreActions } from "../src/settings/PluginStoreCard.js";

vi.mock("@/i18n/IntlProvider.js", async () => {
  const enUS = (await import("@/i18n/locales/en-US.js")).default;
  const formatMessage = (
    descriptor: { id: string },
    values?: Record<string, string | number>,
  ): string =>
    (enUS[descriptor.id] ?? descriptor.id).replace(/\{(\w+)\}/g, (_match, key: string) =>
      values?.[key] !== undefined ? String(values[key]) : `{${key}}`,
    );
  return {
    useKayingCodeIntl: () => ({
      intl: { formatMessage },
      locale: "en-US",
      localePreference: "en-US",
      setLocalePreference: () => {},
    }),
  };
});

vi.mock("@/extension-slots/index.js", () => ({
  ExtensionPermissionsSection: () => null,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const OFFICIAL = "kayingcode-plugins-official";
const COMPATIBLE = `^${EXTENSION_API_VERSION}`;
/** 主版本高于宿主：任何当前插件 API 版本都跑不了。 */
const INCOMPATIBLE = "^999.0.0";

function listing(extensionSummary?: {
  engines: { zcode: string };
  grants: string[];
}): StorePluginItem["listing"] {
  return extensionSummary ? { extensionSummary } : {};
}

function storeItem(overrides: Partial<StorePluginItem> = {}): StorePluginItem {
  return {
    id: "demo@kayingcode-plugins-official",
    name: "demo",
    marketplace: OFFICIAL,
    installed: false,
    restorable: false,
    orphaned: false,
    ...overrides,
  };
}

const actions: PluginStoreActions = {
  onOpenDetail: () => {},
  onInstall: () => {},
  onUninstall: () => {},
  onUpdate: () => {},
  operationId: null,
  togglingPluginId: null,
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderDetail(item: StorePluginItem): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      createElement(PluginStoreDetailView, {
        item,
        actions,
        onRetryDescribe: () => {},
        onUsePrompt: () => {},
      }),
    ),
  );
  return container;
}

function renderCard(item: StorePluginItem): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(createElement(PluginStoreCard, { item, actions, locale: "en-US" })),
  );
  return container;
}

function query(target: HTMLElement, testId: string): HTMLElement | null {
  return target.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe("extension compatibility rules", () => {
  test("compatible range keeps install enabled and reports no incompatibility", () => {
    const item = storeItem({
      listing: listing({ engines: { zcode: COMPATIBLE }, grants: [] }),
    });
    assert.equal(isExtensionIncompatible(item.listing), false);
    assert.equal(isStoreItemInstallBlocked(item), false);
  });

  test("incompatible range blocks a not-yet-installed entry regardless of other fields", () => {
    const item = storeItem({
      listing: listing({ engines: { zcode: INCOMPATIBLE }, grants: [] }),
    });
    assert.equal(isExtensionIncompatible(item.listing), true);
    assert.equal(isStoreItemInstallBlocked(item), true);
  });

  test("restorable builtin entries are never blocked by the summary", () => {
    const item = storeItem({
      restorable: true,
      listing: listing({ engines: { zcode: INCOMPATIBLE }, grants: [] }),
    });
    assert.equal(isStoreItemInstallBlocked(item), false);
  });

  test("installed entries do not use the install gate", () => {
    const item = storeItem({
      installed: true,
      listing: listing({ engines: { zcode: INCOMPATIBLE }, grants: [] }),
    });
    assert.equal(isStoreItemInstallBlocked(item), false);
  });

  test("unknown range syntax is treated as incompatible", () => {
    const item = storeItem({
      listing: listing({ engines: { zcode: ">=1.4.0" }, grants: [] }),
    });
    assert.equal(isExtensionIncompatible(item.listing), true);
  });
});

describe("extension summary degradation", () => {
  test("absent summary behaves exactly as before", () => {
    const bare = storeItem();
    assert.equal(isExtensionIncompatible(bare.listing), false);
    assert.equal(isStoreItemInstallBlocked(bare), false);
    assert.equal(isExtensionIncompatible(undefined), false);
  });

  test("absent summary leaves update availability to the CLI status", () => {
    const installedMeta = {
      id: "demo",
      name: "demo",
      marketplace: OFFICIAL,
      enabled: true,
      scope: "user" as const,
      updateStatus: "update-available" as const,
      latestVersion: "2.0.0",
    };
    assert.equal(hasInstallableUpdate(installedMeta), true);
    const item = storeItem({ installed: true, installedMeta });
    assert.equal(canUpdatePluginItem(item), true);
    assert.equal(isPluginStoreUpdateBlocked(item), false);
  });

  test("compatible summary keeps the update entry points", () => {
    const item = storeItem({
      installed: true,
      installedMeta: {
        id: "demo",
        name: "demo",
        marketplace: OFFICIAL,
        enabled: true,
        scope: "user",
        updateStatus: "update-available",
        latestVersion: "2.0.0",
        listing: listing({ engines: { zcode: COMPATIBLE }, grants: [] }),
      },
    });
    assert.equal(canUpdatePluginItem(item), true);
    assert.equal(isPluginStoreUpdateBlocked(item), false);
  });
});

describe("installed-but-now-incompatible updates", () => {
  test("update is blocked when the latest listing needs a newer plugin API", () => {
    const item = storeItem({
      installed: true,
      installedMeta: {
        id: "demo",
        name: "demo",
        marketplace: OFFICIAL,
        enabled: true,
        scope: "user",
        updateStatus: "update-available",
        latestVersion: "2.0.0",
        listing: listing({ engines: { zcode: INCOMPATIBLE }, grants: [] }),
      },
    });
    assert.equal(hasInstallableUpdate(item.installedMeta), false);
    assert.equal(canUpdatePluginItem(item), false);
    assert.equal(isPluginStoreUpdateBlocked(item), true);
  });

  test("orphaned entries stay non-updatable without the extension hint", () => {
    const item = storeItem({
      installed: true,
      orphaned: true,
      installedMeta: {
        id: "demo",
        name: "demo",
        marketplace: OFFICIAL,
        enabled: true,
        scope: "user",
        updateStatus: "update-available",
        listing: listing({ engines: { zcode: INCOMPATIBLE }, grants: [] }),
      },
    });
    assert.equal(canUpdatePluginItem(item), false);
  });
});

describe("detail view install gating and notice", () => {
  it("keeps install enabled and renders no notice without a summary", () => {
    const target = renderDetail(storeItem({ listing: listing() }));
    const install = query(target, "plugin-store-install");
    assert.ok(install);
    assert.equal(install.hasAttribute("disabled"), false);
    assert.equal(query(target, "plugin-store-extension-notice"), null);
    assert.equal(query(target, "plugin-store-extension-incompatible"), null);
  });

  it("renders the extension notice with grants and the engine requirement when compatible", () => {
    const target = renderDetail(
      storeItem({
        listing: listing({
          engines: { zcode: COMPATIBLE },
          grants: ["sessions.read", "sessions.write", "notifications", "future.grant"],
        }),
      }),
    );
    const install = query(target, "plugin-store-install");
    assert.ok(install);
    assert.equal(install.hasAttribute("disabled"), false);
    assert.equal(query(target, "plugin-store-extension-incompatible"), null);

    const notice = query(target, "plugin-store-extension-notice");
    assert.ok(notice);
    const grants = [...notice.querySelectorAll<HTMLElement>('[data-testid="plugin-store-extension-grant"]')];
    assert.deepEqual(
      grants.map((grant) => grant.dataset.grant),
      // read 被 write 覆盖；未知档位原样排在被收窄的已知档位之后。
      ["sessions.write", "notifications", "future.grant"],
    );
    assert.equal(grants[0]?.textContent, "Read and change sessions");
    assert.equal(grants[2]?.textContent, "future.grant");

    const engines = query(target, "plugin-store-extension-engines");
    assert.ok(engines);
    assert.equal(engines.dataset.engines, COMPATIBLE);
    assert.ok(engines.textContent?.includes(COMPATIBLE));
    assert.equal(query(target, "plugin-store-extension-full-access"), null);
    expect(notice.textContent).toContain("Requested permissions");
  });

  it("lists full access separately and shows the empty permissions state", () => {
    const fullAccess = renderDetail(
      storeItem({
        listing: listing({
          engines: { zcode: COMPATIBLE },
          grants: ["sessions.read", "sessions.write", "sessions.fullAccess"],
        }),
      }),
    );
    const grants = [
      ...fullAccess.querySelectorAll<HTMLElement>('[data-testid="plugin-store-extension-grant"]'),
    ];
    assert.deepEqual(
      grants.map((grant) => grant.dataset.grant),
      ["sessions.fullAccess"],
    );
    assert.ok(query(fullAccess, "plugin-store-extension-full-access"));

    act(() => root?.unmount());
    root = null;
    container?.remove();

    const noGrants = renderDetail(
      storeItem({ listing: listing({ engines: { zcode: COMPATIBLE }, grants: [] }) }),
    );
    assert.ok(query(noGrants, "plugin-store-extension-no-grants"));
    assert.equal(query(noGrants, "plugin-store-extension-grant"), null);
  });

  it("disables install and shows the reason when incompatible", () => {
    const target = renderDetail(
      storeItem({
        listing: listing({ engines: { zcode: INCOMPATIBLE }, grants: [] }),
      }),
    );
    const install = query(target, "plugin-store-install");
    assert.ok(install);
    assert.equal(install.hasAttribute("disabled"), true);
    assert.equal(install.dataset.installBlocked, "requires-update");
    assert.equal(install.textContent, "Requires newer KayingCode");
    const hint = query(target, "plugin-store-extension-incompatible");
    assert.ok(hint);
    assert.equal(
      hint.textContent,
      "This plugin needs a newer version of KayingCode. Update KayingCode, then install it.",
    );
  });

  it("surfaces the blocked update state for an installed incompatible update", () => {
    const target = renderDetail(
      storeItem({
        installed: true,
        info: {
          id: "demo@kayingcode-plugins-official",
          name: "demo",
          marketplace: OFFICIAL,
          enabled: true,
          components: [],
        } as never,
        installedMeta: {
          id: "demo",
          name: "demo",
          marketplace: OFFICIAL,
          enabled: true,
          scope: "user",
          updateStatus: "update-available",
          listing: listing({ engines: { zcode: INCOMPATIBLE }, grants: [] }),
        },
      }),
    );
    const hint = query(target, "plugin-store-extension-update-blocked");
    assert.ok(hint);
    assert.equal(
      hint.textContent,
      "The latest version needs a newer KayingCode. Update KayingCode to install this update.",
    );
    // 已安装条目不显示安装按钮，也不显示安装前的扩展说明。
    assert.equal(query(target, "plugin-store-install"), null);
    assert.equal(query(target, "plugin-store-extension-notice"), null);
  });
});

describe("store card actions", () => {
  it("shows a disabled install button with the reason for incompatible entries", () => {
    const target = renderCard(
      storeItem({ listing: listing({ engines: { zcode: INCOMPATIBLE }, grants: [] }) }),
    );
    const install = query(target, "plugin-store-install");
    assert.ok(install);
    assert.equal(install.hasAttribute("disabled"), true);
    assert.equal(install.textContent, "Requires newer KayingCode");
  });

  it("hides the update button and explains why when the latest version is incompatible", () => {
    const target = renderCard(
      storeItem({
        installed: true,
        info: {
          id: "demo@kayingcode-plugins-official",
          name: "demo",
          marketplace: OFFICIAL,
          enabled: true,
          components: [],
        } as never,
        installedMeta: {
          id: "demo",
          name: "demo",
          marketplace: OFFICIAL,
          enabled: true,
          scope: "user",
          updateStatus: "update-available",
          listing: listing({ engines: { zcode: INCOMPATIBLE }, grants: [] }),
        },
      }),
    );
    assert.equal(query(target, "plugin-store-card-update"), null);
    assert.ok(query(target, "plugin-store-extension-update-blocked"));
  });

  it("keeps the update button for compatible updates", () => {
    const target = renderCard(
      storeItem({
        installed: true,
        info: {
          id: "demo@kayingcode-plugins-official",
          name: "demo",
          marketplace: OFFICIAL,
          enabled: true,
          components: [],
        } as never,
        installedMeta: {
          id: "demo",
          name: "demo",
          marketplace: OFFICIAL,
          enabled: true,
          scope: "user",
          updateStatus: "update-available",
          listing: listing({ engines: { zcode: COMPATIBLE }, grants: [] }),
        },
      }),
    );
    assert.ok(query(target, "plugin-store-card-update"));
    assert.equal(query(target, "plugin-store-extension-update-blocked"), null);
  });
});
