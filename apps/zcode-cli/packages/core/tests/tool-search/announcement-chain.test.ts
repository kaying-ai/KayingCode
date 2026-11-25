import { expect, it } from "vitest";
import type { RuntimeMessageEntry } from "../../src/agent/message-history.js";
import { createToolRegistry } from "../../src/tool/registry.js";
import { toolSearchToolEntry } from "../../src/tool/handlers/tool-search.js";
import { todoReadToolEntry } from "../../src/tool/handlers/todo.js";
import { buildToolExposure, buildToolSearchAnnouncement } from "../../src/tool/search/exposure.js";
import { createTestRuntimeModel } from "../test-runtime-model.js";

// 公告链路：名称增量、撤销原因、恢复与 MCP 状态都从同一条公告 metadata 派生。
// 断言只用正文片段，不绑定整段文案，避免品牌文案调整让事实断言失效。
function fixture() {
  const registry = createToolRegistry();
  registry.register(toolSearchToolEntry);
  registry.register(todoReadToolEntry);
  const model = {
    ...createTestRuntimeModel({
      generateText: async () => ({ text: "", finishReason: "stop", usage: {} }),
    }),
    requestCapabilities: { toolSearch: { protocolSupported: true, defaultEnabled: true } },
  };
  const entries: RuntimeMessageEntry[] = [];
  const input = () => ({
    model,
    mode: "native" as const,
    registry,
    tools: registry.toContracts(),
    entries,
  });
  return { registry, entries, input };
}

function mcpEntry(name: string, serverName: string, toolName: string) {
  return {
    ...todoReadToolEntry,
    metadata: {
      ...todoReadToolEntry.metadata,
      name,
      mcpPresentation: {
        serverName,
        toolName,
      },
    },
  } as typeof todoReadToolEntry;
}

it("retracts a delivered definition when its MCP source is removed and restores it on return", () => {
  const { registry, entries, input } = fixture();
  const name = "mcp__demo__ping";
  registry.register(mcpEntry(name, "demo", "ping"));
  // 首次公告 + 搜索结果引用 + 交付记录，构成一次完整交付。
  entries.push(buildToolSearchAnnouncement({ ...input(), entries: [] })!);
  entries.push({
    message: {
      role: "tool",
      toolCallId: "load",
      toolName: "ToolSearch",
      content: [{ type: "tool_reference", toolName: name }],
    },
  });
  const delivered = buildToolExposure(input()).delivery;
  expect(delivered?.definitions.map((item) => item.tool.name)).toContain(name);
  entries.push({
    message: { role: "assistant", content: "loaded" },
    toolSearchDelivery: delivered,
  });

  registry.unregister(name);
  const removed = buildToolSearchAnnouncement({
    ...input(),
    mcp: { pending: [], failed: [], sources: {} },
  })!;
  expect(removed.content).toContain(
    "Definitions of the following tools were loaded earlier in this conversation and their source has since been removed",
  );
  expect(removed.content).toContain("MCP server removed from the configuration: mcp__demo__ping");
  expect(removed.metadata.toolSearchMcpDelta?.retractedTools).toEqual([
    { name, cause: "not_configured" },
  ]);
  entries.push(removed);

  registry.register({
    ...todoReadToolEntry,
    metadata: { ...todoReadToolEntry.metadata, name, alwaysLoad: true },
  });
  const restored = buildToolSearchAnnouncement(input())!;
  expect(restored.content).toContain(
    "The following tools are available again in this session. The earlier instruction to disregard their definitions and not call them no longer applies:",
  );
  expect(restored.content).toContain(name);
  expect(restored.metadata.toolSearchMcpDelta?.restoredNames).toEqual([name]);
});

it("separates denied tools from disabled servers in revocation causes", () => {
  const { registry, entries, input } = fixture();
  const name = "mcp__acl__read";
  registry.register(mcpEntry(name, "acl", "read"));
  entries.push({
    message: {
      role: "tool",
      toolCallId: "load",
      toolName: "ToolSearch",
      content: [{ type: "tool_reference", toolName: name }],
    },
  });
  const delivered = buildToolExposure(input()).delivery;
  entries.push({
    message: { role: "assistant", content: "loaded" },
    toolSearchDelivery: delivered,
  });
  registry.unregister(name);

  // 权限规则撤销：server 仍连接，但 initializeMcp 把被 allow/deny 过滤的名称记进 deniedTools。
  const denied = buildToolSearchAnnouncement({
    ...input(),
    mcp: { pending: [], failed: [], sources: { acl: "connected" }, deniedTools: [name] },
  })!;
  expect(denied.metadata.toolSearchMcpDelta?.retractedTools).toEqual([{ name, cause: "denied" }]);
  expect(denied.content).toContain("Denied by a permission rule");

  // server 被用户停用：同一批交付事实从干净历史重算，原因来自连接分类而不是 deniedTools。
  const disabled = buildToolSearchAnnouncement({
    ...input(),
    entries: entries.filter((entry) => entry.kind !== "attachment"),
    mcp: { pending: [], failed: [], sources: { acl: "disabled" } },
  })!;
  expect(disabled.metadata.toolSearchMcpDelta?.retractedTools).toEqual([
    { name, cause: "disabled" },
  ]);
  expect(disabled.content).toContain("MCP server disabled by the user");
});

it("announces connecting servers once and deduplicates repeated status", () => {
  const { input } = fixture();
  const names = buildToolSearchAnnouncement({ ...input(), entries: [] })!;
  const mcp = { pending: ["service"], failed: [] };
  const first = buildToolSearchAnnouncement({ ...input(), entries: [names], mcp })!;
  expect(first.content).toContain("The following MCP servers are still connecting —");
  // 状态公告没有名称增量，只有 metadata.toolSearchMcpDelta。
  expect(first.metadata.toolSearchAnnouncement).toBeUndefined();
  expect(first.metadata.toolSearchMcpDelta?.mcp).toEqual(mcp);
  // 名称增量必须重复当前状态；否则状态在没有新公告时从上下文里消失。
  const next = buildToolSearchAnnouncement({
    ...input(),
    entries: [names, first],
    tools: input().tools.filter((tool) => tool.name !== "TodoRead"),
    mcp,
  })!;
  expect(next.content).toContain("The following MCP servers are still connecting —");
  expect(
    buildToolSearchAnnouncement({
      ...input(),
      entries: [names, first, next],
      tools: input().tools.filter((tool) => tool.name !== "TodoRead"),
      mcp,
    }),
  ).toBeUndefined();
});

it("rebuilds compact names without replaying transient connection status", () => {
  const { input } = fixture();
  const notice = buildToolSearchAnnouncement(
    {
      ...input(),
      entries: [],
      mcp: { pending: ["waiting"], failed: [{ name: "broken", error: "refused" }] },
    },
    new Set(),
  );
  expect(notice?.content).toContain("TodoRead");
  expect(notice?.content).not.toMatch(/still connecting|failed to connect/);
  expect(notice?.metadata.toolSearchMcpDelta?.mcp).toBeUndefined();
});

it("announces authorization changes once", () => {
  const { input } = fixture();
  const names = buildToolSearchAnnouncement({ ...input(), entries: [] })!;
  const mcp = { pending: [], needsAuth: ["locked"], failed: [] };
  const first = buildToolSearchAnnouncement({ ...input(), entries: [names], mcp })!;
  expect(first.content).toContain(
    "The following MCP servers require authentication before their tools can be used:\nlocked",
  );
  expect(first.metadata.toolSearchMcpDelta?.mcp).toEqual(mcp);
  expect(buildToolSearchAnnouncement({ ...input(), entries: [names, first], mcp })).toBeUndefined();
});
