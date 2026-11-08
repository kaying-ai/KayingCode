import assert from "node:assert/strict";
import { test } from "vitest";
import {
  DEFAULT_GAME_FEATURE_PAGE,
  GAME_FEATURE_PAGES,
  isGameFeaturePage,
} from "../src/lib/gameFeaturePages.js";

test("game center defaults to the TapMaker list and keeps source destinations", () => {
  assert.deepEqual(
    GAME_FEATURE_PAGES.map((page) => page.id),
    ["tapmaker-projects", "game-ranking", "free-token"],
  );
  assert.equal(DEFAULT_GAME_FEATURE_PAGE, "tapmaker-projects");
  assert.equal(GAME_FEATURE_PAGES[0].labelKey, "gameFeatures.myGames");
  assert.equal(GAME_FEATURE_PAGES[1].url, "https://www.taptap.cn/top/download");
  assert.equal(GAME_FEATURE_PAGES[2].url, "https://www.kayingai.com/freellm");
});

test("feature routes belong to the main view and exclude other sidebar destinations", () => {
  for (const page of GAME_FEATURE_PAGES) assert.equal(isGameFeaturePage(page.id), true);
  for (const page of ["chat", "plugin-store", "automations", "settings"])
    assert.equal(isGameFeaturePage(page), false);
});
