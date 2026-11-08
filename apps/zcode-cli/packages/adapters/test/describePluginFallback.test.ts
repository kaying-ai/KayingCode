import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { describeMarketplacePlugin } from "../src/plugins/marketplace.js";

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function setupBundledMarketplaceWithoutCache(): {
  storageRoot: string;
  fallbackRoot: string;
  cleanup: () => void;
} {
  const storageRoot = mkdtempSync(join(tmpdir(), "kayingcode-describe-fallback-"));
  const marketplaceId = "kayingcode-plugins-official";
  const pluginName = "kaying-for-taptap";
  const missingCachePath = join(storageRoot, "cache", marketplaceId, pluginName, "1.6.10");
  const marketplaceDir = join(storageRoot, "marketplaces", marketplaceId);
  mkdirSync(marketplaceDir, { recursive: true });
  writeJson(join(marketplaceDir, "marketplace.json"), {
    name: marketplaceId,
    version: 1,
    plugins: [
      {
        cachePath: missingCachePath,
        name: pluginName,
        source: "filesystem",
        version: "1.6.10",
      },
    ],
  });
  writeJson(join(storageRoot, "known_marketplaces.json"), [
    {
      id: marketplaceId,
      name: marketplaceId,
      source: { source: "directory", path: marketplaceDir },
      addedAt: "",
      pluginCount: 1,
    },
  ]);

  // 源目录兜底：有可枚举组件，但 cache 从未落盘。
  const fallbackRoot = mkdtempSync(join(tmpdir(), "kayingcode-describe-fallback-root-"));
  mkdirSync(join(fallbackRoot, ".kayingcode-plugin"), { recursive: true });
  writeJson(join(fallbackRoot, ".kayingcode-plugin", "plugin.json"), {
    name: pluginName,
    version: "1.6.10",
  });
  mkdirSync(join(fallbackRoot, "skills", "game-qa"), { recursive: true });
  writeFileSync(
    join(fallbackRoot, "skills", "game-qa", "SKILL.md"),
    "---\nname: game-qa\ndescription: Verify TapTap Maker game changes\n---\n\n# game-qa\n",
  );

  return {
    storageRoot,
    fallbackRoot,
    cleanup: () => {
      rmSync(storageRoot, { recursive: true, force: true });
      rmSync(fallbackRoot, { recursive: true, force: true });
    },
  };
}

test("bundled cache 缺失时 describe 回退源目录枚举组件", async () => {
  const { storageRoot, fallbackRoot, cleanup } = setupBundledMarketplaceWithoutCache();
  try {
    const withFallback = await describeMarketplacePlugin({
      marketplace: "kayingcode-plugins-official",
      name: "kaying-for-taptap",
      storageRoot,
      resolveBundledFallbackRoot: (pluginName) =>
        pluginName === "kaying-for-taptap" ? fallbackRoot : undefined,
    });
    assert.ok(withFallback.components.length > 0, "should list components from fallback root");
    const skills = withFallback.components.find((group) => group.kind === "skill");
    assert.ok(skills?.items.some((item) => item.name === "game-qa"));
    assert.ok(
      withFallback.diagnostics.some((d) => d.code === "plugin_bundled_cache_missing"),
      "should mark cache-missing warning",
    );

    const withoutFallback = await describeMarketplacePlugin({
      marketplace: "kayingcode-plugins-official",
      name: "kaying-for-taptap",
      storageRoot,
    });
    assert.equal(withoutFallback.components.length, 0);
    assert.ok(withoutFallback.diagnostics.some((d) => d.severity === "error"));
  } finally {
    cleanup();
  }
});
