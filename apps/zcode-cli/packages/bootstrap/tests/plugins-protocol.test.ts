import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  kayingcodePluginsOverviewParamsSchema,
  kayingcodePluginsOverviewResultSchema,
} from "@zcode/shared";
import { addMarketplace } from "@zcode/adapters/plugins";
import { getCliStorageRoot, getPluginStorageRoot } from "../src/app/paths.js";
import { getPluginsOverview, installPlugin } from "../src/kayingcode-protocol/plugins.js";
import type { KayingCodeProtocolAgentServerContext } from "../src/kayingcode-protocol/server-types.js";

// 扩展摘要的版本兼容（packages/shared/spec/plugin-extension-summary.md）：商店信息与 overview 结果是 strict，
// services 可能比 CLI 旧。CLI 只在参数带 includeExtensionSummary 时才写 listing.extensionSummary；
// 安装等其他结果一律不带。componentTypes 的 "extension" 是开放字符串，照常透传。
describe("plugins/overview extension summary", () => {
  const noopContext = {} as unknown as KayingCodeProtocolAgentServerContext;
  let previousEnv: Record<string, string | undefined>;
  let root = "";

  beforeEach(async () => {
    previousEnv = {
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
      KAYINGCODE_STORAGE_DIR: process.env.KAYINGCODE_STORAGE_DIR,
    };
    // 协议 handler 从 config 推导 storageRoot，user config 仍解析到 HOME：两者都重定向到临时目录，
    // 绝不触碰真实用户配置。
    root = await mkdtemp(join(tmpdir(), "kayingcode-bootstrap-extension-summary-"));
    process.env.HOME = join(root, "home");
    process.env.USERPROFILE = join(root, "home");
    process.env.KAYINGCODE_STORAGE_DIR = join(root, "cli");
    await mkdir(join(root, "home"), { recursive: true });
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { force: true, recursive: true });
  });

  it("adds listing.extensionSummary only when the request asks for it", async () => {
    const storageDir = join(root, "cli");
    const pluginStorageRoot = getPluginStorageRoot(getCliStorageRoot(storageDir));
    const marketplaceRoot = join(root, "marketplace");
    const summary = { engines: { zcode: "^1.4.0" }, grants: ["sessions.fullAccess"] };
    const writeJson = async (path: string, value: unknown) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
    };

    await writeJson(join(marketplaceRoot, ".claude-plugin", "marketplace.json"), {
      name: "ext-market",
      plugins: [
        {
          name: "ext-ok",
          source: "./plugins/ext-ok",
          version: "1.0.0",
          displayName: "Ext OK",
          componentTypes: ["extension"],
          extensionSummary: { ...summary, unknownKey: true },
        },
        { name: "plain", source: "./plugins/plain", version: "1.0.0" },
      ],
    });
    for (const name of ["ext-ok", "plain"]) {
      const pluginRoot = join(marketplaceRoot, "plugins", name);
      await writeJson(join(pluginRoot, ".claude-plugin", "plugin.json"), {
        name,
        skills: "skills",
        version: "1.0.0",
      });
      await mkdir(join(pluginRoot, "skills", name), { recursive: true });
      await writeFile(join(pluginRoot, "skills", name, "SKILL.md"), `# ${name}`);
    }
    await addMarketplace({
      source: { source: "directory", path: marketplaceRoot },
      storageRoot: pluginStorageRoot,
    });

    const workspace = { workspacePath: root, workspaceKey: root };
    const install = await installPlugin(noopContext, {
      workspace,
      marketplace: "ext-market",
      pluginName: "ext-ok",
    });
    expect(install.installedPlugins.map((plugin) => plugin.id)).toContain("ext-ok@ext-market");
    expect(JSON.stringify(install)).not.toContain("extensionSummary");

    const legacy = await getPluginsOverview(noopContext, { workspace });
    // 旧 services 的 strict schema 没有这个键；不要求时线上不能出现它。
    expect(JSON.stringify(legacy)).not.toContain("extensionSummary");
    expect(
      legacy.availablePlugins.find((plugin) => plugin.id === "ext-ok@ext-market")?.componentTypes,
    ).toContain("extension");

    const params = { workspace, includeExtensionSummary: true };
    expect(kayingcodePluginsOverviewParamsSchema.parse(params)).toEqual(params);
    const overview = kayingcodePluginsOverviewResultSchema.parse(
      await getPluginsOverview(noopContext, params),
    );
    const available = overview.availablePlugins.find((plugin) => plugin.id === "ext-ok@ext-market");
    expect(available?.listing).toEqual({ displayName: "Ext OK", extensionSummary: summary });
    expect(
      overview.installedPlugins.find((plugin) => plugin.id === "ext-ok@ext-market")?.listing,
    ).toEqual({ displayName: "Ext OK", extensionSummary: summary });
    const plain = overview.availablePlugins.find((plugin) => plugin.id === "plain@ext-market");
    expect(plain?.listing).toBeUndefined();
    expect(plain?.componentTypes ?? []).not.toContain("extension");
  });
});
