import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KAYINGCODE_INLINE_PLUGIN_MARKETPLACE } from "@zcode/contracts";
import { KAYINGCODE_PLUGIN_ID_ENV_KEY, ZCODE_PLUGIN_ID_ENV_KEY } from "@zcode/shared";
import { describe, expect, it } from "vitest";
import { createNodePluginAdapter } from "../src/plugins/index.js";

const PLUGIN_NAME = "zcode-compat-plugin";

async function withPluginRoot(
  run: (input: { pluginRoot: string; root: string }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-plugin-zcode-compat-"));
  try {
    await run({ pluginRoot: join(root, PLUGIN_NAME), root });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeManifest(pluginRoot: string, dir: string, manifest: unknown): Promise<void> {
  await mkdir(join(pluginRoot, dir), { recursive: true });
  await writeFile(join(pluginRoot, dir, "plugin.json"), JSON.stringify(manifest));
}

function discover(pluginRoot: string, root: string) {
  const storageRoot = join(root, "storage");
  return createNodePluginAdapter({ storageRoot }).discoverPlugins({
    config: {
      dirs: [pluginRoot],
      enabled: true,
      enabledPlugins: {},
      options: {},
      suppressedBuiltins: [],
    },
    env: {},
    storageRoot,
    workingDirectory: root,
  });
}

describe("upstream ZCode plugin compatibility", () => {
  it("prefers .zcode-plugin over .kayingcode-plugin", async () => {
    await withPluginRoot(async ({ pluginRoot, root }) => {
      await writeManifest(pluginRoot, ".kayingcode-plugin", {
        name: PLUGIN_NAME,
        version: "1.0.0",
        description: "local manifest",
      });
      await writeManifest(pluginRoot, ".zcode-plugin", {
        name: PLUGIN_NAME,
        version: "2.0.0",
        description: "upstream manifest",
      });

      const outcome = await discover(pluginRoot, root);

      expect(outcome.diagnostics).toEqual([]);
      expect(outcome.plugins).toHaveLength(1);
      expect(outcome.plugins[0]).toMatchObject({ version: "2.0.0", description: "upstream manifest" });
      expect(outcome.plugins[0]?.manifestPath).toContain(join(".zcode-plugin", "plugin.json"));
    });
  });

  it("expands ZCODE_* variables and keeps user_config expansion", async () => {
    await withPluginRoot(async ({ pluginRoot, root }) => {
      await writeManifest(pluginRoot, ".zcode-plugin", {
        name: PLUGIN_NAME,
        version: "1.0.0",
        userConfig: { token: { type: "string", default: "configured" } },
        mcpServers: {
          compat: {
            type: "stdio",
            command: "node",
            args: [
              "${ZCODE_PLUGIN_ROOT}/server.js",
              "${ZCODE_PLUGIN_DATA}/state.json",
              "${ZCODE_PROJECT_DIR}",
              "${ZCODE_PLUGIN_ID}",
              "${ZCODE_PLUGIN_NAME}",
              "${user_config.token}",
            ],
            env: {
              ROOT: "${ZCODE_PLUGIN_ROOT}",
              DATA: "${ZCODE_PLUGIN_DATA}",
              NAME: "${ZCODE_PLUGIN_NAME}",
            },
          },
        },
      });

      const outcome = await discover(pluginRoot, root);
      const metadata = outcome.plugins[0];
      const server = outcome.mcpServers[`plugin:${PLUGIN_NAME}:compat`];

      expect(outcome.diagnostics).toEqual([]);
      expect(metadata?.dataPath).toBeTruthy();
      expect(server?.type).toBe("stdio");
      expect(server?.args).toEqual([
        `${pluginRoot}/server.js`,
        `${metadata?.dataPath}/state.json`,
        root,
        `${PLUGIN_NAME}@${KAYINGCODE_INLINE_PLUGIN_MARKETPLACE}`,
        PLUGIN_NAME,
        "configured",
      ]);
      expect(server?.env).toMatchObject({
        ROOT: pluginRoot,
        DATA: metadata?.dataPath,
        NAME: PLUGIN_NAME,
        [KAYINGCODE_PLUGIN_ID_ENV_KEY]: `${PLUGIN_NAME}@${KAYINGCODE_INLINE_PLUGIN_MARKETPLACE}`,
        [ZCODE_PLUGIN_ID_ENV_KEY]: `${PLUGIN_NAME}@${KAYINGCODE_INLINE_PLUGIN_MARKETPLACE}`,
      });
    });
  });

  it("still expands KAYINGCODE_* variables for local plugins", async () => {
    await withPluginRoot(async ({ pluginRoot, root }) => {
      await writeManifest(pluginRoot, ".kayingcode-plugin", {
        name: PLUGIN_NAME,
        version: "1.0.0",
        mcpServers: {
          compat: {
            type: "stdio",
            command: "node",
            args: ["${KAYINGCODE_PLUGIN_ROOT}/server.js", "${KAYINGCODE_PLUGIN_NAME}"],
            env: { DATA: "${KAYINGCODE_PLUGIN_DATA}" },
          },
        },
      });

      const outcome = await discover(pluginRoot, root);
      const metadata = outcome.plugins[0];
      const server = outcome.mcpServers[`plugin:${PLUGIN_NAME}:compat`];

      expect(outcome.diagnostics).toEqual([]);
      expect(server?.args).toEqual([`${pluginRoot}/server.js`, PLUGIN_NAME]);
      expect(server?.env?.DATA).toBe(metadata?.dataPath);
    });
  });

  it("rejects an invalid upstream plugin name", async () => {
    await withPluginRoot(async ({ pluginRoot, root }) => {
      await writeManifest(pluginRoot, ".zcode-plugin", {
        name: "Not A Valid Name",
        version: "1.0.0",
      });

      const outcome = await discover(pluginRoot, root);

      expect(outcome.plugins).toEqual([]);
      expect(outcome.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "plugin_manifest_invalid", severity: "error" }),
        ]),
      );
    });
  });
});
