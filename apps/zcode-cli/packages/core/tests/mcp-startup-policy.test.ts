import { expect, it } from "vitest";
import {
  createSessionId,
  type McpConnectionSnapshot,
  type McpPort,
  type McpServerConfig,
  type McpServerToolSnapshot,
  type ModelRequest,
} from "@zcode/contracts";
import type { AgentRuntimeInternal } from "../src/runtime/internal.js";
import { createTestAgentRuntime } from "./test-agent-runtime.js";
import { createTestSessionEventStore } from "./test-event-store.js";
import { createTestModelFactory } from "./test-runtime-model.js";

// MCP 启动策略：background 的首个请求不等全部 server 启动结束，但会话结束时仍可等待启动结果；
// blocking（缺省）继续等全部 server，保持既有行为。
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function mcpStatus(
  status: McpServerToolSnapshot["status"]["status"],
): McpServerToolSnapshot["status"] {
  return { status, transport: "stdio", toolCount: 0, updatedAt: "now" };
}

function descriptor(serverName: string, toolName: string) {
  return {
    serverName,
    toolName,
    description: `${toolName} tool`,
    inputSchema: { type: "object", properties: {} } as const,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createHarness(options: {
  policy?: "background" | "blocking";
  toolDisallowlist?: string[];
  servers?: Record<string, McpServerConfig>;
}) {
  const requests: ModelRequest[] = [];
  let snapshot: Record<string, McpServerToolSnapshot> = {
    local: { status: mcpStatus("connecting") },
  };
  const startup = deferred<McpConnectionSnapshot>();
  const port = {
    connectConfiguredServers: () => startup.promise,
    connectServer: async () => mcpStatus("connected"),
    disconnectServer: async () => undefined,
    status: async () => ({}),
    listTools: async () => [],
    getToolSnapshot: () => snapshot,
    waitForServer: async () => ({ timedOut: false }),
    callTool: async () => ({ content: [] }),
    close: async () => undefined,
  } as unknown as McpPort;
  const servers = options.servers ?? { local: { type: "stdio", command: "node" } };
  const runtime = createTestAgentRuntime(
    createSessionId(),
    {
      mode: "build",
      modelStreaming: "off",
      titleGeneration: { enabled: false },
      mcp: { enabled: true, servers },
      ...(options.toolDisallowlist ? { toolDisallowlist: options.toolDisallowlist } : {}),
    },
    {
      eventStore: createTestSessionEventStore(),
      mcpPort: port,
      ...(options.policy ? { mcpStartupPolicy: options.policy } : {}),
      modelFactory: createTestModelFactory({
        generateText: async (request) => {
          requests.push(request);
          return { text: "done", finishReason: "stop", usage: {} };
        },
      } as never),
    },
  );
  const internal = runtime as unknown as AgentRuntimeInternal;
  return {
    runtime,
    internal,
    requests,
    port,
    resolveStartup(tools: ReturnType<typeof descriptor>[]) {
      snapshot = {
        local: { status: mcpStatus("connected"), tools, toolsVersion: "v1" },
      };
      startup.resolve({ statuses: { local: mcpStatus("connected") }, tools });
    },
  };
}

it("background startup does not block the first request while the session can still await it", async () => {
  const harness = createHarness({ policy: "background" });
  try {
    // 首个请求在 startup 仍未结束时完成：只看到 pending，不注册未就绪 server 的工具。
    const raced = await Promise.race([
      harness.runtime.executeTurn("first request").then(() => "turn-done"),
      sleep(5_000).then(() => "blocked"),
    ]);
    expect(raced).toBe("turn-done");
    expect(harness.requests).toHaveLength(1);
    const firstTools = harness.requests[0]?.tools?.map((tool) => tool.name) ?? [];
    expect(firstTools).not.toContain("mcp__local__ping");
    // ToolSearch 关闭时连接中的 server 由 WaitForMcpServers 承载。
    expect(firstTools).toContain("WaitForMcpServers");

    harness.resolveStartup([descriptor("local", "ping")]);
    // 会话/入口仍可显式等待启动结果，不因 background 丢掉完成事件。
    await harness.internal.startMcpStartup({ sessionId: harness.runtime.sessionId } as never);

    await harness.runtime.executeTurn("second request");
    const secondTools = harness.requests[1]?.tools?.map((tool) => tool.name) ?? [];
    expect(secondTools).toContain("mcp__local__ping");
  } finally {
    await harness.runtime.close();
  }
});

it("blocking startup keeps the first request waiting for every configured server", async () => {
  const harness = createHarness({});
  try {
    let settled = false;
    const turn = harness.runtime.executeTurn("first request").then(() => {
      settled = true;
    });
    await sleep(50);
    expect(settled).toBe(false);

    harness.resolveStartup([descriptor("local", "ping")]);
    await turn;
    expect(settled).toBe(true);
    expect(harness.requests[0]?.tools?.map((tool) => tool.name)).toContain("mcp__local__ping");
  } finally {
    await harness.runtime.close();
  }
});

it("records allow/deny filtered tools as deniedTools for ToolSearch revocation", async () => {
  const harness = createHarness({
    policy: "background",
    toolDisallowlist: ["mcp__local__secret"],
  });
  try {
    harness.resolveStartup([descriptor("local", "ping"), descriptor("local", "secret")]);
    await harness.runtime.executeTurn("first request");

    expect(harness.internal.mcpServerStatusFacts?.deniedTools).toEqual(["mcp__local__secret"]);
    expect(harness.runtime.getToolRegistry().get("mcp__local__ping")).toBeDefined();
    expect(harness.runtime.getToolRegistry().get("mcp__local__secret")).toBeUndefined();
  } finally {
    await harness.runtime.close();
  }
});
