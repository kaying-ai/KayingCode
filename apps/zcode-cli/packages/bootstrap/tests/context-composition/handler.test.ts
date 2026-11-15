// v4/conversation/contextComposition 的 CLI 侧处理（spec §3.3、§4 第 5 类）。
// 用桩 runtime 覆盖 existing-only、修订号先读后测、旧会话不冷启动三条边界。
import { describe, expect, it, vi } from "vitest";
import type { ContextCompositionMeasurement } from "@zcode/core";
import {
  getConversationContextComposition,
  getContextCompositionTracker,
} from "../../src/kayingcode-protocol/context-composition/index.js";
import type { KayingCodeProtocolAgentServerContext } from "../../src/kayingcode-protocol/server-types.js";

const measurement: ContextCompositionMeasurement = {
  phase: "request",
  measuredAt: 1_700_000_000_000,
  model: { providerId: "zai", modelId: "glm-4.6", contextWindow: 128_000 },
  tokenMethod: "estimated",
  estimatedTokens: 100,
  providerInputTokens: 120,
  providerContextTokens: 140,
  freeTokens: 127_900,
  categories: [{ id: "messages", tokens: 100, chars: 400 }],
};

function contextWith(runtime?: {
  getContextComposition: () => Promise<ContextCompositionMeasurement | null>;
}) {
  const notify = vi.fn();
  const context = {
    notify,
    sessions: new Map([
      [
        "s1",
        {
          app: { runtime: runtime ?? { getContextComposition: async () => measurement } },
          traceContext: { traceId: "trace-context-composition" },
        },
      ],
    ]),
  } as unknown as Pick<
    KayingCodeProtocolAgentServerContext,
    "contextCompositionTracker" | "notify" | "sessions"
  >;
  return { context, notify };
}

describe("v4 contextComposition handler", () => {
  it("returns the measurement with the current revision and the session id", async () => {
    const { context } = contextWith();
    const tracker = getContextCompositionTracker(context);
    tracker.markChanged("s1");

    const result = await getConversationContextComposition(context, {
      sessionId: "s1",
      modelSelection: { providerId: "zai", modelId: "glm-4.6" },
    });

    expect(result.composition).toMatchObject({
      sessionId: "s1",
      revision: 1,
      phase: "request",
      providerInputTokens: 120,
      model: { providerId: "zai", modelId: "glm-4.6", contextWindow: 128_000 },
    });
  });

  it("returns null for a session that is not in memory without starting a runtime", async () => {
    const getContextComposition = vi.fn(async () => measurement);
    const { context } = contextWith({ getContextComposition });

    const result = await getConversationContextComposition(context, { sessionId: "missing" });

    expect(result).toEqual({ composition: null });
    expect(getContextComposition).not.toHaveBeenCalled();
  });

  it("passes the requested model selection and trace context through", async () => {
    const getContextComposition = vi.fn(async () => measurement);
    const { context } = contextWith({ getContextComposition });

    await getConversationContextComposition(context, {
      sessionId: "s1",
      modelSelection: { providerId: "zai", modelId: "glm-4.6" },
    });

    expect(getContextComposition).toHaveBeenCalledWith({
      modelSelection: { providerId: "zai", modelId: "glm-4.6" },
      traceContext: { traceId: "trace-context-composition" },
    });
  });
});
