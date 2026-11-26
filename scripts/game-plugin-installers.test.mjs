import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  loadGamePluginInstallerConfig,
  validateGamePluginInstallerConfig,
} from "./generate-game-plugin-installers.mjs";

const root = resolve(import.meta.dirname, "..");

function validConfig() {
  return {
    schemaVersion: 1,
    catalog: {
      name: "open-zcode-game-plugins",
      url: "https://raw.githubusercontent.com/kaying-ai/open-zcode-game-plugins/main/catalog.json",
      repositoryUrl: "https://github.com/kaying-ai/open-zcode-game-plugins",
    },
    installers: [
      {
        name: "kaying-for-ui",
        version: "0.2.0",
        host: "kayingcode",
        displayName: { "zh-CN": "游戏 UI", en: "Game UI" },
        description: { "zh-CN": "说明", en: "Description" },
        engines: [],
        stages: ["development"],
        source: {
          kind: "open-source",
          tier: "official",
          repositoryUrl: "https://gitee.com/citiao/kaying-for-ui",
        },
        addedAt: "2026-11-26",
      },
    ],
  };
}

test("checked-in installer config is valid and contains kaying-for-ui", async () => {
  const config = await loadGamePluginInstallerConfig(root);
  const installer = config.installers.find((entry) => entry.name === "kaying-for-ui");
  assert.ok(installer);
  assert.equal(installer.host, "kayingcode");
  assert.ok(installer.stages.includes("development"));
  assert.equal(installer.source.kind, "open-source");
});

test("rejects unsafe catalog and repository urls", () => {
  for (const url of [
    "http://example.com/catalog.json",
    "https://user:pass@example.com/catalog.json",
    "https://example.com:8443/catalog.json",
    "https://example.com/catalog.json?token=1",
    "https://example.com/catalog.json#frag",
    "https://example.com/catalog.txt",
  ]) {
    const config = validConfig();
    config.catalog.url = url;
    assert.throws(() => validateGamePluginInstallerConfig(config), /catalog\.url/u, url);
  }
  const config = validConfig();
  config.installers[0].source = {
    kind: "open-source",
    tier: "official",
    repositoryUrl: "https://example.com:1/x",
  };
  assert.throws(() => validateGamePluginInstallerConfig(config), /repositoryUrl/u);
});

test("rejects malformed installers", () => {
  const cases = [
    (config) => {
      config.installers[0].stages = [];
    },
    (config) => {
      config.installers[0].engines = ["definitely-not-an-engine"];
    },
    (config) => {
      config.installers[0].displayName = { "zh-CN": "只有中文" };
    },
    (config) => {
      config.installers[0].host = "zcode";
    },
    (config) => {
      config.installers[0].source = {
        kind: "open-source",
        repositoryUrl: "https://example.com/plugin",
      };
    },
    (config) => {
      config.installers[0].source = {
        kind: "open-source",
        tier: "partner",
        repositoryUrl: "https://example.com/plugin",
      };
    },
    (config) => {
      config.installers[0].unexpected = true;
    },
    (config) => {
      config.installers.push({ ...config.installers[0] });
    },
  ];
  for (const mutate of cases) {
    const config = validConfig();
    mutate(config);
    assert.throws(() => validateGamePluginInstallerConfig(config));
  }
});
