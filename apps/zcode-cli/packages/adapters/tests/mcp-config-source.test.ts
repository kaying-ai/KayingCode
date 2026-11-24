import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createMcpConfigurationLoader } from "../src/mcp/config-loader.js";
import { createDynamicMcpConfigSource } from "../src/mcp/config-source.js";

const { watchers } = vi.hoisted(() => ({ watchers: [] as EventEmitter[] }));
vi.mock("chokidar", () => ({
  watch: () => {
    const watcher = Object.assign(new EventEmitter(), { close: vi.fn(async () => {}) });
    watchers.push(watcher);
    queueMicrotask(() => watcher.emit("ready"));
    return watcher;
  },
}));

const roots: string[] = [];

afterEach(async () => {
  watchers.length = 0;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-mcp-config-"));
  roots.push(root);
  return {
    root,
    workspace: join(root, "workspace"),
    userConfig: join(root, "home", ".kayingcode", "cli", "config.json"),
    plugins: join(root, "home", ".kayingcode", "cli", "plugins"),
    projectConfig: join(root, "workspace", ".kayingcode", "config.json"),
  };
}

it("merges user, project and enabled plugin servers with source provenance", async () => {
  const f = await fixture();
  await writeJson(f.userConfig, {
    mcp: { servers: { user_probe: { command: "node", args: ["-e", ""] } } },
  });
  await writeJson(f.projectConfig, {
    mcp: { servers: { project_probe: { command: "node", args: ["-e", ""] } } },
  });
  const plugin = join(f.root, "installed", "example");
  await writeJson(join(plugin, ".kayingcode-plugin", "plugin.json"), {
    name: "example",
    version: "1.0.0",
    mcpServers: { plugin_probe: { command: "node", args: ["-e", ""] } },
  });
  await writeJson(join(f.plugins, "installed_plugins.json"), {
    version: 1,
    plugins: [
      {
        id: "example@test",
        name: "example",
        marketplace: "test",
        version: "1.0.0",
        installPath: plugin,
        installedAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        scope: "user",
      },
    ],
  });
  await writeJson(f.userConfig, {
    mcp: { servers: { user_probe: { command: "node", args: ["-e", ""] } } },
    plugins: { enabledPlugins: { "example@test": true } },
  });

  const loader = createMcpConfigurationLoader({
    configPaths: [f.projectConfig, f.userConfig],
    userConfigPath: f.userConfig,
    pluginStorageRoot: f.plugins,
    pluginRoots: [],
    workingDirectory: f.workspace,
    env: {},
  });
  const loaded = await loader.load();
  expect(Object.keys(loaded.configuration.servers).toSorted()).toEqual([
    "plugin:example:plugin_probe",
    "project_probe",
    "user_probe",
  ]);
  expect(loaded.configuration.servers.user_probe?.source).toEqual({ kind: "user" });
  expect(loaded.configuration.servers.project_probe?.source).toEqual({ kind: "workspace" });
  expect(loaded.pluginServers["plugin:example:plugin_probe"]).toBeDefined();
});

it("publishes a new snapshot when a watched config changes", async () => {
  const f = await fixture();
  await writeJson(f.userConfig, { mcp: { servers: {} } });
  const source = await createDynamicMcpConfigSource({
    configPaths: [f.userConfig],
    userConfigPath: f.userConfig,
    pluginStorageRoot: f.plugins,
    pluginRoots: [],
    workingDirectory: f.workspace,
    env: {},
  });
  try {
    const changed = Promise.withResolvers<void>();
    source.subscribe(() => {
      if (source.getSnapshot().servers.fresh) changed.resolve();
    });
    await writeJson(f.userConfig, {
      mcp: { servers: { fresh: { command: "node", args: ["-e", ""] } } },
    });
    for (const watcher of watchers)
      watcher.emit("raw", "change", null, { watchedPath: f.userConfig });
    await changed.promise;
    expect(source.getSnapshot().servers.fresh).toMatchObject({ command: "node" });
  } finally {
    source.close();
  }
});
