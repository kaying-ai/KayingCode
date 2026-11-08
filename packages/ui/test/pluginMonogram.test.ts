import assert from "node:assert/strict";
import { test } from "vitest";
import {
  getPluginMonogramFontSize,
  resolvePluginMonogram,
  resolvePluginMonogramGlyph,
} from "../src/lib/pluginMonogram.js";

test("monogram glyph prefers display label and skips leading symbols", () => {
  assert.equal(resolvePluginMonogramGlyph("浏览器操作"), "浏");
  assert.equal(resolvePluginMonogramGlyph("TapTap Maker"), "T");
  assert.equal(resolvePluginMonogramGlyph("  @browser-use"), "B");
  assert.equal(resolvePluginMonogramGlyph("1password"), "1");
  assert.equal(resolvePluginMonogramGlyph("   "), undefined);
  assert.equal(resolvePluginMonogramGlyph(undefined), undefined);
});

test("monogram stays monochrome and distinguishes by glyph only", () => {
  const browser = resolvePluginMonogram({
    pluginId: "browser-use@kayingcode-plugins-official",
    label: "浏览器操作",
  });
  const maker = resolvePluginMonogram({
    pluginId: "taptap-maker@kayingcode-plugins-official",
    label: "TapTap Maker",
  });

  assert.ok(browser && maker);
  assert.equal(browser.glyph, "浏");
  assert.equal(maker.glyph, "T");
  // 黑白灰：不再按 id 上彩色；区分靠字形。
  assert.equal(browser.colorClass, "bg-surface text-foreground");
  assert.equal(maker.colorClass, browser.colorClass);
  assert.doesNotMatch(browser.colorClass, /sky|cyan|emerald|amber|violet|pink|rose|orange/iu);
});

test("monogram falls back to plugin id when label is empty", () => {
  const monogram = resolvePluginMonogram({ pluginId: "pdf@kayingcode-plugins-official" });
  assert.ok(monogram);
  assert.equal(monogram.glyph, "P");
});

test("CJK glyph uses slightly smaller font size than Latin", () => {
  assert.ok(getPluginMonogramFontSize("浏") < getPluginMonogramFontSize("B"));
  assert.equal(getPluginMonogramFontSize("B"), getPluginMonogramFontSize("T"));
});
