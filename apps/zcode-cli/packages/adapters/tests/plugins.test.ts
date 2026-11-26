import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { addMarketplace, installMarketplacePlugin } from "../src/plugins/index.js";

// 扩展摘要是目录层元数据（packages/shared/spec/plugin-extension-summary.md），不属于插件 manifest。
// 从目录条目合成 plugin.json 时必须剔除，否则一份不完整的扩展信息会被当成清单内容。
describe("synthesized plugin manifest", () => {
  it("strips the catalog extension summary when it synthesizes a manifest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kayingcode-plugin-synth-extension-summary-"));
    const storageRoot = join(dir, "storage");
    const marketplaceRoot = join(dir, "marketplace");
    const pluginRoot = join(marketplaceRoot, "plugins", "ext-entry");
    const writeJson = async (path: string, value: unknown) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
    };

    try {
      await writeJson(join(marketplaceRoot, "marketplace.json"), {
        name: "ext-market",
        plugins: [
          {
            name: "ext-entry",
            source: "./plugins/ext-entry",
            strict: false,
            skills: "skills",
            displayName: "Ext Entry",
            componentTypes: ["extension"],
            extensionSummary: { engines: { zcode: "^1.4.0" }, grants: ["sessions.read"] },
          },
        ],
      });
      await mkdir(join(pluginRoot, "skills", "ext-entry"), { recursive: true });
      await writeFile(join(pluginRoot, "skills", "ext-entry", "SKILL.md"), "# ext");
      await addMarketplace({
        source: { source: "directory", path: marketplaceRoot },
        storageRoot,
      });

      const install = await installMarketplacePlugin({
        marketplace: "ext-market",
        name: "ext-entry",
        storageRoot,
      });
      const installPath = install.installed[0]?.installPath;
      expect(installPath).toBeDefined();
      const manifest = JSON.parse(
        await readFile(join(installPath!, ".claude-plugin", "plugin.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(manifest).toMatchObject({ name: "ext-entry", skills: "skills" });
      expect(manifest).not.toHaveProperty("extensionSummary");
      expect(manifest).not.toHaveProperty("displayName");
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
