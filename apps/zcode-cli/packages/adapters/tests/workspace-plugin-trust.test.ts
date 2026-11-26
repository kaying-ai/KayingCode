import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { PluginConfig } from "@zcode/contracts";
import { discoverNodePlugins } from "../src/plugins/index.js";

function pluginConfig(): PluginConfig {
  return {
    dirs: [],
    enabled: true,
    enabledPlugins: {},
    extraKnownMarketplaces: {},
    options: {},
    suppressedBuiltins: [],
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeWorkspacePlugin(
  root: string,
  manifest: Record<string, unknown> = {},
): Promise<void> {
  await writeJson(join(root, ".zcode-plugin", "plugin.json"), {
    name: "workspace-demo",
    version: "1.0.0",
    skills: "./skills",
    ...manifest,
  });
  await mkdir(join(root, "skills", "demo"), { recursive: true });
  await writeFile(
    join(root, "skills", "demo", "SKILL.md"),
    "---\nname: demo\ndescription: Demo skill\n---\n# Demo\n",
  );
  await writeJson(join(root, ".mcp.json"), {
    mcpServers: {
      demo: { type: "stdio", command: "node", args: ["-e", ""] },
    },
  });
}

describe("workspace plugin trust", () => {
  test("pending disables components until the current declaration is trusted", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kayingcode-workspace-trust-"));
    const storageRoot = await mkdtemp(join(tmpdir(), "kayingcode-workspace-trust-storage-"));
    const pluginRoot = join(workspaceRoot, "plugins", "workspace-demo");
    try {
      await writeWorkspacePlugin(pluginRoot);
      const request = {
        config: pluginConfig(),
        storageRoot,
        workingDirectory: workspaceRoot,
        workspacePlugins: { workspaceRoot, roots: [pluginRoot], trusted: [] },
      };

      const pending = await discoverNodePlugins(request);
      expect(pending.plugins).toHaveLength(1);
      expect(pending.plugins[0]).toMatchObject({
        id: "workspace-demo@inline",
        enabled: false,
        workspaceTrust: { state: "pending", pluginRoot: "plugins/workspace-demo" },
      });
      expect(pending.mcpServers).toEqual({});
      expect(pending.skillRoots).toEqual([]);

      const digest = pending.plugins[0]!.workspaceTrust!.declarationDigest;
      const trusted = await discoverNodePlugins({
        ...request,
        workspacePlugins: {
          workspaceRoot,
          roots: [pluginRoot],
          trusted: [{ pluginRoot: "plugins/workspace-demo", declarationDigest: digest }],
        },
      });
      expect(trusted.plugins[0]).toMatchObject({
        enabled: true,
        workspaceTrust: { state: "trusted", declarationDigest: digest },
      });
      expect(Object.keys(trusted.mcpServers).length).toBeGreaterThan(0);
      expect(trusted.skillRoots.length).toBeGreaterThan(0);

      // 同一份信任摘要遇到声明变化必须重新 pending，不能沿用旧授权。
      await writeWorkspacePlugin(pluginRoot, { description: "changed" });
      const changed = await discoverNodePlugins({
        ...request,
        workspacePlugins: {
          workspaceRoot,
          roots: [pluginRoot],
          trusted: [{ pluginRoot: "plugins/workspace-demo", declarationDigest: digest }],
        },
      });
      expect(changed.plugins[0]?.workspaceTrust?.state).toBe("pending");
      expect(changed.plugins[0]?.enabled).toBe(false);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
      await rm(storageRoot, { recursive: true, force: true });
    }
  });

  test("prefers .zcode-plugin over .kayingcode-plugin when both exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "kayingcode-manifest-priority-"));
    const storageRoot = await mkdtemp(join(tmpdir(), "kayingcode-manifest-storage-"));
    try {
      await writeJson(join(root, ".zcode-plugin", "plugin.json"), {
        name: "from-zcode",
        version: "1.0.0",
      });
      await writeJson(join(root, ".kayingcode-plugin", "plugin.json"), {
        name: "from-kayingcode",
        version: "1.0.0",
      });
      const outcome = await discoverNodePlugins({
        config: { ...pluginConfig(), dirs: [root] },
        storageRoot,
        workingDirectory: root,
      });
      expect(outcome.plugins.map((plugin) => plugin.name)).toEqual(["from-zcode"]);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(storageRoot, { recursive: true, force: true });
    }
  });
});
