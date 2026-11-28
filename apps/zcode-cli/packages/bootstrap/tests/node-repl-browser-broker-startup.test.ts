// 回归：node_repl browser broker 必须先于 App MCP 配置源创建。
// 配置源在创建时 prepare 一次并缓存快照，McpSession 又优先使用该快照；broker 晚于它创建时，
// node_repl 首连没有 KAYINGCODE_NODE_REPL_BROWSER_BROKER_*，agent.browsers.* 恒报 unavailable。
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInMemorySessionEventStore, createSqliteSessionStore } from "@zcode/adapters/storage";
import type {
  BrowserControlPort,
  McpPort,
  PluginLoadOutcome,
  PluginMetadata,
} from "@zcode/contracts";
import {
  NODE_REPL_BROWSER_BROKER_SOCKET_ENV,
  NODE_REPL_BROWSER_BROKER_TOKEN_ENV,
} from "@zcode/shared/node-repl-browser-broker";
import { createSessionId } from "@zcode/contracts";
import type { NodeReplBrowserBroker } from "../src/app/node-repl-browser-broker.js";
import { createRegistryBackedTestApp } from "./helpers/registry-backed-test-app.js";

// 单元测试不 seed 全部官方插件（几十 MB）；本用例只关心 broker 与配置源的先后顺序。
vi.mock("../src/app/bundled-plugins.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/app/bundled-plugins.js")>();
  return { ...actual, resolveOfficialPluginRoots: vi.fn(async () => []) };
});

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BROWSER_USE_ROOT = resolve(PACKAGE_ROOT, "../browser-use-plugin");
const NODE_REPL_HOST_ROOT = resolve(PACKAGE_ROOT, "../node-repl-host");

function pluginMetadata(input: {
  enabled?: boolean;
  id: string;
  name: string;
  rootPath: string;
}): PluginMetadata {
  return {
    commandRootCount: 0,
    components: [],
    dataPath: join(input.rootPath, ".data"),
    declaredMcpServerNames: [],
    enabled: input.enabled ?? true,
    hookDetails: [],
    id: input.id,
    manifestPath: join(input.rootPath, ".zcode-plugin", "plugin.json"),
    marketplace: "kayingcode-plugins-official",
    mcpServerNames: [],
    name: input.name,
    rootPath: input.rootPath,
    skillCount: 0,
    skillRootCount: 0,
    source: "official",
  };
}

function pluginDiscovery(): { discoverPlugins: () => Promise<PluginLoadOutcome> } {
  return {
    discoverPlugins: async () => ({
      commandRoots: [],
      diagnostics: [],
      hooks: {},
      mcpServers: {},
      plugins: [
        pluginMetadata({
          id: "browser-use@kayingcode-plugins-official",
          name: "browser-use",
          rootPath: BROWSER_USE_ROOT,
        }),
        pluginMetadata({
          id: "node-repl-host@kayingcode-plugins-official",
          name: "node-repl-host",
          rootPath: NODE_REPL_HOST_ROOT,
        }),
      ],
      skillRoots: [],
    }),
  };
}

function browserControlPort(): BrowserControlPort {
  return {
    list: async () => [],
    execute: async () => ({ ok: true, elapsedMs: 0 }),
  } as unknown as BrowserControlPort;
}

const temporaryDirectories: string[] = [];
const openedCleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of openedCleanups.splice(0)) await cleanup();
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { force: true, recursive: true });
  }
});

async function startApp(input: { broker?: NodeReplBrowserBroker } = {}) {
  const workingDirectory = await mkdtemp(join(tmpdir(), "kayingcode-broker-startup-"));
  temporaryDirectories.push(workingDirectory);
  const store = await createSqliteSessionStore({ dbPath: ":memory:" });
  openedCleanups.push(async () => store.close());
  const captured: { servers?: Record<string, unknown> } = {};
  const mcpPort = {
    connectConfiguredServers: async (servers: Record<string, unknown>) => {
      captured.servers = servers;
      return { statuses: {}, tools: [] };
    },
    getToolSnapshot: () => ({}),
    status: async () => ({}),
    listTools: async () => [],
  } as unknown as McpPort;
  const app = await createRegistryBackedTestApp({
    browserControlPort: browserControlPort(),
    env: {},
    eventStore: createInMemorySessionEventStore(),
    mcpPort,
    pluginDiscovery: pluginDiscovery() as never,
    pluginStorageRoot: join(workingDirectory, "plugins"),
    runtimeConfig: {
      workingDirectory,
      mode: "build",
      mcp: { enabled: true, servers: {} },
    },
    sessionId: createSessionId("broker-startup"),
    sessionStore: store,
    skipUserConfig: true,
    ...(input.broker ? { nodeReplBrowserBroker: input.broker } : {}),
  });
  openedCleanups.push(async () => app.close());
  // 工作区 MCP 信任 guard 以微任务串行化连接准入，首连晚于 app 创建返回。
  await vi.waitFor(() => expect(captured.servers?.node_repl).toBeDefined());
  return { captured };
}

function nodeReplEnv(captured: { servers?: Record<string, unknown> }): Record<string, string> {
  const nodeRepl = captured.servers?.node_repl as { env?: Record<string, string> } | undefined;
  expect(nodeRepl).toBeDefined();
  return nodeRepl?.env ?? {};
}

describe("node_repl browser broker 启动时序", () => {
  it("宿主注入的 broker env 进入首次 MCP 连接配置", async () => {
    const broker: NodeReplBrowserBroker = {
      close: async () => undefined,
      ready: Promise.resolve(),
      socketPath: "\\\\?\\pipe\\kayingcode-test-broker",
      token: "test-token",
    };
    const { captured } = await startApp({ broker });
    const env = nodeReplEnv(captured);
    expect(env[NODE_REPL_BROWSER_BROKER_SOCKET_ENV]).toBe(broker.socketPath);
    expect(env[NODE_REPL_BROWSER_BROKER_TOKEN_ENV]).toBe(broker.token);
  });

  it("App 自建 broker 时首连同样带 socket 与 token", async () => {
    const { captured } = await startApp();
    const env = nodeReplEnv(captured);
    expect(env[NODE_REPL_BROWSER_BROKER_SOCKET_ENV]?.trim()).toBeTruthy();
    expect(env[NODE_REPL_BROWSER_BROKER_TOKEN_ENV]?.trim()).toBeTruthy();
  });
});
