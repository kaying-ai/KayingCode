// 401 step-up 的 core 边界：授权未完成就结束时目录仍留在视图里；调用期失败只按
// needs-auth 改写一次报错，不重放调用；执行准入把 reconnect+reauthorize 交给端口一次。
import { expect, it, vi } from "vitest";
import type {
  McpPort,
  McpServerStatus,
  McpServerToolSnapshot,
  McpToolDefinition,
  ToolExecutionContext,
} from "@zcode/contracts";
import { createMcpToolEntry } from "../../src/mcp/index.js";
import { createMcpSession, mcpUnavailableReason } from "../../src/mcp/runtime/session.js";

const DESCRIPTOR: McpToolDefinition = {
  name: "mcp__remote__search",
  serverName: "remote",
  toolName: "search",
  description: "remote search",
  inputSchema: { type: "object", properties: {} },
};

const AUTHORIZATION = {
  type: "oauth_authorization_code",
  authorizationUrl: "https://example.test/authorize",
  startedAt: "now",
} as const;

function mcpStatus(
  status: McpServerStatus["status"],
  extra: Partial<McpServerStatus> = {},
): McpServerStatus {
  return { status, transport: "stdio", toolCount: 0, updatedAt: "now", ...extra };
}

function connected(): McpServerToolSnapshot {
  return {
    status: mcpStatus("connected", { toolCount: 1 }),
    tools: [DESCRIPTOR],
    toolsVersion: "v1",
  };
}

function createSession(
  snapshot: () => Record<string, McpServerToolSnapshot>,
  portExtras: Partial<McpPort> = {},
) {
  const port = {
    connectConfiguredServers: vi.fn(async () => ({ statuses: {}, tools: [] })),
    status: async () => ({}),
    getToolSnapshot: () => snapshot(),
    listTools: async () => [],
    waitForServer: vi.fn(async () => ({ timedOut: false })),
    callTool: vi.fn(async () => ({ content: [] })),
    ...portExtras,
  } as unknown as McpPort & {
    callTool: ReturnType<typeof vi.fn>;
    waitForServer: ReturnType<typeof vi.fn>;
  };
  const session = createMcpSession({
    port,
    configuration: {
      enabled: true,
      servers: { remote: { type: "stdio", command: "node" } },
    },
    connectOptions: {},
    trackStartup: (promise) => promise,
  });
  return { port, session };
}

function executionContext(): ToolExecutionContext {
  return { abortSignal: new AbortController().signal } as ToolExecutionContext;
}

it("keeps retained tools of a server whose authorization ended without completing", () => {
  const { session } = createSession(() => ({
    remote: {
      status: mcpStatus("failed", { failureKind: "oauth_authorization_failed" }),
      tools: [DESCRIPTOR],
      toolsVersion: "v1",
    },
  }));
  try {
    expect(session.read().tools.map((tool) => tool.toolName)).toEqual(["search"]);
  } finally {
    session.close();
  }
});

it("does not list tools of an explicitly disconnected server", () => {
  const { session } = createSession(() => ({
    remote: { status: mcpStatus("disconnected"), tools: [DESCRIPTOR], toolsVersion: "v1" },
  }));
  try {
    expect(session.read().tools).toEqual([]);
  } finally {
    session.close();
  }
});

it("turns a call-time 401 into one needs-auth error without replaying the call", async () => {
  let snapshot: Record<string, McpServerToolSnapshot> = { remote: connected() };
  const { port, session } = createSession(() => snapshot, {
    // 调用期 401：adapter 发起授权、发布链接后以原始错误结束这次调用。
    callTool: vi.fn(async () => {
      snapshot = {
        remote: {
          ...snapshot.remote!,
          status: mcpStatus("connecting", { authorization: AUTHORIZATION }),
        },
      };
      throw new Error("Unauthorized");
    }),
  });
  const resolved = await session.resolve(DESCRIPTOR);
  if (!("descriptor" in resolved)) throw new Error("expected a ready MCP tool");
  const entry = createMcpToolEntry(
    DESCRIPTOR.name,
    DESCRIPTOR,
    port,
    false,
    {},
    undefined,
    resolved,
  );
  try {
    await expect(entry.handler({}, executionContext())).rejects.toThrow(
      `MCP tool is unavailable in the current session: ${DESCRIPTOR.name}. ${mcpUnavailableReason(
        "needs_auth",
        "remote",
      )}`,
    );
    // 单次：授权恢复由 adapter 负责，core 不重试调用。
    expect(port.callTool).toHaveBeenCalledTimes(1);
  } finally {
    session.close();
  }
});

it("keeps the original error when a call fails for a reason other than authorization", async () => {
  let snapshot: Record<string, McpServerToolSnapshot> = { remote: connected() };
  const { port, session } = createSession(() => snapshot, {
    callTool: vi.fn(async () => {
      snapshot = { remote: { status: mcpStatus("failed") } };
      throw new Error("Connection closed");
    }),
  });
  const resolved = await session.resolve(DESCRIPTOR);
  if (!("descriptor" in resolved)) throw new Error("expected a ready MCP tool");
  const entry = createMcpToolEntry(
    DESCRIPTOR.name,
    DESCRIPTOR,
    port,
    false,
    {},
    undefined,
    resolved,
  );
  try {
    // 恢复耗尽等普通失败返回原始错误，不改写成状态文本。
    await expect(entry.handler({}, executionContext())).rejects.toThrow(/^Connection closed$/);
    expect(port.callTool).toHaveBeenCalledTimes(1);
  } finally {
    session.close();
  }
});

it("asks the port to reconnect and reauthorize once during execution admission", async () => {
  let snapshot: Record<string, McpServerToolSnapshot> = { remote: connected() };
  const { port, session } = createSession(() => snapshot, {
    waitForServer: vi.fn(async () => {
      snapshot = {
        remote: {
          ...snapshot.remote!,
          status: mcpStatus("connecting", { authorization: AUTHORIZATION }),
        },
      };
      return { timedOut: true };
    }),
  });
  try {
    const resolved = await session.resolve(DESCRIPTOR);
    expect(resolved).toEqual({
      unavailableReason: mcpUnavailableReason("needs_auth", "remote"),
    });
    expect(port.waitForServer).toHaveBeenCalledTimes(1);
    expect(port.waitForServer).toHaveBeenCalledWith("remote", {
      reconnect: true,
      reauthorize: true,
      signal: undefined,
      timeoutMs: 30_000,
    });
  } finally {
    session.close();
  }
});
