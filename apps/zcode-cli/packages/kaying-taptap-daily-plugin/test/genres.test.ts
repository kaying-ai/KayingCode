import assert from "node:assert/strict";
import test from "node:test";

import { classifyGenres, genreLabel } from "../src/collector/genres.js";

test("classifies multi-label tags into tracks", () => {
  assert.deepEqual(classifyGenres(["二次元", "角色扮演"]), ["acgn", "open_world"]);
  assert.deepEqual(classifyGenres(["模拟经营"]), ["management"]);
  assert.deepEqual(classifyGenres(["射击", "FPS", "竞技"]), ["shooter", "multiplayer"]);
  assert.deepEqual(classifyGenres([]), ["other"]);
  assert.deepEqual(classifyGenres(["完全未知的标签"]), ["other"]);
});

test("genre labels are stable", () => {
  assert.equal(genreLabel("acgn"), "二次元");
  assert.equal(genreLabel("open_world"), "开放世界/RPG");
});
