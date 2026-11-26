import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE } from "@zcode/contracts";
import { discoverNodePlugins } from "../src/plugins/index.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const pluginDir = (name: string) =>
  resolve(import.meta.dirname, `../../../../../apps/zcode-cli/packages/${name}`);

it("loads bundled game plugins through the upstream loader", async () => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-game-plugins-"));
  roots.push(root);
  const pluginNames = [
    ["blender-plugin", "blender"],
    ["kaying-for-taptap-plugin", "kaying-for-taptap"],
    ["kaying-game-playtest-plugin", "kaying-game-playtest"],
    ["kaying-computer-use-plugin", "computer-use"],
  ] as const;
  const ids = pluginNames.map(
    ([, name]) => `${name}@${KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE}` as const,
  );

  const outcome = await discoverNodePlugins({
    config: {
      dirs: [],
      enabled: true,
      enabledPlugins: {},
      extraKnownMarketplaces: {},
      options: {},
      suppressedBuiltins: [],
    },
    officialPluginRoots: pluginNames.map(([dir]) => pluginDir(dir)),
    officialPluginsEnabledByDefault: new Set(ids),
    storageRoot: root,
    workingDirectory: root,
  });

  for (const [index, [dir, name]] of pluginNames.entries()) {
    const plugin = outcome.plugins.find((candidate) => candidate.id === ids[index]);
    expect(plugin, `${dir} should be discovered`).toMatchObject({
      name,
      enabled: true,
      source: "official",
      marketplace: KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE,
    });
    expect(plugin?.skillRootCount).toBeGreaterThan(0);
  }

  // MCP 声明仍由上游 loader 解析；TapTap/Blender/Playtest/Computer Use 都有各自 server。
  expect(Object.keys(outcome.mcpServers).length).toBeGreaterThan(0);
});
