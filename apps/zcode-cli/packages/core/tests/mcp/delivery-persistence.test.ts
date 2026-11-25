import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  ToolSearchDeliverySchema,
  createMessageId,
  createPartId,
  createProjectId,
  createSessionId,
  hasOrderedAssistantBlocks,
  type McpConfigurationSnapshot,
  type McpConfigurationSource,
  type McpPort,
  type McpServerStatus,
  type McpServerToolSnapshot,
  type Model,
  type ModelRequest,
  type SessionId,
  type SessionStorePort,
} from "@zcode/contracts";
import { createSqliteSessionStore } from "../../../adapters/src/storage/session-store/sqlite-session-store.js";
import { MessageHistoryImpl } from "../../src/agent/message-history.js";
import { hydrateMessageHistoryFromSession } from "../../src/agent/session-history-hydrator.js";
import type { AgentRuntimeInternal } from "../../src/runtime/internal.js";
import { isToolSearchAnnouncementMetadata } from "../../src/tool/search/history.js";
import { createTestAgentRuntime } from "../test-agent-runtime.js";
import { createTestSessionEventStore } from "../test-event-store.js";
import { createTestModelFactory } from "../test-runtime-model.js";

// 冷恢复边界：ToolSearch 已交付定义（toolSearchDelivery）与 MCP 状态增量（toolSearchMcpDelta）
// 必须随消息记录恢复。live 在 commitTurnRequestEntries 把 delivery 挂在第一条非空 assistant 上；
// 冷恢复如果丢掉它，移除 server 后仍须保留的工具定义和 tool_reference 都会被重新判定为失效。

function mcpStatus(
  status: McpServerStatus["status"],
  extra: Partial<McpServerStatus> = {},
): McpServerStatus {
  return { status, transport: "stdio", toolCount: 0, updatedAt: "now", ...extra };
}

function stdioServer() {
  return { type: "stdio" as const, command: "node", args: ["server.js"] };
}

function tool(serverName: string, toolName: string) {
  return { serverName, toolName, inputSchema: { type: "object", properties: {} } as const };
}

function mcpPort(snapshot: Record<string, McpServerToolSnapshot>): McpPort {
  return {
    connectConfiguredServers: async () => ({ statuses: {}, tools: [] }),
    connectServer: async () => mcpStatus("connected"),
    disconnectServer: async () => undefined,
    status: async () => ({}),
    listTools: async () => [],
    callTool: async () => ({ content: [{ type: "text", text: "pong" }] }),
    getToolSnapshot: () => snapshot,
    waitForServer: async () => ({ timedOut: false }),
    close: async () => {},
  } as unknown as McpPort;
}

function createRuntime(input: {
  sessionID: SessionId;
  snapshot: Record<string, McpServerToolSnapshot>;
  configurationSource: McpConfigurationSource;
  sessionStore: SessionStorePort;
  ordered: boolean;
  search: boolean;
}) {
  const requests: ModelRequest[] = [];
  const baseFactory = createTestModelFactory({
    generateText: async (request) => {
      requests.push(request);
      const index = requests.length - 1;
      if (input.search && index === 0)
        return {
          text: "",
          finishReason: "tool-calls",
          usage: {},
          toolCalls: [
            {
              id: "search",
              name: "ToolSearch",
              input: { query: "select:mcp__local__ping", max_results: 5 },
              ...(input.ordered ? { blockIndex: 0 } : {}),
            },
          ],
        } as never;
      // 交付定义的那一步：有序形态给文字块带序号，旧形态只有 text。
      if (input.search && index === 1 && input.ordered)
        return {
          text: "loaded",
          textBlocks: [{ type: "text", text: "loaded", blockIndex: 0 }],
          finishReason: "stop",
          usage: {},
        } as never;
      return { text: "done", finishReason: "stop", usage: {} };
    },
  } as never);
  // native ToolSearch 需要 Anthropic 协议能力；测试模型只在能力声明上补齐。
  const modelFactory = (selection: Parameters<typeof baseFactory>[0]) => {
    const model = baseFactory(selection);
    const wrap = (current: Model): Model => ({
      ...current,
      requestCapabilities: {
        toolSearch: { protocolSupported: true, defaultEnabled: true },
      },
      bind: (options) => wrap(current.bind(options)),
    });
    return wrap(model);
  };
  const runtime = createTestAgentRuntime(
    input.sessionID,
    {
      mode: "build",
      modelStreaming: "off",
      titleGeneration: { enabled: false },
      toolSearch: { mode: "native" },
      mcp: { enabled: true, servers: { local: stdioServer() } },
    },
    {
      sessionStore: input.sessionStore,
      eventStore: createTestSessionEventStore(),
      mcpPort: mcpPort(input.snapshot),
      mcpConfigurationSource: input.configurationSource,
      mcpStartupPolicy: "background",
      modelFactory,
    },
  );
  return { requests, runtime };
}

it.each(["unordered", "ordered"] as const)(
  "preserves delivered definitions across removal and cold resume: %s blocks",
  async (blocks) => {
    const root = await mkdtemp(join(tmpdir(), "zcode-mcp-delivery-"));
    const store = await createSqliteSessionStore({ dbPath: join(root, "session.sqlite") });
    const sessionID = createSessionId(`runtime-mcp-delivery-cold-${blocks}`);
    await store.createSession({
      id: sessionID,
      projectID: createProjectId("test"),
      slug: "test",
      title: "test",
      directory: root,
      version: "test",
    });
    let config: McpConfigurationSnapshot = { enabled: true, servers: { local: stdioServer() } };
    let notify = () => {};
    const configurationSource: McpConfigurationSource = {
      getSnapshot: () => config,
      subscribe: (listener) => {
        notify = listener;
        return () => {};
      },
      close() {},
    };
    const snapshot: Record<string, McpServerToolSnapshot> = {
      local: {
        status: mcpStatus("connected"),
        tools: [{ ...tool("local", "ping"), description: "Ping service" }],
        toolsVersion: "1",
      },
    };
    const ordered = blocks === "ordered";
    const first = createRuntime({
      sessionID,
      snapshot,
      configurationSource,
      sessionStore: store,
      ordered,
      search: true,
    });
    let cold: ReturnType<typeof createRuntime> | undefined;
    try {
      await first.runtime.executeTurn("load ping");
      const records = await store.messages({ sessionID });
      const delivered = records.find((record) => record.info.metadata?.toolSearchDelivery);
      expect(delivered?.info.metadata?.toolSearchDelivery).toMatchObject({
        definitions: [{ tool: { name: "mcp__local__ping", description: "Ping service" } }],
      });
      expect(
        ToolSearchDeliverySchema.safeParse(delivered?.info.metadata?.toolSearchDelivery).success,
      ).toBe(true);
      expect(hasOrderedAssistantBlocks(delivered?.parts ?? [])).toBe(ordered);

      // 移除 server：definition 不在当前 catalog 里，只能靠历史里的 delivery 继续回放。
      config = { enabled: true, servers: {} };
      delete snapshot.local;
      notify();
      await first.runtime.executeTurn("removed");
      expect(
        first.requests.at(-1)?.tools?.find((entry) => entry.name === "mcp__local__ping"),
      ).toBeDefined();
      expect(
        (first.runtime as unknown as AgentRuntimeInternal).registry.get("mcp__local__ping"),
      ).toBeUndefined();

      first.runtime.beginShutdown();
      cold = createRuntime({
        sessionID,
        snapshot,
        configurationSource,
        sessionStore: store,
        ordered,
        search: false,
      });
      await cold.runtime.resumeFromStore();
      const restored = (cold.runtime as unknown as AgentRuntimeInternal).messageHistory
        .borrowReadOnlyRuntimeEntries()
        .filter((entry) => entry.kind !== "attachment" && entry.toolSearchDelivery);
      expect(restored).toHaveLength(1);
      expect(restored[0]?.message.role).toBe("assistant");
      expect(restored[0]?.toolSearchDelivery?.definitions.map((item) => item.tool.name)).toEqual([
        "mcp__local__ping",
      ]);

      await cold.runtime.executeTurn("resume");
      // 移除后 registry 已没有该工具：冷恢复请求只能靠历史里的 delivery 还原模型可见定义。
      expect(
        cold.requests.at(-1)?.tools?.find((entry) => entry.name === "mcp__local__ping"),
      ).toMatchObject({
        name: "mcp__local__ping",
        description: "Ping service",
        inputSchema: { type: "object", properties: {} },
      });
      expect(JSON.stringify(cold.requests.at(-1)?.messages)).toContain('"tool_reference"');
      expect(JSON.stringify(cold.requests.at(-1)?.messages)).not.toContain("toolSearchDelivery");
    } finally {
      first.runtime.beginShutdown();
      cold?.runtime.beginShutdown();
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);

it("restores MCP state delta and empty directory announcements from cold storage", async () => {
  const sessionID = createSessionId("mcp-delta-hydration");
  const messageID = createMessageId("mcp-delta-user");
  const history = new MessageHistoryImpl();
  await hydrateMessageHistoryFromSession({
    history,
    messages: [
      {
        info: {
          id: messageID,
          sessionID,
          role: "user",
          time: { created: 1 },
          agent: "kayingcode-agent",
        },
        parts: [
          {
            id: createPartId("announcement"),
            messageID,
            sessionID,
            type: "text",
            // 目录状态结算没有正文；空文本不能让它被当作坏提醒丢掉。
            text: "",
            synthetic: true,
            metadata: {
              source: "tool_search_announcement",
              runtimeMessage: {
                source: "tool_search_announcement",
                toolSearchMcpDelta: {
                  mcp: {
                    pending: ["alpha"],
                    failed: [{ name: "beta", error: "boom" }],
                  },
                },
              },
            },
          },
        ],
      } as never,
    ],
  });
  const entries = history.toRuntimeEntries();
  expect(entries).toHaveLength(1);
  const metadata = entries[0]?.metadata;
  expect(isToolSearchAnnouncementMetadata(metadata)).toBe(true);
  expect(metadata?.source).toBe("tool_search_announcement");
  expect(metadata?.toolSearchMcpDelta).toEqual({
    mcp: { pending: ["alpha"], failed: [{ name: "beta", error: "boom" }] },
  });
});

it("attaches delivery to the shared ordered projection", async () => {
  // 有序消息与 live 共用 buildAssistantEntries，回放时保留 blockIndex 与独立文字块；
  // delivery 仍挂在第一条非空 assistant 上，与 live commitTurnRequestEntries 一致。
  const sessionID = createSessionId("ordered-delivery");
  const messageID = createMessageId("ordered-assistant");
  const delivery = {
    definitions: [
      {
        tool: {
          name: "mcp__local__ping",
          description: "Ping service",
          inputSchema: { type: "object" },
        },
      },
    ],
    strippedReferences: [],
  };
  const history = new MessageHistoryImpl();
  await hydrateMessageHistoryFromSession({
    history,
    messages: [
      {
        info: {
          id: messageID,
          sessionID,
          role: "assistant",
          time: { created: 1 },
          metadata: { toolSearchDelivery: delivery },
        },
        parts: [
          {
            id: createPartId("first"),
            messageID,
            sessionID,
            type: "text",
            text: "first",
            blockIndex: 0,
          },
          {
            id: createPartId("second"),
            messageID,
            sessionID,
            type: "text",
            text: " second",
            blockIndex: 1,
          },
        ],
      } as never,
    ],
  });
  const entries = history.toRuntimeEntries();
  const assistant = entries.find(
    (entry) => entry.kind !== "attachment" && entry.message.role === "assistant",
  );
  expect(assistant?.message.content).toEqual([
    { type: "text", text: "first", blockIndex: 0 },
    { type: "text", text: " second", blockIndex: 1 },
  ]);
  expect(assistant?.toolSearchDelivery).toEqual(delivery);
});

it("restores delivery carried by a compaction boundary summary", async () => {
  // compact 摘要消息的 delivery 只在有 compaction 边界时恢复；普通用户输入不挂交付事实。
  const sessionID = createSessionId("compact-boundary-delivery");
  const messageID = createMessageId("compact-summary");
  const delivery = {
    definitions: [
      {
        tool: {
          name: "mcp__local__ping",
          description: "Ping service",
          inputSchema: { type: "object" },
        },
      },
    ],
    strippedReferences: [],
  };
  const history = new MessageHistoryImpl();
  await hydrateMessageHistoryFromSession({
    history,
    messages: [
      {
        info: {
          id: messageID,
          sessionID,
          role: "user",
          time: { created: 1 },
          metadata: { toolSearchDelivery: delivery },
        },
        parts: [
          {
            id: createPartId("summary"),
            messageID,
            sessionID,
            type: "text",
            text: "older work summary",
            synthetic: true,
          },
          {
            id: createPartId("boundary"),
            messageID,
            sessionID,
            type: "compaction",
            compactBoundary: { boundaryId: "boundary-1" },
          },
        ],
      } as never,
    ],
  });
  expect(history.toRuntimeEntries()[0]?.toolSearchDelivery).toEqual(delivery);
});

it("restores delivery on the first provider round, matching the live commit point", async () => {
  // live 在 server 工具轮次在前时把 delivery 挂在轮次 assistant 上；冷恢复不能把它挪到最后一条。
  const sessionID = createSessionId("provider-round-delivery");
  const messageID = createMessageId("provider-round-assistant");
  const delivery = {
    definitions: [
      {
        tool: {
          name: "mcp__local__ping",
          description: "Ping service",
          inputSchema: { type: "object" },
        },
      },
    ],
    strippedReferences: [],
  };
  const history = new MessageHistoryImpl();
  await hydrateMessageHistoryFromSession({
    history,
    messages: [
      {
        info: {
          id: messageID,
          sessionID,
          role: "assistant",
          time: { created: 1 },
          metadata: { toolSearchDelivery: delivery },
        },
        parts: [
          {
            id: createPartId("first"),
            messageID,
            sessionID,
            type: "text",
            text: "先看图",
          },
          {
            id: createPartId("provider-call"),
            messageID,
            sessionID,
            type: "tool",
            callID: "call_image",
            tool: "analyze_image",
            metadata: { providerExecuted: true },
            state: {
              status: "completed",
              input: {},
              output: "Order Console",
              title: "analyze_image",
              metadata: {},
              time: { start: 1, end: 2 },
            },
          },
          {
            id: createPartId("second"),
            messageID,
            sessionID,
            type: "text",
            text: "最后回答",
          },
        ],
      } as never,
    ],
  });
  const assistants = history
    .toRuntimeEntries()
    .filter((entry) => entry.kind !== "attachment" && entry.message.role === "assistant");
  expect(assistants).toHaveLength(2);
  expect(assistants[0]?.toolSearchDelivery).toEqual(delivery);
  expect(assistants[1]?.toolSearchDelivery).toBeUndefined();
});

it("does not force delivery onto an empty usage anchor", async () => {
  // 空 assistant 只作为上下文估算锚点；live 不会在它上面固化交付事实，冷恢复同样不挂。
  const sessionID = createSessionId("empty-anchor-delivery");
  const messageID = createMessageId("empty-anchor");
  const delivery = {
    definitions: [
      {
        tool: {
          name: "mcp__local__ping",
          description: "Ping service",
          inputSchema: { type: "object" },
        },
      },
    ],
    strippedReferences: [],
  };
  const history = new MessageHistoryImpl();
  await hydrateMessageHistoryFromSession({
    history,
    messages: [
      {
        info: {
          id: messageID,
          sessionID,
          role: "assistant",
          time: { created: 1 },
          tokens: {
            input: 10,
            output: 5,
            reasoning: 0,
            cache: { read: 0, write: 0 },
            total: 15,
          },
          metadata: { toolSearchDelivery: delivery },
        },
        parts: [],
      } as never,
    ],
  });
  const assistants = history
    .toRuntimeEntries()
    .filter((entry) => entry.kind !== "attachment" && entry.message.role === "assistant");
  expect(assistants).toHaveLength(1);
  expect(assistants[0]?.message.content).toBe("");
  expect(assistants[0]?.toolSearchDelivery).toBeUndefined();
});
