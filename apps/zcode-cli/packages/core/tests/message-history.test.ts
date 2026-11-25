import { describe, expect, it } from "vitest";
import { createTestModelSelection } from "./test-model-selection.js";
import {
  MessageHistoryImpl,
  countContextPrefixMessages,
  createRuntimeAssistantEntry,
  type RuntimeMessageEntry,
} from "../src/agent/message-history.js";
import { commitAssistantToTurnRequest } from "../src/runtime/methods/turn-output-token-continuation.js";
import type { RuntimeModelTextResult } from "../src/runtime/types.js";
import { buildProviderRequestMessages } from "../src/runtime/helpers/provider-request-messages.js";
import type { ContextBuildResult, ContextSection } from "../src/context/types.js";
import { estimateTokens } from "../src/context/utils.js";
import { buildContextHistoryEntries } from "../src/runtime/methods/context-history-entries.js";

describe("message history metadata", () => {
  it("isolates announcement delta arrays across add, read and replace without exposing metadata", () => {
    const history = new MessageHistoryImpl();
    const delta = {
      addedNames: ["WebFetch"],
      removedNames: ["TodoWrite"],
      readdedNames: ["WebFetch"],
    };
    const expected = structuredClone(delta);
    history.addEntries([
      {
        message: { role: "user", content: "Tool availability changed." },
        metadata: { source: "legacy_synthetic", toolSearchAnnouncement: delta },
      },
    ]);
    for (const names of Object.values(delta)) names.push("source mutation");
    const entries = history.toRuntimeEntries();
    expect(entries[0]?.metadata?.toolSearchAnnouncement).toEqual(expected);
    history.replaceMessages(entries);
    for (const names of Object.values(entries[0]!.metadata!.toolSearchAnnouncement!))
      (names as string[]).push("copy mutation");
    expect(history.toRuntimeEntries()[0]?.metadata?.toolSearchAnnouncement).toEqual(expected);
    expect(buildProviderRequestMessages({ entries: history.toRuntimeEntries() }).messages).toEqual([
      { role: "user", content: "Tool availability changed." },
    ]);
  });

  it("preserves assistant model provenance through request-local clones", () => {
    const history = new MessageHistoryImpl();
    const model = createTestModelSelection("provider-a/model-a");

    history.addAssistant("answer", undefined, undefined, model);

    const entries = history.toRuntimeEntries();
    expect(entries[0]?.message).toMatchObject({ providerId: "provider-a", modelId: "model-a" });
    entries[0]!.message.providerId = "mutated" as never;
    expect(history.toRuntimeEntries()[0]?.message).toMatchObject({
      providerId: "provider-a",
      modelId: "model-a",
    });
  });

  it("preserves assistant tokens in runtime entries without exposing them to the provider", () => {
    const history = new MessageHistoryImpl();
    const tokens = {
      input: 100,
      output: 20,
      reasoning: 0,
      cache: { read: 0, write: 0 },
      total: 120,
    };

    history.addAssistant("answer", undefined, undefined, undefined, tokens);

    expect(history.toRuntimeEntries()[0]?.tokens).toEqual(tokens);
    expect(buildProviderRequestMessages({ entries: history.toRuntimeEntries() }).messages).toEqual([
      { role: "assistant", content: "answer" },
    ]);
  });

  it("borrows the current authoritative runtime entries without cloning the array", () => {
    const history = new MessageHistoryImpl();
    history.addUser("first prompt", { source: "real_user" });

    const beforeAppend = history.borrowReadOnlyRuntimeEntries();
    const retainedMembership = [...beforeAppend];
    expect(history.borrowReadOnlyRuntimeEntries()).toBe(beforeAppend);

    history.addAssistant("second message");
    expect(history.borrowReadOnlyRuntimeEntries()).toBe(beforeAppend);
    expect(beforeAppend).toHaveLength(2);
    expect(retainedMembership).toHaveLength(1);

    history.replaceMessages([
      {
        message: { role: "user", content: "replacement prompt" },
        metadata: { source: "real_user" },
      },
    ]);

    const afterReplace = history.borrowReadOnlyRuntimeEntries();
    expect(afterReplace).not.toBe(beforeAppend);
    expect(beforeAppend).toHaveLength(2);
    expect(afterReplace).toEqual([
      {
        message: { role: "user", content: "replacement prompt" },
        metadata: { source: "real_user" },
      },
    ]);
  });

  it("stores system reminder attachments as structured entries rendered only by provider builder", () => {
    const history = new MessageHistoryImpl();
    history.addUser("real prompt", { source: "real_user" });
    history.addAttachment("output_style", "style body");

    expect(history.toRuntimeEntries()).toEqual([
      {
        message: {
          role: "user",
          content: "real prompt",
        },
        metadata: { source: "real_user" },
      },
      {
        kind: "attachment",
        content: "style body",
        metadata: { source: "output_style" },
      },
    ]);
    expect(buildProviderRequestMessages({ entries: history.toRuntimeEntries() }).messages).toEqual([
      {
        role: "user",
        content: "real prompt",
      },
      {
        role: "system",
        content: "style body",
      },
    ]);
  });

  it("stores internal metadata without leaking it to provider messages", () => {
    const history = new MessageHistoryImpl();
    history.init("system prompt");
    history.addUser("hook context", {
      source: "hook_context",
    });

    const providerMessages = buildProviderRequestMessages({
      entries: history.toRuntimeEntries(),
    }).messages;
    expect(providerMessages).toEqual([
      { role: "system", content: "system prompt" },
      { role: "user", content: "hook context" },
    ]);

    const entries = history.toRuntimeEntries();
    expect(entries[1]?.metadata).toEqual({ source: "hook_context" });

    entries[1]!.message.content = "mutated";
    entries[1]!.metadata!.source = "real_user";
    expect(history.toRuntimeEntries()[1]).toMatchObject({
      message: { role: "user", content: "hook context" },
      metadata: { source: "hook_context" },
    });
  });

  it("counts only system messages and legacy unmarked reminders as request prefix", () => {
    const history = new MessageHistoryImpl();
    history.init([
      { role: "system", content: "system prompt" },
      // 指令文件是持久化公告；带来源标记的条目属于会话历史。
      {
        message: { role: "user", content: "context prefix" },
        metadata: {
          source: "context_prefix",
        },
      },
      {
        message: {
          role: "user",
          content: "<system-reminder>\nthis is a real user badcase\n</system-reminder>",
        },
        metadata: {
          source: "real_user",
        },
      },
    ]);

    expect(countContextPrefixMessages(history.toRuntimeEntries())).toBe(1);
    expect(history.getCacheStats().cachedMessages).toBe(1);

    expect(
      countContextPrefixMessages([
        { role: "system", content: "system prompt" },
        { role: "user", content: "<system-reminder>\nlegacy prefix\n</system-reminder>" },
        { role: "user", content: "real user prompt" },
      ]),
    ).toBe(2);
  });

  it("keeps skills and instruction attachments out of context prefix entries", () => {
    const skillsSection = contextSection({
      name: "Available Skills",
      source: "skills",
      content: "# Skills\n- review: Inspect code",
    });
    const dateSection = contextSection({
      name: "Request User Context",
      source: "request_user_context",
      content: "# currentDate\nToday's date is 2026-06-17.",
    });
    const contextResult: ContextBuildResult = {
      sections: [skillsSection, dateSection],
      totalChars: skillsSection.chars + dateSection.chars,
      totalTokens: skillsSection.tokens + dateSection.tokens,
      systemMessages: [{ role: "system", content: "system prompt" }],
      metaUserAttachments: [
        {
          source: "skills_listing",
          content: "# Skills\n- review: Inspect code",
        },
        {
          source: "context_prefix",
          content:
            "As you answer the user's questions, you can use the following context:\n# currentDate\nToday's date is 2026-06-17.\n\n      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.",
        },
      ],
    };

    // Skill 列表与指令文件由请求前的动态公告宣告，prefix 只含 system 消息。
    expect(buildContextHistoryEntries(contextResult)).toEqual([
      { message: { role: "system", content: "system prompt" } },
    ]);
  });
});

function contextSection(input: {
  name: string;
  source: ContextSection["source"];
  content: string;
}): ContextSection {
  return {
    name: input.name,
    source: input.source,
    injectionTarget: "meta_user",
    cacheHint: "dynamic",
    content: input.content,
    chars: input.content.length,
    tokens: estimateTokens(input.content),
    preview: input.content.slice(0, 100),
  };
}

describe("legacy assistant entries", () => {
  it("drop blockIndex that a non-stream result wrote onto reasoning blocks", () => {
    // 非流式结果会在原对象上给 reasoning 编号；旧条目不带 blockIndex，
    // 否则只有思考块的条目会被请求投影当成有序条目（docs/design/v2/model/assistant-block-order.md）。
    const reasoning = [
      { type: "reasoning" as const, text: "think", providerOptions: { a: 1 }, blockIndex: 0 },
    ];
    const entry = createRuntimeAssistantEntry("answer", undefined, reasoning);
    expect(entry.message.content).toEqual([
      { type: "reasoning", text: "think", providerOptions: { a: 1 } },
      { type: "text", text: "answer" },
    ]);
    expect(reasoning[0]).toHaveProperty("blockIndex", 0);
  });
});

describe("live assistant ordered projection", () => {
  it("commits ordered stream blocks through buildAssistantEntries and marks repaired steps", () => {
    // live 与冷恢复共用 buildAssistantEntries：相邻文字块不合并、保留 blockIndex；
    // 签名修复后成功的请求在第一条 assistant 上记标记，冷恢复按消息 metadata 还原同一标记。
    const committed: RuntimeMessageEntry[] = [];
    const state = {
      model: createTestModelSelection("provider-a/model-a"),
      modelResponse: "firstsecond",
      turnRequestState: { entries: [] as RuntimeMessageEntry[], outputTokenContinuationCount: 0 },
    };
    const result: RuntimeModelTextResult = {
      finishReason: "stop",
      text: "firstsecond",
      textBlocks: [
        { type: "text", text: "first", blockIndex: 0 },
        { type: "text", text: "second", blockIndex: 1 },
      ],
      usage: {},
      signedReasoningReset: true,
    };
    const runtime = {
      messageHistory: {
        addEntries(entries: readonly RuntimeMessageEntry[]) {
          committed.push(...entries);
        },
      },
    };

    const handled = commitAssistantToTurnRequest(
      runtime as never,
      state as never,
      result,
      undefined,
    );

    expect(handled).toBe(true);
    expect(committed).toHaveLength(1);
    expect(committed[0]?.message).toMatchObject({
      role: "assistant",
      content: [
        { type: "text", text: "first", blockIndex: 0 },
        { type: "text", text: "second", blockIndex: 1 },
      ],
      providerId: "provider-a",
      modelId: "model-a",
      signedReasoningReset: true,
    });
    // 本轮请求条目与历史条目是同一对象，交付定义/标记不会在两条路径间分叉。
    expect(state.turnRequestState.entries).toEqual(committed);
  });
});

describe("tool search message fields", () => {
  it("clones delivery and mcp delta without sharing mutable state", () => {
    const history = new MessageHistoryImpl();
    const delivery = {
      definitions: [{ tool: { name: "analyze_image", inputSchema: { type: "object" } } }],
      strippedReferences: [{ toolCallId: "call-1", toolName: "analyze_image" }],
    };
    history.addAssistant("answer", undefined, undefined, undefined, undefined, delivery);
    delivery.strippedReferences.push({ toolCallId: "mutated", toolName: "mutated" });
    const entry = history.toRuntimeEntries()[0];
    expect(entry?.toolSearchDelivery).toMatchObject({
      strippedReferences: [{ toolCallId: "call-1", toolName: "analyze_image" }],
    });

    const delta = {
      mcp: { pending: ["server"], failed: [] },
      retractedTools: [{ name: "old_tool", cause: "switched_off" }],
    };
    history.addEntries([
      {
        message: { role: "user", content: "tool availability" },
        metadata: { source: "tool_search_announcement", toolSearchMcpDelta: delta },
      },
    ]);
    delta.retractedTools.push({ name: "mutated", cause: "mutated" });
    const metadata = history.toRuntimeEntries()[1]?.metadata;
    expect(metadata?.toolSearchMcpDelta).toEqual({
      mcp: { pending: ["server"], failed: [] },
      retractedTools: [{ name: "old_tool", cause: "switched_off" }],
    });
  });
});
