import assert from "node:assert/strict";
import { test } from "vitest";
import {
  isSameTapTapMakerApp,
  isTapTapGamePreviewView,
  shouldRestoreTapTapGamePreview,
  toTapTapGamePreviewUrl,
} from "./taptap-maker.js";

test("TapTap Maker preview URL selects the playable second tab", () => {
  assert.equal(
    toTapTapGamePreviewUrl("https://maker.taptap.cn/app/game-id?localDev=1&tab=publish"),
    "https://maker.taptap.cn/app/game-id?localDev=1&tab=preview",
  );
  assert.equal(
    toTapTapGamePreviewUrl("https://game.games.tapapps.cn/index.html"),
    "https://game.games.tapapps.cn/index.html",
  );
});

test("TapTap Maker SPA routes retain project ownership while preview selection is repaired", () => {
  const desired = "https://maker.taptap.cn/app/game-id?localDev=1&tab=preview";
  assert.equal(isSameTapTapMakerApp("https://maker.taptap.cn/app/game-id/chat", desired), true);
  assert.equal(isTapTapGamePreviewView(desired), true);
  assert.equal(isTapTapGamePreviewView("https://maker.taptap.cn/app/game-id/chat"), false);
  assert.equal(
    shouldRestoreTapTapGamePreview("https://maker.taptap.cn/app/game-id/chat", desired),
    true,
  );
  assert.equal(
    isSameTapTapMakerApp("https://maker.taptap.cn/app/another-game/chat", desired),
    false,
  );
  assert.equal(
    shouldRestoreTapTapGamePreview("https://maker.taptap.cn/app/another-game/chat", desired),
    false,
  );
});
