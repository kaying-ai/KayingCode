import assert from "node:assert/strict";
import { test } from "vitest";
import {
  kayingcodePluginStoreListingSchema,
  kayingcodePluginStoreRegionSchema,
  kayingcodePluginsOverviewResultSchema,
} from "../src/kayingcode-protocol/index.js";

test("store regions accept only the two known values", () => {
  assert.equal(kayingcodePluginStoreRegionSchema.safeParse("cn").success, true);
  assert.equal(kayingcodePluginStoreRegionSchema.safeParse("global").success, true);
  for (const value of ["mars", "CN", "", 1, null, undefined]) {
    assert.equal(kayingcodePluginStoreRegionSchema.safeParse(value).success, false);
  }
});

test("legacy listings without regions keep parsing", () => {
  assert.deepEqual(kayingcodePluginStoreListingSchema.parse({ displayName: "Legacy" }), {
    displayName: "Legacy",
  });
  // 游戏展示字段与 regions 正交：同一条目可同时携带，各自独立生效。
  const parsed = kayingcodePluginStoreListingSchema.parse({
    displayName: "Game",
    regions: ["cn"],
    gameDevelopment: { engines: ["unity"], stages: ["development"] },
  });
  assert.deepEqual(parsed.regions, ["cn"]);
  assert.deepEqual(parsed.gameDevelopment, { engines: ["unity"], stages: ["development"] });
});

test("unknown regions and non-list values are rejected by the strict listing", () => {
  for (const regions of [["mars"], "cn", { cn: true }, [1], [null]]) {
    assert.equal(kayingcodePluginStoreListingSchema.safeParse({ regions }).success, false);
  }
});

test("plugins/overview keeps regions through the service-facing protocol parse", () => {
  const overview = kayingcodePluginsOverviewResultSchema.parse({
    marketplaces: [],
    availablePlugins: [
      {
        id: "game@kayingcode-plugins-official",
        name: "game",
        marketplace: "kayingcode-plugins-official",
        installed: false,
        listing: { displayName: "Game", regions: ["cn"] },
      },
    ],
    installedPlugins: [],
    restorableBuiltins: [],
    diagnostics: [],
    capability: { supported: true },
  });
  assert.deepEqual(overview.availablePlugins[0]?.listing?.regions, ["cn"]);
});
