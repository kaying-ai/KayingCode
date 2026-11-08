import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PluginConfig } from "@zcode/contracts";
import { discoverNodePluginsSync } from "../src/plugins/index.js";

const pluginName = "browser-compare-fixture";

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writePlugin(root: string, publicationFile = ".maker/compare.v1.json"): void {
  writeJson(join(root, ".kayingcode-plugin", "plugin.json"), {
    name: pluginName,
    version: "1.0.0",
    uiContributions: {
      sidePanes: [
        {
          contractVersion: 1,
          id: "transcription-compare",
          kind: "browser-compare",
          title: "Compare",
          publicationFile,
          views: [
            { id: "source", label: "Source", profile: "standard-web" },
            { id: "target", label: "Target", profile: "taptap-preview" },
          ],
        },
      ],
    },
  });
}

function config(dirs: string[], enabledPlugins: Record<string, boolean> = {}): PluginConfig {
  return {
    dirs,
    enabled: true,
    enabledPlugins,
    extraKnownMarketplaces: {},
    options: {},
    suppressedBuiltins: [],
  };
}

test("projects only validated contributions from an enabled plugin", () => {
  const root = mkdtempSync(join(tmpdir(), "kayingcode-plugin-ui-"));
  const storageRoot = mkdtempSync(join(tmpdir(), "kayingcode-plugin-storage-"));
  try {
    writePlugin(root);
    const enabled = discoverNodePluginsSync({
      config: config([root]),
      storageRoot,
      workingDirectory: root,
    });
    assert.equal(enabled.plugins[0]?.uiContributions?.sidePanes.length, 1);

    const disabled = discoverNodePluginsSync({
      config: config([root], { [`${pluginName}@inline`]: false }),
      storageRoot,
      workingDirectory: root,
    });
    assert.equal(disabled.plugins[0]?.uiContributions, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(storageRoot, { recursive: true, force: true });
  }
});

test("fails closed when two enabled plugin identities share one manifest name", () => {
  const inlineRoot = mkdtempSync(join(tmpdir(), "kayingcode-plugin-ui-inline-"));
  const storageRoot = mkdtempSync(join(tmpdir(), "kayingcode-plugin-storage-"));
  const cachedRoot = join(storageRoot, "cache", "fixture-marketplace", pluginName, "1.0.0");
  try {
    writePlugin(inlineRoot);
    writePlugin(cachedRoot);
    writeJson(join(storageRoot, "installed_plugins.json"), {
      version: 1,
      plugins: [
        {
          id: `${pluginName}@fixture-marketplace`,
          name: pluginName,
          marketplace: "fixture-marketplace",
          version: "1.0.0",
          installPath: cachedRoot,
          installedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          scope: "user",
        },
      ],
    });
    const outcome = discoverNodePluginsSync({
      config: config([inlineRoot], {
        [`${pluginName}@fixture-marketplace`]: true,
      }),
      storageRoot,
      workingDirectory: inlineRoot,
    });
    assert.equal(outcome.plugins.length, 2);
    assert.ok(outcome.plugins.every((plugin) => plugin.uiContributions === undefined));
    assert.equal(
      outcome.diagnostics.filter(
        (diagnostic) => diagnostic.code === "plugin_ui_contribution_ambiguous",
      ).length,
      2,
    );
  } finally {
    rmSync(inlineRoot, { recursive: true, force: true });
    rmSync(storageRoot, { recursive: true, force: true });
  }
});
