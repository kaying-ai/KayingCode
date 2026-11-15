import { describe, expect, it, vi } from "vitest";
import { V4_METHODS, V4_NOTIFICATIONS } from "@zcode/shared/kayingcode-protocol-v4";
import { createContextCompositionClient } from "../src/kayingcode-agent/contextCompositionClient.js";

const workspace = { workspacePath: "C:\\workspace" };

function composition() {
  return {
    sessionId: "s1",
    revision: 3,
    phase: "request" as const,
    measuredAt: 1_700_000_000_000,
    model: { providerId: "zai", modelId: "glm-4.6", contextWindow: 128_000 },
    tokenMethod: "estimated" as const,
    estimatedTokens: 10,
    freeTokens: 127_990,
    categories: [],
  };
}

function setup(
  options: { request?: (method: string) => Promise<unknown>; existingError?: unknown } = {},
) {
  const logger = { debug: vi.fn() };
  const client = {
    request: vi.fn(options.request ?? (async () => ({ composition: composition() }))),
  };
  const getExistingClient = vi.fn(async () => {
    if (options.existingError) throw options.existingError;
    return client;
  });
  const compositionClient = createContextCompositionClient({
    getExistingClient: getExistingClient as never,
    isRuntimeUnavailableError: (error) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "RUNTIME_UNAVAILABLE",
    resolveWorkspaceKey: () => "workspace-key",
    logger,
  });
  return { client, compositionClient, logger };
}

describe("context composition client", () => {
  it("queries the v4 method and returns the composition", async () => {
    const { client, compositionClient } = setup();

    await expect(
      compositionClient.getContextComposition({
        ...workspace,
        sessionId: "s1",
        modelSelection: { providerId: "zai", modelId: "glm-4.6" },
      }),
    ).resolves.toMatchObject({ sessionId: "s1", revision: 3 });

    expect(client.request).toHaveBeenCalledWith(
      V4_METHODS.conversationContextComposition,
      { sessionId: "s1", modelSelection: { providerId: "zai", modelId: "glm-4.6" } },
      expect.anything(),
    );
  });

  it("returns null when no runtime is running instead of starting one", async () => {
    const { compositionClient } = setup({ existingError: { code: "RUNTIME_UNAVAILABLE" } });

    await expect(
      compositionClient.getContextComposition({ ...workspace, sessionId: "s1" }),
    ).resolves.toBeNull();
  });

  it("returns null when the CLI does not know the method", async () => {
    const { compositionClient } = setup({
      request: async () => {
        throw { code: -32601 };
      },
    });

    await expect(
      compositionClient.getContextComposition({ ...workspace, sessionId: "s1" }),
    ).resolves.toBeNull();
  });

  it("propagates other errors", async () => {
    const { compositionClient } = setup({
      request: async () => {
        throw new Error("boom");
      },
    });

    await expect(
      compositionClient.getContextComposition({ ...workspace, sessionId: "s1" }),
    ).rejects.toThrow("boom");
  });

  it("routes change notifications and drops invalid payloads", () => {
    const { compositionClient, logger } = setup();
    const listener = vi.fn();
    compositionClient.onDidChange(workspace)(listener);

    expect(
      compositionClient.handleNotification(workspace, {
        method: V4_NOTIFICATIONS.conversationContextCompositionChanged,
        params: { sessionId: "s1", revision: 4 },
      }),
    ).toBe(true);
    expect(listener).toHaveBeenCalledWith({ sessionId: "s1", revision: 4 });

    expect(
      compositionClient.handleNotification(workspace, {
        method: V4_NOTIFICATIONS.conversationContextCompositionChanged,
        params: { sessionId: "" },
      }),
    ).toBe(true);
    expect(logger.debug).toHaveBeenCalled();
    expect(compositionClient.handleNotification(workspace, { method: "other" })).toBe(false);
  });
});
