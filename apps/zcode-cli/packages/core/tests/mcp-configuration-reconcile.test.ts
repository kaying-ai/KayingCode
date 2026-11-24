import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  createSessionId,
  type McpConfigurationSource,
  type McpConnectionSnapshot,
  type McpPort,
  type McpServerConfig,
} from "@zcode/contracts";
import { createTestAgentRuntime } from "./test-agent-runtime.js";
import { createTestSessionEventStore } from "./test-event-store.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function stdioServer(): McpServerConfig {
  return { type: "stdio", command: process.execPath, args: ["-e", ""] };
}

it("reconnects configured servers when the configuration source publishes", async () => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-mcp-reconcile-"));
  roots.push(root);
  const calls: Array<Record<string, McpServerConfig>> = [];
  const firstConnect = Promise.withResolvers<void>();
  const secondConnect = Promise.withResolvers<void>();
  const port = {
    async connectConfiguredServers(servers: Record<string, McpServerConfig>) {
      calls.push(servers);
      (calls.length === 1 ? firstConnect : secondConnect).resolve();
      return { statuses: {}, tools: [] } satisfies McpConnectionSnapshot;
    },
    async status() {
      return {};
    },
    async listTools() {
      return [];
    },
    toolListRevision: () => 0,
    async callTool() {
      throw new Error("not used");
    },
  } as unknown as McpPort;

  let snapshot = { enabled: true, servers: { alpha: stdioServer() } };
  let listener: (() => void) | undefined;
  const source: McpConfigurationSource = {
    getSnapshot: () => snapshot,
    subscribe: (next) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
    close: vi.fn(),
  };

  const runtime = createTestAgentRuntime(
    createSessionId(),
    {
      workingDirectory: root,
      mcp: { enabled: true, servers: snapshot.servers },
    },
    {
      eventStore: createTestSessionEventStore(),
      mcpPort: port,
      mcpConfigurationSource: source,
    },
  );
  try {
    await firstConnect.promise;
    expect(Object.keys(calls[0]!)).toEqual(["alpha"]);

    snapshot = { enabled: true, servers: { beta: stdioServer() } };
    listener?.();
    await secondConnect.promise;
    expect(Object.keys(calls.at(-1)!)).toEqual(["beta"]);
    expect(runtime.config.mcp?.servers).toEqual({ beta: stdioServer() });
  } finally {
    await runtime.close();
  }
});
