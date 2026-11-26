import { expect, it } from "vitest";
import {
  createSessionId,
  type McpPort,
  type McpServerToolSnapshot,
  type ModelRequest,
  type ToolSearchDelivery,
} from "@zcode/contracts";
import type { RuntimeMessageEntry } from "../../src/agent/message-history.js";
import type { AgentRuntimeInternal } from "../../src/runtime/internal.js";
import { createTestAgentRuntime } from "../test-agent-runtime.js";
import { createTestSessionEventStore } from "../test-event-store.js";
import { createTestModelFactory } from "../test-runtime-model.js";

// 交付链在真实 turn 里的接线：搜索结果引用产生 delivery，随后成功 assistant 提交时才写入历史；
// 下一个请求从历史恢复冻结定义，不再重复记录。
const TOOL_NAME = "mcp__local__ping";

function connectedSnapshot(): Record<string, McpServerToolSnapshot> {
  return {
    local: {
      status: { status: "connected", transport: "stdio", toolCount: 1, updatedAt: "t1" },
      tools: [
        {
          serverName: "local",
          toolName: "ping",
          description: "Ping service",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      toolsVersion: "v1",
    },
  };
}

function deliveries(entries: readonly RuntimeMessageEntry[]): ToolSearchDelivery[] {
  return entries.flatMap((entry) =>
    entry.kind !== "attachment" && entry.toolSearchDelivery ? [entry.toolSearchDelivery] : [],
  );
}

it("commits delivered definitions with the assistant and reuses them on the next request", async () => {
  const requests: ModelRequest[] = [];
  const port = {
    connectConfiguredServers: async () => ({ statuses: {}, tools: [] }),
    status: async () => ({}),
    listTools: async () => [],
    getToolSnapshot: connectedSnapshot,
    waitForServer: async () => ({ timedOut: false }),
    callTool: async () => ({ content: [{ type: "text", text: "pong" }] }),
  } as unknown as McpPort;
  const baseFactory = createTestModelFactory({
    generateText: async (request) => {
      requests.push(request);
      if (requests.length === 1)
        return {
          text: "",
          finishReason: "tool-calls",
          usage: {},
          toolCalls: [
            {
              id: "search",
              name: "ToolSearch",
              input: { query: `select:${TOOL_NAME}`, max_results: 5 },
              blockIndex: 0,
            },
          ],
        };
      return { text: "done", finishReason: "stop", usage: {} };
    },
  } as never);
  // native ToolSearch 需要 Anthropic 协议能力；测试模型只在能力声明上补齐。
  const modelFactory = (input: Parameters<typeof baseFactory>[0]) => {
    const model = baseFactory(input);
    const wrap = (current: typeof model): typeof model => ({
      ...current,
      requestCapabilities: {
        toolSearch: { protocolSupported: true, defaultEnabled: true },
      },
      bind: (options) => wrap(current.bind(options)),
    });
    return wrap(model);
  };
  const runtime = createTestAgentRuntime(
    createSessionId(),
    {
      mode: "yolo",
      modelStreaming: "off",
      titleGeneration: { enabled: false },
      toolSearch: { mode: "native" },
      mcp: { enabled: true, servers: { local: { type: "stdio", command: "node" } } },
    },
    {
      eventStore: createTestSessionEventStore(),
      mcpPort: port,
      modelFactory,
    },
  );
  const internal = runtime as unknown as AgentRuntimeInternal;
  try {
    await runtime.executeTurn("load ping");

    // delivery 随成功 assistant 提交进历史；搜索引用本身不是交付事实。
    const committed = deliveries(internal.messageHistory.borrowReadOnlyRuntimeEntries());
    expect(committed).toHaveLength(1);
    expect(committed[0]?.definitions.map((item) => item.tool.name)).toEqual([TOOL_NAME]);
    expect(committed[0]?.definitions[0]?.mcp).toEqual({ serverName: "local", toolName: "ping" });
    // 首个请求里 MCP 工具仍是 deferred（只给出名字）；定义由搜索结果交付，不在 tools 列表里。
    expect(requests[0]?.tools?.map((tool) => tool.name)).not.toContain(TOOL_NAME);

    await runtime.executeTurn("second request");
    // 第二个请求沿用已交付定义，不产生第二条记录，也不把 delivery 写进 provider 消息。
    expect(deliveries(internal.messageHistory.borrowReadOnlyRuntimeEntries())).toHaveLength(1);
    expect(JSON.stringify(requests.at(-1)?.messages)).not.toContain("toolSearchDelivery");
    expect(requests.at(-1)?.tools?.find((tool) => tool.name === TOOL_NAME)?.description).toBe(
      "Ping service",
    );
  } finally {
    await runtime.close();
  }
});
