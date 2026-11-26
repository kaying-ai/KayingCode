import { expect, it, vi } from "vitest";
import {
  CoreErrorType,
  createSessionId,
  type McpCallToolRequest,
  type McpPort,
  type McpServerToolSnapshot,
  type McpToolDefinition,
  type McpToolDescriptor,
} from "@zcode/contracts";
import { createMcpSession } from "../src/mcp/runtime/session.js";
import { registerMcpTools } from "../src/mcp/index.js";
import { resolveLiveToolEntry } from "../src/tool/executor/live-entry-resolution.js";
import { createToolRegistry } from "../src/tool/registry.js";
import type { ToolExecutionContext } from "../src/tool/types.js";

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

function status(kind: "connecting" | "connected" | "disconnected") {
  return { status: kind, transport: "stdio" as const, toolCount: 1, updatedAt: "2026-01-01" };
}

function createHarness(options: {
  tools?: McpToolDefinition[];
  waitForServer?: McpPort["waitForServer"];
} = {}) {
  let snapshot: Record<string, McpServerToolSnapshot> = {
    alpha: {
      status: status("connecting"),
      tools: [toolDescriptor()],
      toolsVersion: "v1",
    },
  };
  const callTool = vi.fn(async (request: McpCallToolRequest) => ({
    content: [{ type: "text", text: `${request.serverName}/${request.toolName}` }],
  }));
  const port = {
    connectConfiguredServers: vi.fn(async () => ({ statuses: {}, tools: [] })),
    status: async () => ({}),
    getToolSnapshot: () => snapshot,
    waitForServer: options.waitForServer ?? vi.fn(async () => ({ timedOut: false })),
    listTools: async () => [],
    callTool,
  } as unknown as McpPort;
  const session = createMcpSession({
    port,
    configuration: {
      enabled: true,
      servers: { alpha: { type: "stdio", command: "node" } },
    },
    connectOptions: {},
    trackStartup: (promise) => promise,
  });
  const registry = createToolRegistry();
  registerMcpTools(registry, port, options.tools ?? [toolDescriptor()], {
    resolveLiveDescriptor: (descriptor, signal) => session.resolve(descriptor, signal),
  });
  return {
    port,
    session,
    registry,
    callTool,
    setSnapshot(next: Record<string, McpServerToolSnapshot>) {
      snapshot = next;
    },
  };
}

function context(): ToolExecutionContext {
  return {
    toolCallId: "call-1",
    abortSignal: new AbortController().signal,
    sessionId: createSessionId(),
    workingDirectory: "/workspace",
    workspaceRoot: "/workspace",
  } as unknown as ToolExecutionContext;
}

it("resolves a catalog-only entry to the current live descriptor before execution", async () => {
  const harness = createHarness();
  const entry = harness.registry.get(TOOL_NAME)!;
  expect(entry.resolveForExecution).toBeTypeOf("function");

  harness.setSnapshot({
    alpha: { status: status("connected"), tools: [toolDescriptor()], toolsVersion: "v2" },
  });
  const resolution = await entry.resolveForExecution!({});
  expect(resolution.status).toBe("ready");
  if (resolution.status !== "ready") return;

  const output = await resolution.entry.handler({}, context());
  expect(output).toMatchObject({ content: [{ type: "text", text: "alpha/probe" }] });
  expect(harness.callTool).toHaveBeenCalledWith(
    expect.objectContaining({ serverName: "alpha", toolName: "probe" }),
    expect.anything(),
  );
  expect(harness.callTool.mock.calls[0]![0].workspaceKey).toBe("/workspace");
});

it("returns an unavailable reason when the live server dropped the tool", async () => {
  const harness = createHarness({
    waitForServer: vi.fn(async () => ({ timedOut: false })),
  });
  harness.setSnapshot({
    alpha: { status: status("connected"), tools: [], toolsVersion: "v2" },
  });
  const resolution = await harness.registry.get(TOOL_NAME)!.resolveForExecution!({});
  expect(resolution).toMatchObject({ status: "unavailable" });
  if (resolution.status !== "unavailable") return;
  expect(resolution.message).toContain("does not offer this tool");
});

it("refuses to execute when the connection disappeared after admission", async () => {
  const harness = createHarness();
  harness.setSnapshot({
    alpha: { status: status("connected"), tools: [toolDescriptor()], toolsVersion: "v2" },
  });
  const resolution = await harness.registry.get(TOOL_NAME)!.resolveForExecution!({});
  const live = resolution.status === "ready" ? resolution.entry : undefined;
  expect(live).toBeDefined();

  harness.setSnapshot({
    alpha: { status: status("disconnected"), tools: [], toolsVersion: "v2" },
  });
  await expect(live!.handler({}, context())).rejects.toThrow(/has disconnected/);
  expect(harness.callTool).not.toHaveBeenCalled();
});

it("refuses to execute when the server configuration key changed after admission", async () => {
  const harness = createHarness();
  harness.setSnapshot({
    alpha: { status: status("connected"), tools: [toolDescriptor()], toolsVersion: "v2" },
  });
  const resolution = await harness.registry.get(TOOL_NAME)!.resolveForExecution!({});
  const live = resolution.status === "ready" ? resolution.entry : undefined;
  expect(live).toBeDefined();

  await harness.session.reconcileConfiguration({
    enabled: true,
    servers: { alpha: { type: "stdio", command: "node", args: ["replaced"] } },
  });
  await expect(live!.handler({}, context())).rejects.toThrow(/has disconnected/);
  expect(harness.callTool).not.toHaveBeenCalled();
});

it("wraps unavailable resolution as a retryable tool execution error", async () => {
  const resolution = await resolveLiveToolEntry(
    async () => ({ status: "unavailable", message: "MCP tool is unavailable: probe" }),
    { id: "call-1", name: "probe", input: {} },
    undefined,
  );
  expect(resolution.status).toBe("failed");
  if (resolution.status !== "failed") return;
  expect(resolution.error).toMatchObject({
    type: CoreErrorType.ToolExecutionFailed,
    retryable: true,
    recoverable: true,
  });
});

it("keeps entries without a live resolver unchanged", async () => {
  const harness = createHarness();
  const registry = createToolRegistry();
  registerMcpTools(registry, harness.port, [toolDescriptor()]);
  const entry = registry.get(TOOL_NAME)!;
  expect(entry.resolveForExecution).toBeUndefined();
  const output = await entry.handler({}, context());
  expect(output).toMatchObject({ content: [{ type: "text", text: "alpha/probe" }] });
});
