import { describe, expect, it, vi } from "vitest";
import { kayingcodeProtocolMethods } from "@zcode/shared";
import {
  gateConversationQuoteComment,
  supportsConversationQuoteComment,
} from "../src/kayingcode-agent/conversationQuoteCommentSupport.js";

function capabilityClient(result: () => Promise<unknown>) {
  const request = vi.fn(result);
  return { client: { request } as never, request };
}

function envelopeWithQuotes(quotes: unknown[]) {
  return {
    clientId: "client-1",
    type: "sendText" as const,
    payload: { text: "hello", conversationQuotes: quotes },
  };
}

const annotatedQuote = {
  text: "selected text",
  path: "src/app.ts",
  senderName: "user",
  messageId: "msg-1",
  comment: "这段逻辑是否覆盖并发",
  agent: "explorer",
};

describe("conversation quote comment capability probe", () => {
  it("reports true only when the CLI explicitly advertises the capability", async () => {
    const { client, request } = capabilityClient(async () => ({ conversationQuoteComment: true }));
    await expect(supportsConversationQuoteComment(client)).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      kayingcodeProtocolMethods.runtimeCapabilities,
      {},
      expect.anything(),
    );
  });

  it("reports false when the capability is absent or false", async () => {
    await expect(
      supportsConversationQuoteComment(capabilityClient(async () => ({})).client),
    ).resolves.toBe(false);
    await expect(
      supportsConversationQuoteComment(
        capabilityClient(async () => ({ conversationQuoteComment: false })).client,
      ),
    ).resolves.toBe(false);
    await expect(
      supportsConversationQuoteComment(
        capabilityClient(async () => ({ conversationQuoteComment: "true" })).client,
      ),
    ).resolves.toBe(false);
  });

  it("probes once per CLI connection and reuses the result", async () => {
    const { client, request } = capabilityClient(async () => ({ conversationQuoteComment: true }));

    await expect(supportsConversationQuoteComment(client)).resolves.toBe(true);
    await expect(supportsConversationQuoteComment(client)).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("fails closed and retries after a probe error", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("proto.methodNotFound"))
      .mockResolvedValueOnce({ conversationQuoteComment: true });
    const client = { request } as never;

    await expect(supportsConversationQuoteComment(client)).resolves.toBe(false);
    await expect(supportsConversationQuoteComment(client)).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe("conversation quote comment gate", () => {
  it("forwards comment and agent when the CLI advertises the capability", async () => {
    const { client } = capabilityClient(async () => ({ conversationQuoteComment: true }));
    const envelope = envelopeWithQuotes([annotatedQuote]);

    const gated = await gateConversationQuoteComment(envelope, client);

    expect(gated.payload.conversationQuotes).toEqual([annotatedQuote]);
    // 输入对象不被修改。
    expect(envelope.payload.conversationQuotes[0]).toBe(annotatedQuote);
  });

  it("restores comment fields that an intermediate payload parse stripped", async () => {
    const { client } = capabilityClient(async () => ({ conversationQuoteComment: true }));
    // 模拟 host 侧用 command schema 重建过 payload：批注字段已被剥掉。
    const commandEnvelope = {
      type: "sendText" as const,
      payload: { text: "hello", conversationQuotes: [{ text: "selected text" }] },
    };
    const sourceEnvelope = envelopeWithQuotes([annotatedQuote]);

    const gated = await gateConversationQuoteComment(commandEnvelope, client, sourceEnvelope);

    expect(gated.payload.conversationQuotes).toEqual([annotatedQuote]);
  });

  it("strips comment and agent when the CLI does not advertise the capability", async () => {
    const { client } = capabilityClient(async () => ({}));
    const envelope = envelopeWithQuotes([annotatedQuote]);
    const sourceEnvelope = envelopeWithQuotes([annotatedQuote]);

    const gated = await gateConversationQuoteComment(envelope, client, sourceEnvelope);

    const [quote] = gated.payload.conversationQuotes as Array<Record<string, unknown>>;
    expect(quote).toEqual({
      text: "selected text",
      path: "src/app.ts",
      senderName: "user",
      messageId: "msg-1",
    });
    // 调用方对象不被修改：其他引用仍保留原始批注字段。
    expect(envelope.payload.conversationQuotes[0]).toBe(annotatedQuote);
    expect("comment" in (envelope.payload.conversationQuotes[0] as Record<string, unknown>)).toBe(
      true,
    );
  });

  it("strips only annotated quotes and keeps clean quotes untouched", async () => {
    const { client } = capabilityClient(async () => ({}));
    const cleanQuote = { text: "plain quote", path: "README.md" };
    const gated = await gateConversationQuoteComment(
      envelopeWithQuotes([cleanQuote, annotatedQuote]),
      client,
    );

    const quotes = gated.payload.conversationQuotes;
    expect(quotes[0]).toBe(cleanQuote);
    expect(quotes[1]).toEqual({
      text: "selected text",
      path: "src/app.ts",
      senderName: "user",
      messageId: "msg-1",
    });
  });

  it("does not probe or copy when no quote carries comment or agent", async () => {
    const { client, request } = capabilityClient(async () => ({ conversationQuoteComment: false }));
    const envelope = envelopeWithQuotes([{ text: "plain quote", path: "README.md" }]);

    const gated = await gateConversationQuoteComment(envelope, client);

    expect(gated).toBe(envelope);
    expect(request).not.toHaveBeenCalled();
  });

  it("does not probe payloads without conversationQuotes", async () => {
    const { client, request } = capabilityClient(async () => ({ conversationQuoteComment: true }));
    const envelope = { type: "sendText" as const, payload: { text: "hello" } };

    await expect(gateConversationQuoteComment(envelope, client)).resolves.toBe(envelope);
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps unrelated payload fields when stripping", async () => {
    const { client } = capabilityClient(async () => ({}));
    const gated = await gateConversationQuoteComment(
      {
        type: "sendText" as const,
        payload: {
          text: "hello",
          modelSelection: { providerId: "p", modelId: "m" },
          conversationQuotes: [{ text: "x", comment: "c" }],
        },
      },
      client,
    );

    expect(gated.payload.text).toBe("hello");
    expect(gated.payload.modelSelection).toEqual({ providerId: "p", modelId: "m" });
    expect(gated.payload.conversationQuotes).toEqual([{ text: "x" }]);
  });

  it("detects comment or agent independently", async () => {
    const { client } = capabilityClient(async () => ({}));

    const withAgent = await gateConversationQuoteComment(
      envelopeWithQuotes([{ text: "x", agent: "explorer" }]),
      client,
    );
    expect(withAgent.payload.conversationQuotes).toEqual([{ text: "x" }]);

    const withComment = await gateConversationQuoteComment(
      envelopeWithQuotes([{ text: "x", comment: "why" }]),
      client,
    );
    expect(withComment.payload.conversationQuotes).toEqual([{ text: "x" }]);
  });
});
