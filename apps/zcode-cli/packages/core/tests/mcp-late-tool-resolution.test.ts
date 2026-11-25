import { expect, it, vi } from "vitest";
import {
  CoreErrorType,
  createRootTraceContext,
  createSessionId,
  type McpPort,
  type McpServerToolSnapshot,
  type McpToolDescriptor,
  type ToolExecutionSpanWriter,
} from "@zcode/contracts";
import { createMcpSession } from "../src/mcp/runtime/session.js";
import type { AgentRuntimeInternal } from "../src/runtime/internal.js";
import {
  describeUnavailableMcpTool,
  isMcpServerWaitOffered,
  latchMcpServerWait,
  resolveUnregisteredMcpTool,
} from "../src/runtime/methods/mcp.js";
import { BackgroundTaskTracker } from "../src/tool/executor/background-tasks.js";
import { executeToolCall } from "../src/tool/executor/call-runner.js";
import { lookupToolEntry } from "../src/tool/executor/live-entry-resolution.js";
import type { ToolExecutorDeps } from "../src/tool/executor/types.js";
import { waitForMcpServersToolEntry } from "../src/tool/handlers/wait-for-mcp-servers.js";
import { createToolRegistry } from "../src/tool/registry.js";
import type { ToolEntry } from "../src/tool/types.js";

const TOOL_NAME = "mcp__alpha__probe";

function toolDescriptor(name = "probe"): McpToolDescriptor {
  return {
    name: `mcp__alpha__${name}`,
    serverName: "alpha",
    toolName: name,
    description: "live probe",
    inputSchema: { type: "object", properties: {} },
  };
}

function connected(tools: McpToolDescriptor[] = [toolDescriptor()]): McpServerToolSnapshot {
  return {
    status: { status: "connected", transport: "stdio", toolCount: tools.length, updatedAt: "t1" },
    tools,
    toolsVersion: "v1",
  };
}

function connecting(updatedAt = "t1"): McpServerToolSnapshot {
  return {
    status: { status: "connecting", transport: "stdio", toolCount: 0, updatedAt },
  };
}

function failed(error: string): McpServerToolSnapshot {
  return {
    status: {
      status: "failed",
      transport: "stdio",
      toolCount: 0,
      updatedAt: "t1",
      error,
      errorCode: "connect_failed",
    },
  };
}

function createRuntime(options: {
  snapshot: () => Record<string, McpServerToolSnapshot>;
  waitForServer?: McpPort["waitForServer"];
  taskType?: "interactive" | "subagent_child";
  includeWaitTool?: boolean;
}) {
  const port = {
    connectConfiguredServers: vi.fn(async () => ({ statuses: {}, tools: [] })),
    status: async () => ({}),
    getToolSnapshot: () => options.snapshot(),
    waitForServer: options.waitForServer ?? vi.fn(async () => ({ timedOut: false })),
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
  const registry = createToolRegistry();
  if (options.includeWaitTool !== false) registry.register(waitForMcpServersToolEntry);
  const runtime = {
    config: {
      mcp: {
        enabled: true,
        servers: {
          alpha: { type: "stdio", command: "node" },
          beta: { type: "stdio", command: "node" },
        },
      },
      taskType: options.taskType ?? "interactive",
      toolSearch: { mode: "off" },
      pluginReferenceCatalog: undefined,
    },
    mcpPort: port,
    mcpSession: session,
    registry,
    mcpServerWaitDeclared: false,
    mcpPendingToolWaitByResponse: new Map<string, number>(),
    mcpPendingToolWaitExhausted: new Map<string, string>(),
    offeredMcpTools: new Map<string, string>(),
    registeredMcpToolNames: [] as string[],
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  } as unknown as AgentRuntimeInternal;
  return { runtime, port, session, registry };
}

describeLookupTests();
describeUnavailableTests();
describeLatchTests();

function describeLookupTests(): void {
  function depsWith(overrides: Partial<ToolExecutorDeps>): ToolExecutorDeps {
    return {
      registry: createToolRegistry(),
      sessionId: createSessionId(),
      emitEvent: vi.fn(async () => undefined),
      logger: { warn: vi.fn() },
      ...overrides,
    } as unknown as ToolExecutorDeps;
  }

  it("keeps registry hits without calling the late resolver", async () => {
    const registry = createToolRegistry();
    const entry = { metadata: { name: "Read" } } as unknown as ToolEntry;
    registry.register(entry);
    const resolve = vi.fn(async () => undefined);
    const trace = createRootTraceContext({ sessionId: createSessionId() });
    const result = await lookupToolEntry(
      depsWith({ registry, resolveUnregisteredTool: resolve }),
      { id: "call-1", name: "Read", input: {} },
      { responseId: "resp-1" },
      trace,
      undefined,
    );
    expect(result.entry).toBe(entry);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("consults the late resolver on registry miss and shares the response id", async () => {
    const entry = { metadata: { name: TOOL_NAME } } as unknown as ToolEntry;
    const resolve = vi.fn(async () => entry);
    const trace = createRootTraceContext({ sessionId: createSessionId() });
    const signal = new AbortController().signal;
    const result = await lookupToolEntry(
      depsWith({ resolveUnregisteredTool: resolve }),
      { id: "call-1", name: TOOL_NAME, input: {} },
      { responseId: "resp-1", signal },
      trace,
      undefined,
    );
    expect(result.entry).toBe(entry);
    expect(resolve).toHaveBeenCalledWith(TOOL_NAME, { responseId: "resp-1", signal });
  });

  it("falls back to the registry-miss lifecycle when late resolution throws", async () => {
    const logger = { warn: vi.fn() };
    const trace = createRootTraceContext({ sessionId: createSessionId() });
    const result = await lookupToolEntry(
      depsWith({
        logger,
        resolveUnregisteredTool: async () => {
          throw new Error("lookup exploded");
        },
      }),
      { id: "call-1", name: TOOL_NAME, input: {} },
      {},
      trace,
      undefined,
    );
    expect(result.entry).toBeUndefined();
    expect(result.cancelled).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      "Unregistered tool resolution failed",
      expect.objectContaining({ event: "tool.call.late_resolution_failed", toolName: TOOL_NAME }),
    );
  });

  it("returns ToolCancelled and emits the error event when the wait is aborted", async () => {
    const emitEvent = vi.fn(async () => undefined);
    const telemetry = { finishCancelled: vi.fn() } as unknown as ToolExecutionSpanWriter;
    const controller = new AbortController();
    controller.abort();
    const trace = createRootTraceContext({ sessionId: createSessionId() });
    const result = await lookupToolEntry(
      depsWith({
        emitEvent,
        resolveUnregisteredTool: async () => {
          throw new Error("aborted");
        },
      }),
      { id: "call-1", name: TOOL_NAME, input: {} },
      { signal: controller.signal },
      trace,
      telemetry,
    );
    expect(result.entry).toBeUndefined();
    expect(result.cancelled).toMatchObject({
      success: false,
      error: { type: CoreErrorType.ToolCancelled },
    });
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(telemetry.finishCancelled).toHaveBeenCalledWith("abort_signal");
  });

  it("behaves exactly as before when no late resolver is wired", async () => {
    const trace = createRootTraceContext({ sessionId: createSessionId() });
    const result = await lookupToolEntry(
      depsWith({}),
      { id: "call-1", name: TOOL_NAME, input: {} },
      undefined,
      trace,
      undefined,
    );
    expect(result.entry).toBeUndefined();
    expect(result.cancelled).toBeUndefined();
  });

  it("appends the unavailable-tool reason to the registry-miss model content", async () => {
    const deps = depsWith({
      describeUnavailableTool: () =>
        ". The MCP server 'alpha' is still connecting. Call WaitForMcpServers to wait for it, then try again.",
    });
    const result = await executeToolCall(
      deps,
      new BackgroundTaskTracker(deps),
      { id: "call-1", name: TOOL_NAME, input: {} },
      {},
    );
    expect(result.success).toBe(false);
    expect(result.modelContent).toContain(
      `No such tool available: ${TOOL_NAME}. The MCP server 'alpha' is still connecting.`,
    );
  });
}

function describeUnavailableTests(): void {
  it("resolves a tool that appeared in the live view after the step started", async () => {
    const { runtime } = createRuntime({ snapshot: () => ({ alpha: connected() }) });
    const entry = await resolveUnregisteredMcpTool(runtime, TOOL_NAME, {});
    expect(entry?.metadata.name).toBe(TOOL_NAME);
    expect(entry?.resolveForExecution).toBeTypeOf("function");
  });

  it("returns nothing for names outside the MCP namespace", async () => {
    const { runtime } = createRuntime({ snapshot: () => ({ alpha: connected() }) });
    expect(await resolveUnregisteredMcpTool(runtime, "Read", {})).toBeUndefined();
  });

  it("waits for a first connection within the per-response budget", async () => {
    let snapshot: Record<string, McpServerToolSnapshot> = { alpha: connecting("episode-1") };
    const { runtime, port } = createRuntime({
      snapshot: () => snapshot,
      waitForServer: vi.fn(async () => {
        snapshot = { alpha: connected() };
        return { timedOut: false };
      }),
    });
    runtime.mcpPendingToolWaitByResponse.set("resp-1", 4_000);
    const entry = await resolveUnregisteredMcpTool(runtime, TOOL_NAME, { responseId: "resp-1" });
    expect(entry?.metadata.name).toBe(TOOL_NAME);
    expect(port.waitForServer).toHaveBeenCalledWith("alpha", {
      timeoutMs: 6_000,
      signal: undefined,
    });
    expect(runtime.mcpPendingToolWaitByResponse.get("resp-1")).toBeGreaterThanOrEqual(4_000);
  });

  it("does not wait again after the same connection exhausted the full budget", async () => {
    const { runtime, port } = createRuntime({
      snapshot: () => ({ alpha: connecting("episode-1") }),
      waitForServer: vi.fn(async () => ({ timedOut: true })),
    });
    runtime.mcpPendingToolWaitByResponse.set("resp-1", 10_000);
    expect(await resolveUnregisteredMcpTool(runtime, TOOL_NAME, { responseId: "resp-1" })).toBe(
      undefined,
    );
    expect(port.waitForServer).not.toHaveBeenCalled();
  });

  it("points a connecting server at WaitForMcpServers when the wait tool is offered", () => {
    const { runtime } = createRuntime({ snapshot: () => ({ alpha: connecting() }) });
    runtime.mcpServerStatusFacts = {
      pending: ["alpha"],
      needsAuth: [],
      failed: [],
      sources: { alpha: "pending" },
    };
    const reason = describeUnavailableMcpTool(runtime, TOOL_NAME);
    expect(reason).toContain("'alpha' is still connecting");
    expect(reason).toContain("Call WaitForMcpServers");
  });

  it("describes an offered tool whose server failed without suggesting a wait", () => {
    const { runtime } = createRuntime({ snapshot: () => ({ alpha: failed("boom") }) });
    runtime.offeredMcpTools.set(TOOL_NAME, "alpha");
    runtime.mcpServerStatusFacts = {
      pending: [],
      needsAuth: [],
      failed: [],
      sources: { alpha: "failed" },
    };
    const reason = describeUnavailableMcpTool(runtime, TOOL_NAME);
    expect(reason).toContain("has disconnected");
    expect(reason).not.toContain("WaitForMcpServers");
  });

  it("keeps the plain not-found text for tools this session never offered", () => {
    const { runtime } = createRuntime({ snapshot: () => ({ alpha: connected() }) });
    expect(describeUnavailableMcpTool(runtime, "mcp__ghost__nope")).toBe("");
  });
}

function describeLatchTests(): void {
  it("offers the wait tool while a server is pending and latches after it is sent", () => {
    const { runtime } = createRuntime({ snapshot: () => ({ alpha: connecting() }) });
    runtime.mcpServerStatusFacts = {
      pending: ["alpha"],
      needsAuth: [],
      failed: [],
      sources: { alpha: "pending" },
    };
    expect(isMcpServerWaitOffered(runtime)).toBe(true);

    latchMcpServerWait(runtime, [{ name: "Read" }]);
    expect(runtime.mcpServerWaitDeclared).toBe(false);

    latchMcpServerWait(runtime, [{ name: "WaitForMcpServers" }]);
    expect(runtime.mcpServerWaitDeclared).toBe(true);

    // server 连上后仍提供：工具列表与缓存前缀保持稳定。
    runtime.mcpServerStatusFacts = {
      pending: [],
      needsAuth: [],
      failed: [],
      sources: { alpha: "connected" },
    };
    expect(isMcpServerWaitOffered(runtime)).toBe(true);
  });

  it("never latches in a subagent", () => {
    const { runtime } = createRuntime({ snapshot: () => ({}), taskType: "subagent_child" });
    latchMcpServerWait(runtime, [{ name: "WaitForMcpServers" }]);
    expect(runtime.mcpServerWaitDeclared).toBe(false);
  });

  it("hides the wait tool when ToolSearch is enabled", () => {
    const { runtime } = createRuntime({ snapshot: () => ({ alpha: connecting() }) });
    runtime.mcpServerStatusFacts = {
      pending: ["alpha"],
      needsAuth: [],
      failed: [],
      sources: { alpha: "pending" },
    };
    runtime.config.toolSearch = { mode: "auto" };
    const model = {
      properties: { supportsToolCall: true },
      requestCapabilities: { toolSearch: { protocolSupported: true, defaultEnabled: true } },
    } as unknown as Parameters<typeof isMcpServerWaitOffered>[1];
    expect(isMcpServerWaitOffered(runtime, model)).toBe(false);
  });

  it("does not offer the wait tool when the allowlist removed it from the registry", () => {
    const { runtime } = createRuntime({
      snapshot: () => ({ alpha: connecting() }),
      includeWaitTool: false,
    });
    runtime.mcpServerStatusFacts = {
      pending: ["alpha"],
      needsAuth: [],
      failed: [],
      sources: { alpha: "pending" },
    };
    expect(isMcpServerWaitOffered(runtime)).toBe(false);
  });
}
