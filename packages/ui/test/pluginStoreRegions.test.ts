import assert from "node:assert/strict";
import { test } from "vitest";
import {
  isPluginVisibleForStoreRegion,
  resolvePluginStoreRegion,
} from "../src/settings/pluginStoreListing.js";

const OFFICIAL = "kayingcode-plugins-official";

/** 只构造过滤判定所需的字段；listing.info 是完整运行时信息，这里用最小可用形状替身。 */
function item(input: {
  regions?: readonly ("cn" | "global")[];
  installed?: boolean;
  hasRuntimeInfo?: boolean;
  marketplace?: string;
}) {
  return {
    installed: input.installed ?? false,
    ...(input.hasRuntimeInfo ? { info: { enabled: true } as never } : {}),
    marketplace: input.marketplace ?? OFFICIAL,
    ...(input.regions ? { listing: { regions: [...input.regions] } } : {}),
  };
}

test("region is derived from locale until a login-region source exists", () => {
  assert.equal(resolvePluginStoreRegion("zh-CN"), "cn");
  assert.equal(resolvePluginStoreRegion("zh-TW"), "cn");
  assert.equal(resolvePluginStoreRegion("en-US"), "global");
  assert.equal(resolvePluginStoreRegion(""), "global");
});

test("listings without regions stay visible in every region", () => {
  assert.equal(isPluginVisibleForStoreRegion(item({}), "cn"), true);
  assert.equal(isPluginVisibleForStoreRegion(item({}), "global"), true);
});

test("region-restricted listings only show in their declared region", () => {
  const cnOnly = item({ regions: ["cn"] });
  const globalOnly = item({ regions: ["global"] });
  assert.equal(isPluginVisibleForStoreRegion(cnOnly, "cn"), true);
  assert.equal(isPluginVisibleForStoreRegion(cnOnly, "global"), false);
  assert.equal(isPluginVisibleForStoreRegion(globalOnly, "global"), true);
  assert.equal(isPluginVisibleForStoreRegion(globalOnly, "cn"), false);
});

test("installed plugins never disappear from the store", () => {
  assert.equal(
    isPluginVisibleForStoreRegion(item({ regions: ["cn"], installed: true }), "global"),
    true,
  );
  assert.equal(
    isPluginVisibleForStoreRegion(item({ regions: ["cn"], hasRuntimeInfo: true }), "global"),
    true,
  );
});

test("personal marketplaces are not region directed", () => {
  assert.equal(
    isPluginVisibleForStoreRegion(
      item({ regions: ["cn"], marketplace: "my-local-marketplace" }),
      "global",
    ),
    true,
  );
});
