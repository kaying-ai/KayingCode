import { expect, it, vi } from "vitest";
import type {
  McpPort,
  McpServerToolSnapshot,
  McpToolDescriptor,
  ToolSearchExecutionContext,
} from "@zcode/contracts";
import { createMcpSession } from "../src/mcp/runtime/session.js";
import type { AgentRuntimeInternal } from "../src/runtime/internal.js";
import { createLiveToolSearchContext } from "../src/runtime/methods/mcp.js";
import type { RegularTurnLoopState } from "../src/runtime/methods/turn-loop-state.js";
import { toolSearchToolEntry } from "../src/tool/handlers/tool-search.js";
import type { ToolExecutionContext } from "../src/tool/types.js";

const TOOL_NAME = "mcp__alpha__probe";

function descriptor(): McpToolDescriptor {
  return {
    name: TOOL_NAME,
    serverName: "alpha",
    toolName: "probe",
    description: "live probe",
    inputSchema: { type: "object", properties: {} },
  };
}

function createHarness(initial: Record<string, McpServerToolSnapshot>) {
  let snapshot = initial;
  const port = {
    connectConfiguredServers: vi.fn(async () => ({ statuses: {}, tools: [] })),
    status: async () => ({}),
    getToolSnapshot: () => snapshot,
    waitForServer: vi.fn(async () => ({ timedOut: false })),
    listTools: async () => [],
    callTool: vi.fn(async () => ({ content: [] })),
  } as unknown as McpPort & { waitForServer: ReturnType<typeof vi.fn> };
  const session = createMcpSession({
    port,
    configuration: {
      enabled: true,
      servers: {
        alpha: { type: "stdio", command: "node" },
        beta: { type: "stdio", command: "node" },
      },
    },
    connectOptions: {},
    trackStartup: (promise) => promise,
  });
  const runtime = {
    config: {
      mcp: {
        enabled: true,
        servers: {
          alpha: { type: "stdio", command: "node" },
          beta: { type: "stdio", command: "node" },
        },
      },
      taskType: "interactive",
      toolSearch: { mode: "local" },
      pluginReferenceCatalog: undefined,
    },
    mcpPort: port,
    mcpSession: session,
    registeredMcpToolNames: [] as string[],
  } as unknown as AgentRuntimeInternal;
  return {
    runtime,
    port,
    setSnapshot(next: Record<string, McpServerToolSnapshot>) {
      snapshot = next;
    },
  };
}

function state(overrides: Partial<RegularTurnLoopState> = {}): RegularTurnLoopState {
  return {
    turnRequestState: { entries: [] },
    automationCreateLimitReached: false,
    ...overrides,
  } as unknown as RegularTurnLoopState;
}

function searchContext(
  overrides: Partial<ToolSearchExecutionContext> = {},
): ToolSearchExecutionContext {
  return {
    mode: "local",
    enabled: true,
    catalog: [{ name: "Read", deferred: false }],
    discovered: new Set<string>(),
    ...overrides,
  };
}

it("projects the current live MCP catalog and server facts into ToolSearch", () => {
  const harness = createHarness({
    alpha: {
      status: { status: "connected", transport: "stdio", toolCount: 1, updatedAt: "t1" },
      tools: [descriptor()],
      toolsVersion: "v1",
    },
    beta: { status: { status: "connecting", transport: "stdio", toolCount: 0, updatedAt: "t2" } },
  });
  const context = searchContext();
  const live = createLiveToolSearchContext(harness.runtime, state(), context);

  const view = live.readLatest!();
  expect(view.catalog.map((tool) => tool.name)).toEqual(["Read", TOOL_NAME]);
  expect(view.catalog[1]).toMatchObject({
    mcp: { serverName: "alpha", toolName: "probe" },
    deferred: true,
  });
  expect(view.pending).toEqual(["beta"]);
  expect(view.failed).toEqual([]);
});

it("drops managed MCP tools from the resident catalog to avoid duplicates", () => {
  const harness = createHarness({
    alpha: {
      status: { status: "connected", transport: "stdio", toolCount: 1, updatedAt: "t1" },
      tools: [descriptor()],
      toolsVersion: "v1",
    },
  });
  harness.runtime.registeredMcpToolNames = [TOOL_NAME];
  const live = createLiveToolSearchContext(
    harness.runtime,
    state(),
    searchContext({
      catalog: [
        { name: "Read", deferred: false },
        { name: TOOL_NAME, deferred: true, mcp: { serverName: "alpha", toolName: "probe" } },
      ],
    }),
  );
  const view = live.readLatest!();
  expect(view.catalog.filter((tool) => tool.name === TOOL_NAME)).toHaveLength(1);
});

it("waits for pending servers through the live port", async () => {
  const harness = createHarness({});
  const live = createLiveToolSearchContext(harness.runtime, state(), searchContext());
  await live.waitForPending!(["alpha"], 5_000);
  expect(harness.port.waitForServer).toHaveBeenCalledWith("alpha", {
    timeoutMs: 5_000,
    signal: undefined,
  });
});

it("searches the live catalog instead of the stale request snapshot", async () => {
  const harness = createHarness({
    alpha: {
      status: { status: "connected", transport: "stdio", toolCount: 1, updatedAt: "t1" },
      tools: [descriptor()],
      toolsVersion: "v1",
    },
  });
  const context = searchContext();
  const live = createLiveToolSearchContext(harness.runtime, state(), context);
  const search = Object.assign(context, live);
  const output = await toolSearchToolEntry.handler(
    { query: "probe" },
    { toolSearch: search } as unknown as ToolExecutionContext,
  );
  expect(output).toMatchObject({ matches: [TOOL_NAME] });
});

it("reports connecting servers when a search misses and waits before retrying", async () => {
  const harness = createHarness({
    beta: { status: { status: "connecting", transport: "stdio", toolCount: 0, updatedAt: "t2" } },
  });
  const context = searchContext();
  const live = createLiveToolSearchContext(harness.runtime, state(), context);
  const search = Object.assign(context, live);
  const output = (await toolSearchToolEntry.handler(
    { query: "beta calendar" },
    { toolSearch: search } as unknown as ToolExecutionContext,
  )) as Record<string, unknown>;
  expect(output.matches).toEqual([]);
  expect(output.pending_mcp_servers).toEqual(["beta"]);
  expect(harness.port.waitForServer).toHaveBeenCalledWith("beta", {
    timeoutMs: 5_000,
    signal: undefined,
  });
  expect(toolSearchToolEntry.formatModelContent!(output)).toContain("still connecting");
});

it("uses the plain miss message when no MCP server is pending or failed", async () => {
  const harness = createHarness({});
  const context = searchContext();
  const search = Object.assign(
    context,
    createLiveToolSearchContext(harness.runtime, state(), context),
  );
  const output = await toolSearchToolEntry.handler(
    { query: "nothing" },
    { toolSearch: search } as unknown as ToolExecutionContext,
  );
  expect(toolSearchToolEntry.formatModelContent!(output)).toContain(
    "No matching deferred tools found",
  );
});
