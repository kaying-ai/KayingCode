import assert from "node:assert/strict";
import { test } from "vitest";
import { KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID } from "@zcode/shared";
import { filterGameDevelopmentPlugins } from "../src/settings/gameDevelopmentPlugins.js";
import type { StorePluginItem } from "../src/settings/pluginStoreListing.js";

const make = (
  name: string,
  engines: string[],
  stages: string[],
  marketplace = KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID,
) =>
  ({
    id: `${name}@${marketplace}`,
    name,
    marketplace,
    installed: false,
    restorable: true,
    orphaned: false,
    listing: { displayName: name, gameDevelopment: { engines, stages } },
  }) as StorePluginItem;
const items = [
  make("Unity Tools", ["unity"], ["development", "testing"]),
  make("通用素材", [], ["assets"]),
  make("Unity Tools", ["unity"], ["development"], "local"),
  { ...make("legacy", [], ["assets"]), listing: undefined },
];

test("only explicitly tagged builtin plugins enter the game collection, including restorable ones", () => {
  assert.equal(
    filterGameDevelopmentPlugins(items, { engine: "all", stage: "all" }, "", "zh-CN").length,
    2,
  );
});

test("engine, lifecycle and search intersect; engine-neutral tools match every engine", () => {
  assert.deepEqual(
    filterGameDevelopmentPlugins(items, { engine: "godot", stage: "assets" }, "", "zh-CN").map(
      (item) => item.name,
    ),
    ["通用素材"],
  );
  assert.equal(
    filterGameDevelopmentPlugins(items, { engine: "unity", stage: "testing" }, "unity", "en-US")
      .length,
    1,
  );
  assert.equal(
    filterGameDevelopmentPlugins(items, { engine: "godot", stage: "testing" }, "", "en-US").length,
    0,
  );
  assert.equal(
    filterGameDevelopmentPlugins(items, { engine: "unity", stage: "assets" }, "unity", "en-US")
      .length,
    0,
  );
});

test("TapTap Maker filtering includes its declared plugins and engine-neutral tools", () => {
  const taptapItems = [...items, make("TapTap Maker", ["taptap-maker", "threejs"], ["publishing"])];
  assert.deepEqual(
    filterGameDevelopmentPlugins(taptapItems, { engine: "taptap-maker", stage: "all" }, "", "zh-CN")
      .map((item) => item.name)
      .toSorted(),
    ["TapTap Maker", "通用素材"].toSorted(),
  );
  assert.deepEqual(
    filterGameDevelopmentPlugins(
      taptapItems,
      { engine: "taptap-maker", stage: "publishing" },
      "",
      "zh-CN",
    ).map((item) => item.name),
    ["TapTap Maker"],
  );
});
