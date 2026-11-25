// 扩展输入来源（extensionInputSource）能力门禁验收
// （packages/services/spec/conversation-input-source.md）：
// 能力探测只认严格 true、按物理连接缓存、失败不缓存；advertised 时 app-control 的客户端类
// createSession 首条输入带来源，未 advertised 时报 unavailable 且不发命令（来源不出现）。
import { SessionControlError, type AppTrustedContext } from "@zcode/session-control/contracts";
import { kayingcodeProtocolMethods } from "@zcode/shared";
import { describe, expect, it, vi } from "vitest";
import type {
  AppControlClientBinding,
  AppControlServiceDependencies,
} from "#src/app-control/contract.js";
import { appControlBindingKey } from "#src/app-control/context.js";
import { createAppExecutionPorts } from "#src/app-control/execution.js";
import { supportsExtensionInputSource } from "#src/kayingcode-agent/extensionInputSourceSupport.js";

const PLUGIN_ID = "demo@inline";
const SOURCE = { kind: "extension", pluginId: PLUGIN_ID } as const;

function capabilityClient(result: () => Promise<unknown>) {
  const request = vi.fn(result);
  return { client: { request } as never, request };
}

describe("extension input source capability probe", () => {
  it("reports true only when the CLI explicitly advertises the capability", async () => {
    const { client, request } = capabilityClient(async () => ({ extensionInputSource: true }));
    await expect(supportsExtensionInputSource(client)).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      kayingcodeProtocolMethods.runtimeCapabilities,
      {},
      expect.anything(),
    );
  });

  it("reports false when the capability is absent, false or not a boolean", async () => {
    await expect(
      supportsExtensionInputSource(capabilityClient(async () => ({})).client),
    ).resolves.toBe(false);
    await expect(
      supportsExtensionInputSource(
        capabilityClient(async () => ({ extensionInputSource: false })).client,
      ),
    ).resolves.toBe(false);
    await expect(
      supportsExtensionInputSource(
        capabilityClient(async () => ({ extensionInputSource: "true" })).client,
      ),
    ).resolves.toBe(false);
  });

  it("probes once per CLI connection and reuses the result", async () => {
    const { client, request } = capabilityClient(async () => ({ extensionInputSource: true }));

    await expect(supportsExtensionInputSource(client)).resolves.toBe(true);
    await expect(supportsExtensionInputSource(client)).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("fails closed and retries after a probe error", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("proto.methodNotFound"))
      .mockResolvedValueOnce({ extensionInputSource: true });
    const client = { request } as never;

    await expect(supportsExtensionInputSource(client)).resolves.toBe(false);
    await expect(supportsExtensionInputSource(client)).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });
});

function modelView() {
  const optionSpecs = { reasoningLevel: { values: ["low", "medium", "high"] } };
  return {
    revision: 1,
    preferredSelection: {
      providerId: "zai",
      modelId: "glm-4.6",
      options: { reasoningLevel: "medium" },
    },
    providers: [
      {
        providerId: "zai",
        providerName: "Z.ai",
        templateId: "zai",
        config: { optionSpecs },
        models: [{ modelId: "glm-4.6", config: { optionSpecs } }],
      },
    ],
  };
}

/** 客户端类（扩展）上下文：来源由扩展网关写在可信绑定上，不从命令 payload 读取。 */
function extensionContext(supportedSource: boolean) {
  const binding: AppControlClientBinding = {
    kind: "client",
    clientId: `extension:${PLUGIN_ID}`,
    connectionId: `extension-host:1:${PLUGIN_ID}`,
    sourceServerId: "local",
    signal: new AbortController().signal,
    assertCurrent() {},
    ...(supportedSource ? { inputSource: SOURCE } : {}),
  };
  return {
    caller: "client",
    callerId: `local:client:extension:${PLUGIN_ID}`,
    rootSession: null,
    scopes: [{ kind: "app", sourceServerId: "local" }],
    grants: [],
    [appControlBindingKey]: binding,
  } as unknown as AppTrustedContext;
}

function harness(extensionInputSource: boolean | undefined) {
  const dispatched: Array<{ payload: unknown }> = [];
  const agent = {
    sendConversationCommandV4: vi.fn(async (params: { envelope: { payload: unknown } }) => {
      dispatched.push({ payload: params.envelope.payload });
      return {
        commandId: "app-control-test",
        status: "accepted" as const,
        revisionAtDecision: 1,
        result: { type: "createSession" as const, sessionId: "sess_app_1" },
      };
    }),
    ...(extensionInputSource === undefined
      ? {}
      : { supportsExtensionInputSource: vi.fn(async () => extensionInputSource) }),
  };
  const deps = {
    sourceServerId: "local",
    projects: {},
    tasks: {},
    agent,
    models: { getView: async () => modelView() },
    prepareCreation: async () => ({
      workspacePath: "/workspace",
      additionalDirectories: [],
      projectId: "project-1",
    }),
    findCreationReceipts: async () => [],
  } as unknown as AppControlServiceDependencies;
  const context = extensionContext(true);
  const ports = createAppExecutionPorts(
    deps,
    async () => ({}) as never,
    () => ({}) as never,
  );
  const grant = { fence: `extension-host:1:${PLUGIN_ID}` } as never;
  const input = {
    project: { kind: "app" as const, projectId: "project-1" },
    prompt: "扩展发起的第一条消息",
    requestId: "request-1",
  };
  return { ports, context, grant, input, dispatched, agent };
}

describe("extension input source gate", () => {
  it("sends firstInput.source when the CLI advertises extensionInputSource", async () => {
    const { ports, context, grant, input, dispatched, agent } = harness(true);

    await ports.createSession(context, input, grant);

    expect(agent.supportsExtensionInputSource).toHaveBeenCalledWith({
      workspacePath: "/workspace",
    });
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.payload).toMatchObject({
      firstInput: { text: input.prompt, source: SOURCE },
    });
  });

  it("fails closed without a command when the CLI does not advertise the capability", async () => {
    const { ports, context, grant, input, dispatched } = harness(false);

    await expect(ports.createSession(context, input, grant)).rejects.toBeInstanceOf(
      SessionControlError,
    );
    await expect(ports.createSession(context, input, grant)).rejects.toMatchObject({
      code: "unavailable",
    });
    // 不去掉来源后发送：命令根本没有发出，来源不会出现在线缆上。
    expect(dispatched).toHaveLength(0);
  });

  it("fails closed when the runtime has no capability probe at all", async () => {
    const { ports, context, grant, input, dispatched } = harness(undefined);

    await expect(ports.createSession(context, input, grant)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(dispatched).toHaveLength(0);
  });
});
