import { afterEach, describe, expect, it, vi } from "vitest";
import { kayingcodeProtocolMethods } from "@zcode/shared";
import { V4_METHODS } from "@zcode/shared/kayingcode-protocol-v4";
import type { IKayingCodeAgentService } from "../src/kayingcode-agent/kayingcodeAgent.js";

interface CapturedRequest {
  id: string | number;
  method: string;
  params?: unknown;
}

interface FakeClient {
  isDisposed: boolean;
  request: ReturnType<typeof vi.fn>;
  onNotification: ReturnType<typeof vi.fn>;
  onRequest: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
  respond: ReturnType<typeof vi.fn>;
  respondError: ReturnType<typeof vi.fn>;
}

const host = vi.hoisted(() => {
  const state: {
    clients: FakeClient[];
  } = {
    clients: [],
  };

  const createClient = (): FakeClient => {
    const client: FakeClient = {
      isDisposed: false,
      request: vi.fn(async (method: string, params: Record<string, unknown>) => {
        if (method === kayingcodeProtocolMethods.runtimeCapabilities) {
          return {};
        }
        if (
          method === kayingcodeProtocolMethods.workspaceUpdateInteractionPreferences ||
          method === kayingcodeProtocolMethods.workspaceUpdateModelIoPreferences
        ) {
          return {};
        }
        if (method === V4_METHODS.command) {
          return {
            commandId: params.commandId,
            status: "accepted",
            revisionAtDecision: 0,
          };
        }
        throw new Error(`unexpected protocol method: ${method}`);
      }),
      onNotification: vi.fn(() => ({ dispose: () => undefined })),
      onRequest: vi.fn(() => ({ dispose: () => undefined })),
      onClose: vi.fn(() => ({ dispose: () => undefined })),
      respond: vi.fn(async () => undefined),
      respondError: vi.fn(async () => undefined),
    };
    state.clients.push(client);
    return client;
  };

  class FakeProcessManager {
    // createKayingCodeAgentService 会创建 chat/plugin/mcp-status 三个管理器；
    // 只有第一个（chat）的 client 会 wire 回复语言反向请求。
    private readonly client = createClient();
    getClient = vi.fn(async () => this.client);
    getExistingClient = vi.fn(() => this.client);
    markReady = vi.fn();
    onRuntimeRestarted = vi.fn(() => ({ dispose: () => undefined }));
    onRuntimeLifecycle = vi.fn(() => ({ dispose: () => undefined }));
    onStorageStartupChanged = vi.fn(() => ({ dispose: () => undefined }));
    getStorageStartupState = vi.fn(async () => null);
    getRuntimeIdentity = vi.fn(async () => ({}) as never);
    disposeWorkspace = vi.fn(async () => undefined);
    disposeAll = vi.fn();
    disposeAllAndWait = vi.fn(async () => undefined);
  }

  return { state, FakeProcessManager };
});

vi.mock("../src/kayingcode-agent/kayingcodeAgentProcessManager.js", () => ({
  KayingCodeAgentProcessManager: host.FakeProcessManager,
}));

const { createKayingCodeAgentService } =
  await import("../src/kayingcode-agent/kayingcodeAgentService.js");

const readinessView = {
  revision: 1,
  providers: [
    {
      providerId: "test-provider",
      providerName: "Test Provider",
      config: {},
      models: [{ modelId: "test-model", config: {} }],
    },
  ],
};

function workspace() {
  return { workspacePath: "/tmp/kayingcode-reply-language-test" };
}

function chatClient(): FakeClient {
  const client = host.state.clients[0];
  if (!client) throw new Error("chat protocol client was not created");
  return client;
}

async function createWiredService(options: {
  resolveReplyLanguage?: () => string | null | Promise<string | null>;
}) {
  const service = createKayingCodeAgentService({
    modelSelectionReadinessSource: {
      getView: async () => readinessView as never,
    },
    ...(options.resolveReplyLanguage ? { resolveReplyLanguage: options.resolveReplyLanguage } : {}),
  });
  // 走现有 sendText 命令路径触发 chat client 创建与 wireClient，之后才能拿到 CLI 反向请求 handler。
  await service.sendConversationCommandV4({
    ...workspace(),
    envelope: {
      commandId: "command-1",
      clientId: "client-1",
      sessionId: "session-1",
      type: "sendText",
      payload: { text: "hello" },
    },
  } as never);
  const handlerCall = chatClient().onRequest.mock.calls.at(-1);
  if (!handlerCall) throw new Error("reply language request handler was not wired");
  return { service, handler: handlerCall[0] as (request: CapturedRequest) => void };
}

function replyLanguageRequest(): CapturedRequest {
  return {
    id: "reply-language-request-1",
    method: kayingcodeProtocolMethods.sessionReadReplyLanguage,
    params: { sessionId: "session-1" },
  };
}

async function disposeService(service: unknown): Promise<void> {
  await (
    service as IKayingCodeAgentService & {
      disposeAllAndWait(): Promise<void>;
    }
  ).disposeAllAndWait();
}

describe("Agent reply language request", () => {
  afterEach(() => {
    host.state.clients = [];
  });

  it("answers the injected Host resolver value", async () => {
    const { service, handler } = await createWiredService({
      resolveReplyLanguage: () => "简体中文",
    });
    try {
      handler(replyLanguageRequest());
      const client = chatClient();
      await vi.waitFor(() => expect(client.respond).toHaveBeenCalled());
      expect(client.respond).toHaveBeenCalledWith("reply-language-request-1", {
        language: "简体中文",
      });
      expect(client.respondError).not.toHaveBeenCalled();
    } finally {
      await disposeService(service);
    }
  });

  it("answers null when no resolver is injected", async () => {
    const { service, handler } = await createWiredService({});
    try {
      handler(replyLanguageRequest());
      const client = chatClient();
      await vi.waitFor(() => expect(client.respond).toHaveBeenCalled());
      expect(client.respond).toHaveBeenCalledWith("reply-language-request-1", {
        language: null,
      });
    } finally {
      await disposeService(service);
    }
  });

  it("awaits an asynchronous Setting-backed resolver", async () => {
    const resolver = vi.fn(async () => "English");
    const { service, handler } = await createWiredService({ resolveReplyLanguage: resolver });
    try {
      handler(replyLanguageRequest());
      const client = chatClient();
      await vi.waitFor(() => expect(client.respond).toHaveBeenCalled());
      expect(resolver).toHaveBeenCalledTimes(1);
      expect(client.respond).toHaveBeenCalledWith("reply-language-request-1", {
        language: "English",
      });
    } finally {
      await disposeService(service);
    }
  });

  it("returns null when the asynchronous resolver has no configured language", async () => {
    const { service, handler } = await createWiredService({
      resolveReplyLanguage: async () => null,
    });
    try {
      handler(replyLanguageRequest());
      const client = chatClient();
      await vi.waitFor(() => expect(client.respond).toHaveBeenCalled());
      expect(client.respond).toHaveBeenCalledWith("reply-language-request-1", {
        language: null,
      });
    } finally {
      await disposeService(service);
    }
  });

  it("reports a read failure instead of answering null", async () => {
    const { service, handler } = await createWiredService({
      resolveReplyLanguage: async () => {
        throw new Error("setting.json unreadable");
      },
    });
    try {
      handler(replyLanguageRequest());
      const client = chatClient();
      await vi.waitFor(() => expect(client.respondError).toHaveBeenCalled());
      expect(client.respondError).toHaveBeenCalledWith("reply-language-request-1", {
        code: -32603,
        message: "Reply language unavailable",
      });
      // null 会被 CLI 视为清除公告；读取失败必须走 error。
      expect(client.respond).not.toHaveBeenCalled();
    } finally {
      await disposeService(service);
    }
  });
});
