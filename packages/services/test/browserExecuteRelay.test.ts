// 回归：Host 中继 interaction/browserExecute 时必须原样透传 controlScopeId。
// 丢失后 Main 会以 "Browser control scope is required" 拒绝 openScope，标签控制整体不可用。
import { afterEach, describe, expect, it, vi } from "vitest";
import { kayingcodeProtocolMethods } from "@zcode/shared";
import { V4_METHODS } from "@zcode/shared/kayingcode-protocol-v4";
import type { BrowserAmbientContextExecutor } from "../src/kayingcode-agent/kayingcodeAgentBrowserAmbientContext.js";
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
  const state: { clients: FakeClient[] } = { clients: [] };

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
        if (method === kayingcodeProtocolMethods.interactionBrowserList) {
          return { browsers: [] };
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
    // createKayingCodeAgentService 会创建 chat/plugin/mcp-status 三个管理器；三者共用同一客户端。
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
  return { workspacePath: "/tmp/kayingcode-browser-relay-test" };
}

function chatClient(): FakeClient {
  const client = host.state.clients[0];
  if (!client) throw new Error("chat protocol client was not created");
  return client;
}

async function createWiredService(executor?: BrowserAmbientContextExecutor) {
  const service = createKayingCodeAgentService({
    modelSelectionReadinessSource: { getView: async () => readinessView as never },
    ...(executor ? { browserControlExecutor: executor } : {}),
  });
  // 走现有 sendText 命令路径触发 chat client 创建与 wireClient，之后才能拿到反向请求 handler。
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
  if (!handlerCall) throw new Error("browser execute request handler was not wired");
  return { service, handler: handlerCall[0] as (request: CapturedRequest) => void };
}

function browserExecuteRequest(input: {
  command: Record<string, unknown>;
  controlScopeId?: string;
}) {
  return {
    id: "browser-execute-request-1",
    method: kayingcodeProtocolMethods.interactionBrowserExecute,
    params: {
      requestId: "browser-request-1",
      sessionId: "session-1",
      workspaceKey: "/tmp/workspace",
      workspacePath: "/tmp/workspace",
      clientMode: "desktop-continuous",
      sessionContext: "live",
      ...(input.controlScopeId ? { controlScopeId: input.controlScopeId } : {}),
      command: input.command,
    },
  } satisfies CapturedRequest;
}

async function disposeService(service: unknown): Promise<void> {
  await (
    service as IKayingCodeAgentService & {
      disposeAllAndWait(): Promise<void>;
    }
  ).disposeAllAndWait();
}

describe("browserExecute relay", () => {
  afterEach(() => {
    host.state.clients = [];
  });

  it("原样透传 controlScopeId 与命令到 executor", async () => {
    const execute = vi.fn(async () => ({ ok: true, elapsedMs: 0 }));
    const executor: BrowserAmbientContextExecutor = {
      list: async () => [],
      execute,
    };
    const { service, handler } = await createWiredService(executor);
    try {
      handler(browserExecuteRequest({ controlScopeId: "scope-1", command: { method: "list" } }));
      await vi.waitFor(() => expect(execute).toHaveBeenCalled());
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          controlScopeId: "scope-1",
          command: { method: "list" },
          sessionId: "session-1",
          workspaceKey: "/tmp/workspace",
        }),
      );
      expect(chatClient().respond).toHaveBeenCalledWith("browser-execute-request-1", {
        ok: true,
        elapsedMs: 0,
      });
    } finally {
      await disposeService(service);
    }
  });

  it("缺少 executor 时 openScope 返回同一 id 的 rejected 作用域", async () => {
    const { service, handler } = await createWiredService();
    try {
      handler(
        browserExecuteRequest({ controlScopeId: "scope-2", command: { method: "openScope" } }),
      );
      await vi.waitFor(() => expect(chatClient().respond).toHaveBeenCalled());
      expect(chatClient().respond).toHaveBeenCalledWith("browser-execute-request-1", {
        scope: { id: "scope-2", state: "rejected" },
        ok: false,
        error: { code: "backend_unavailable", message: "browser control not available" },
        elapsedMs: 0,
      });
    } finally {
      await disposeService(service);
    }
  });

  it("缺少 executor 的非 openScope 命令不伪造 scope 字段", async () => {
    const { service, handler } = await createWiredService();
    try {
      handler(browserExecuteRequest({ controlScopeId: "scope-3", command: { method: "list" } }));
      await vi.waitFor(() => expect(chatClient().respond).toHaveBeenCalled());
      const payload = chatClient().respond.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(payload).toMatchObject({
        ok: false,
        error: { code: "backend_unavailable", message: "browser control not available" },
      });
      expect(payload).not.toHaveProperty("scope");
    } finally {
      await disposeService(service);
    }
  });
});
