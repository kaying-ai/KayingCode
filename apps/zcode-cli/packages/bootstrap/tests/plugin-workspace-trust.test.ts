import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveKayingCodePlugins } from "../src/plugins.js";
import { setWorkspacePluginTrust } from "../src/workspace-plugin-trust/index.js";

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("resolveKayingCodePlugins workspace admission", () => {
  test("overlays private options and keeps project plugins pending until trusted", async () => {
    const root = await mkdtemp(join(tmpdir(), "kayingcode-bootstrap-plugin-"));
    const storageParent = await mkdtemp(join(tmpdir(), "kayingcode-bootstrap-storage-"));
    const pluginStorageRoot = join(storageParent, "plugins");
    const userConfigPath = join(root, "user", ".kayingcode", "config.json");
    const pluginRoot = join(root, "plugins", "workspace-demo");
    try {
      await writeJson(join(root, ".kayingcode", "config.json"), {
        plugins: {
          dirs: ["plugins/workspace-demo"],
          options: { "workspace-demo@inline": { token: "project-value" } },
        },
      });
      await writeJson(join(pluginRoot, ".zcode-plugin", "plugin.json"), {
        name: "workspace-demo",
        version: "1.0.0",
        skills: "./skills",
        userConfig: { token: { type: "string", sensitive: true } },
      });
      await mkdir(join(pluginRoot, "skills", "demo"), { recursive: true });
      await writeFile(
        join(pluginRoot, "skills", "demo", "SKILL.md"),
        "---\nname: demo\ndescription: Demo skill\n---\n# Demo\n",
      );
      await writeJson(join(storageParent, "plugin-secrets.json"), {
        version: 1,
        user: { "workspace-demo@inline": { token: "private-value" } },
        workspaces: {},
      });

      const options = {
        workingDirectory: root,
        pluginStorageRoot,
        userConfigPath,
        env: { ...process.env, HOME: join(root, "user"), USERPROFILE: join(root, "user") },
      };
      const pending = await resolveKayingCodePlugins(options);
      const pendingPlugin = pending.plugins.find((plugin) => plugin.id === "workspace-demo@inline");
      expect(pendingPlugin).toMatchObject({
        enabled: false,
        workspaceTrust: { state: "pending", pluginRoot: "plugins/workspace-demo" },
      });
      // 项目 plugins.options 不参与合并；敏感值来自私有文件。
      expect(pendingPlugin?.configuredOptions).toMatchObject({ token: "private-value" });
      expect(pendingPlugin?.skillRootCount).toBe(0);

      const digest = pendingPlugin!.workspaceTrust!.declarationDigest;
      const decision = await setWorkspacePluginTrust({
        workingDirectory: root,
        userConfigPath,
        pluginRoot: "plugins/workspace-demo",
        declarationDigest: digest,
        trusted: true,
      });
      expect(decision.accepted).toBe(true);

      const trusted = await resolveKayingCodePlugins(options);
      const trustedPlugin = trusted.plugins.find((plugin) => plugin.id === "workspace-demo@inline");
      expect(trustedPlugin).toMatchObject({
        enabled: true,
        workspaceTrust: { state: "trusted", declarationDigest: digest },
      });
      expect(trustedPlugin?.skillRootCount).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(storageParent, { recursive: true, force: true });
    }
  });
});
