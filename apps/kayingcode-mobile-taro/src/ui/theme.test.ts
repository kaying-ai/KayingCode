import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeThemeMode } from "./themeTokens";

describe("Flutter theme parity", () => {
  test("keeps dark as the default and accepts the three Flutter modes", () => {
    assert.equal(normalizeThemeMode(null), "dark");
    assert.equal(normalizeThemeMode("light"), "light");
    assert.equal(normalizeThemeMode("system"), "system");
    assert.equal(normalizeThemeMode("invalid"), "dark");
  });

  test("uses the same root, card, and primary contrast as Flutter", async () => {
    const css = await readFile(new URL("../app.css", import.meta.url), "utf8");
    const flutter = await readFile(
      new URL("../../../kayingcode-mobile-flutter/lib/ui/theme.dart", import.meta.url),
      "utf8",
    );
    assert.match(css, /--bg: #161616;/);
    assert.match(css, /--card: #2b2b2b;/);
    assert.match(css, /--bg: #f8f8f8;/);
    assert.match(css, /--card: #fff;/);
    assert.match(css, /--primary: #fff;\s*--on-primary: #000;/);
    assert.match(css, /--primary: #000;\s*--on-primary: #fff;/);
    assert.match(flutter, /bg => isDark \? const Color\(0xFF161616\) : const Color\(0xFFF8F8F8\)/);
    assert.match(flutter, /card => isDark \? const Color\(0xFF2B2B2B\) : Colors\.white/);
  });
});
