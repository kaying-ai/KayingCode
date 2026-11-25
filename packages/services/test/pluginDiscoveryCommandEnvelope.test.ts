import { afterEach, describe, expect, it, vi } from "vitest";
import { kayingcodeProtocolMethods } from "@zcode/shared";
import { V4_METHODS } from "@zcode/shared/kayingcode-protocol-v4";
import type { IKayingCodeAgentService } from "../src/kayingcode-agent/kayingcodeAgent.js";
import { withTrustedConnection } from "../src/kayingcode-agent/kayingcodeAgentConnectionScope.js";

const host = vi.hoisted(() => {
  const state: {
    capabilities: { pluginDiscoveryUi?: boolean };
    capabilityError: Error | undefined;
    capabilityCalls: number;
    commandEnvelopes: Array<Record<string, unknown>>;
  } = {
    capabilities: {},
    capabilityError: undefined,
    capabilityCalls: 0,
    commandEnvelopes: [],
  };

  // 能力探测按 client 缓存，测试必须为每个 service 实例提供新的 client，
  // 否则前一个用例的探测结果会跨用例泄漏。
  const createClient = () => ({
    isDisposed: false,
    request: vi.fn(async (method: string, params: Record<string, unknown>) => {
      if (method === kayingcodeProtocolMethods.runtimeCapabilities) {
        state.capabilityCalls += 1;
        if (state.capabilityError) throw state.capabilityError;
        return state.capabilities;
      }
      if (method === V4_METHODS.command) {
        state.commandEnvelopes.push(params);
        return {
          commandId: params.commandId,
          status: "accepted",
          revisionAtDecision: 0,
        };
      }
      if (
        method === kayingcodeProtocolMethods.workspaceUpdateInteractionPreferences ||
        method === kayingcodeProtocolMethods.workspaceUpdateModelIoPreferences
      ) {
        return {};
      }
      throw new Error(`unexpected protocol method: ${method}`);
    }),
    onNotification: vi.fn(() => ({ dispose: () => undefined })),
    onRequest: vi.fn(() => ({ dispose: () => undefined })),
    onClose: vi.fn(() => ({ dispose: () => undefined })),
    respond: vi.fn(async () => undefined),
    respondError: vi.fn(async () => undefined),
  });

  class FakeProcessManager {
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

function createService() {
  return createKayingCodeAgentService({
    modelSelectionReadinessSource: {
      getView: async () => readinessView as never,
    },
  });
}

function workspace() {
  return { workspacePath: "/tmp/kayingcode-plugin-discovery-test" };
}

function commandParams(envelope: Record<string, unknown>, trusted: boolean) {
  const params = { ...workspace(), envelope };
  return trusted
    ? withTrustedConnection(params, {
        connectionId: "conn-plugin-discovery",
        clientMode: "desktop-continuous",
        pluginDiscoveryUi: true,
      })
    : params;
}

function sendTextEnvelope(extra?: Record<string, unknown>) {
  return {
    commandId: "command-1",
    clientId: "client-1",
    sessionId: "session-1",
    type: "sendText",
    payload: { text: "hello" },
    ...extra,
  };
}

describe("plugin discovery UI command envelope", () => {
  afterEach(() => {
    host.state.capabilities = {};
    host.state.capabilityError = undefined;
    host.state.capabilityCalls = 0;
    host.state.commandEnvelopes = [];
  });

  async function runCommand(params: unknown) {
    const service = createService() as IKayingCodeAgentService & {
      disposeAllAndWait(): Promise<void>;
    };
    try {
      await service.syncAppRuntimePreferences({
        askUserQuestionAutoResolutionEnabled: false,
        pluginAutoRecommendationEnabled: true,
      });
      await service.sendConversationCommandV4(params as never);
      expect(host.state.commandEnvelopes).toHaveLength(1);
      return host.state.commandEnvelopes[0]!;
    } finally {
      await service.disposeAllAndWait();
    }
  }

  it("injects the trusted capability for a capable CLI when the preference is on", async () => {
    host.state.capabilities = { pluginDiscoveryUi: true };

    const envelope = await runCommand(commandParams(sendTextEnvelope(), true));

    expect(envelope.pluginDiscoveryUi).toBe(true);
  });

  it("does not inject when the CLI does not advertise the capability", async () => {
    host.state.capabilities = {};

    const envelope = await runCommand(commandParams(sendTextEnvelope(), true));

    expect(envelope.pluginDiscoveryUi).toBeUndefined();
    expect(host.state.capabilityCalls).toBe(1);
  });

  it("does not inject when the capability probe fails", async () => {
    host.state.capabilityError = new Error("proto.methodNotFound");

    const envelope = await runCommand(commandParams(sendTextEnvelope(), true));

    expect(envelope.pluginDiscoveryUi).toBeUndefined();
  });

  it("strips a UI-supplied field when the trusted connection does not declare it", async () => {
    host.state.capabilities = { pluginDiscoveryUi: true };

    const envelope = await runCommand(
      commandParams(sendTextEnvelope({ pluginDiscoveryUi: true }), false),
    );

    expect(envelope.pluginDiscoveryUi).toBeUndefined();
    expect(host.state.capabilityCalls).toBe(0);
  });

  it("keeps the field off ordinary input when the preference is disabled", async () => {
    host.state.capabilities = { pluginDiscoveryUi: true };
    const service = createService();
    try {
      await service.syncAppRuntimePreferences({
        askUserQuestionAutoResolutionEnabled: false,
        pluginAutoRecommendationEnabled: false,
      });
      await service.sendConversationCommandV4(commandParams(sendTextEnvelope(), true) as never);
      expect(host.state.commandEnvelopes[0]?.pluginDiscoveryUi).toBeUndefined();
    } finally {
      await service.disposeAllAndWait();
    }
  });

  it("still forwards for resolveInteraction so existing cards can be completed", async () => {
    host.state.capabilities = { pluginDiscoveryUi: true };
    const service = createService();
    try {
      await service.syncAppRuntimePreferences({
        askUserQuestionAutoResolutionEnabled: false,
        pluginAutoRecommendationEnabled: false,
      });
      await service.sendConversationCommandV4(
        commandParams(
          {
            commandId: "command-2",
            clientId: "client-1",
            sessionId: "session-1",
            type: "resolveInteraction",
            payload: {},
          },
          true,
        ) as never,
      );
      expect(host.state.commandEnvelopes[0]?.pluginDiscoveryUi).toBe(true);
    } finally {
      await service.disposeAllAndWait();
    }
  });
});
