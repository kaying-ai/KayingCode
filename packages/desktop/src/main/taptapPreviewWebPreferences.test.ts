import assert from "node:assert/strict";
import { test } from "vitest";
import {
  applyTapTapPreviewGuestPreferences,
  resolveTapTapPreviewGuestPartition,
} from "./taptapPreviewWebPreferences.js";

test("TapTap preview profile enables shared-memory WASM only for its fixed partition", () => {
  const webPreferences: { enableBlinkFeatures?: string; partition?: string } = {};
  const params = { partition: "persist:kayingcode-taptap-preview" };

  assert.equal(resolveTapTapPreviewGuestPartition(webPreferences, params), true);
  assert.equal(applyTapTapPreviewGuestPreferences(webPreferences, params), true);
  assert.equal(webPreferences.partition, "persist:kayingcode-taptap-preview");
  assert.equal(webPreferences.enableBlinkFeatures, "SharedArrayBuffer");
});

test("ordinary embedded browser guests do not inherit TapTap Blink features", () => {
  const webPreferences: { enableBlinkFeatures?: string; partition?: string } = {};
  const params = { partition: "persist:kayingcode-embedded-browser" };

  assert.equal(applyTapTapPreviewGuestPreferences(webPreferences, params), false);
  assert.equal(webPreferences.enableBlinkFeatures, undefined);
});
