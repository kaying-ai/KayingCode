import { expect, it, vi } from "vitest";
import type { McpPort, McpServerToolSnapshot } from "@zcode/contracts";
import type { AgentRuntimeInternal } from "../src/runtime/internal.js";
import { createMcpServerWaitPort } from "../src/runtime/methods/mcp.js";

function runtimeWith(
  port: McpPort,
  servers: Record<string, { type: "stdio"; command: string }> = {
    alpha: { type: "stdio", command: "node" },
  },
): AgentRuntimeInternal {
  return {
    config: { mcp: { enabled: true, servers } },
    mcpPort: port,
  } as unknown as AgentRuntimeInternal;
}

it("waits pending servers and reports the final classification", async () => {
  let snapshot: Record<string, McpServerToolSnapshot> = {
    alpha: { status: { status: "connecting", transport: "stdio", toolCount: 0, updatedAt: "" } },
  };
  const waitForServer = vi.fn(async () => {
    snapshot = {
      alpha: {
        status: { status: "connected", transport: "stdio", toolCount: 1, updatedAt: "" },
        tools: [],
        toolsVersion: "v1",
      },
    };
    return { timedOut: false };
  });
  const port = {
    getToolSnapshot: () => snapshot,
    waitForServer,
  } as unknown as McpPort;

  const output = await createMcpServerWaitPort(runtimeWith(port)).waitForServers(undefined);

  expect(waitForServer).toHaveBeenCalledWith("alpha", { timeoutMs: 5_000, signal: undefined });
  expect(output).toMatchObject({
    ready: true,
    connected: ["alpha"],
    failed: [],
    stillPending: [],
    needsAuth: [],
    disabled: [],
    unknown: [],
    isError: false,
  });
});

it("reports unknown names when nothing matches", async () => {
  const port = {
    getToolSnapshot: () => ({}),
    waitForServer: vi.fn(async () => ({ timedOut: false })),
  } as unknown as McpPort;
  const output = await createMcpServerWaitPort(runtimeWith(port)).waitForServers(["missing"]);
  expect(output).toMatchObject({ ready: false, unknown: ["missing"], isError: true });
});

it("waits only pending targets when names are requested", async () => {
  const snapshot: Record<string, McpServerToolSnapshot> = {
    alpha: {
      status: { status: "connected", transport: "stdio", toolCount: 1, updatedAt: "" },
      tools: [],
      toolsVersion: "v1",
    },
    beta: { status: { status: "connecting", transport: "stdio", toolCount: 0, updatedAt: "" } },
  };
  const waitForServer = vi.fn(async () => ({ timedOut: false }));
  const port = {
    getToolSnapshot: () => snapshot,
    waitForServer,
  } as unknown as McpPort;
  const output = await createMcpServerWaitPort(
    runtimeWith(port, {
      alpha: { type: "stdio", command: "node" },
      beta: { type: "stdio", command: "node" },
    }),
  ).waitForServers(["alpha", "beta"]);
  expect(waitForServer).toHaveBeenCalledTimes(1);
  expect(waitForServer).toHaveBeenCalledWith("beta", { timeoutMs: 5_000, signal: undefined });
  expect(output).toMatchObject({ connected: ["alpha"], stillPending: ["beta"], ready: false });
});
