import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { kayingcodeProtocolMethods } from "@zcode/shared";
import { supportsPluginExtensionSummary } from "../src/kayingcode-agent/independentPlanSupport.js";
import { getDataBaseDir, setDataBaseDir } from "../src/paths.js";

// 扩展摘要能力门禁（packages/services/spec/plugin-extension-summary.md）：参数与结果都是 strict，
// 只有 CLI 在 runtime/capabilities 明确声明 pluginExtensionSummary: true 时才发送 includeExtensionSummary。
const host = vi.hoisted(() => {
  const state: {
    capabilities: Record<string, unknown>;
    capabilityError: Error | undefined;
    capabilityCalls: number;
    overviewParams: Array<Record<string, unknown>>;
  } = {
    capabilities: {},
    capabilityError: undefined,
    capabilityCalls: 0,
    overviewParams: [],
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
      if (method === kayingcodeProtocolMethods.pluginsOverview) {
        state.overviewParams.push(params);
        return {
          marketplaces: [],
          availablePlugins: [],
          installedPlugins: [],
          restorableBuiltins: [],
          diagnostics: [],
          capability: { supported: true },
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

function capabilityClient(result: () => Promise<unknown>) {
  const request = vi.fn(result);
  return { client: { request } as never, request };
}

describe("plugin extension summary capability probe", () => {
  it("reports true only when the CLI explicitly advertises the capability", async () => {
    const { client, request } = capabilityClient(async () => ({ pluginExtensionSummary: true }));
    await expect(supportsPluginExtensionSummary(client)).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      kayingcodeProtocolMethods.runtimeCapabilities,
      {},
      expect.anything(),
    );
  });

  it("reports false when the capability is absent, false or not a boolean", async () => {
    await expect(
      supportsPluginExtensionSummary(capabilityClient(async () => ({})).client),
    ).resolves.toBe(false);
    await expect(
      supportsPluginExtensionSummary(
        capabilityClient(async () => ({ pluginExtensionSummary: false })).client,
      ),
    ).resolves.toBe(false);
    await expect(
      supportsPluginExtensionSummary(
        capabilityClient(async () => ({ pluginExtensionSummary: "true" })).client,
      ),
    ).resolves.toBe(false);
  });

  it("probes once per CLI connection and reuses the result", async () => {
    const { client, request } = capabilityClient(async () => ({ pluginExtensionSummary: true }));

    await expect(supportsPluginExtensionSummary(client)).resolves.toBe(true);
    await expect(supportsPluginExtensionSummary(client)).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("fails closed and retries after a probe error", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("proto.methodNotFound"))
      .mockResolvedValueOnce({ pluginExtensionSummary: true });
    const client = { request } as never;

    await expect(supportsPluginExtensionSummary(client)).resolves.toBe(false);
    await expect(supportsPluginExtensionSummary(client)).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe("plugins/overview extension summary gate", () => {
  let previousBaseDir: string;
  let tempRoot = "";

  beforeEach(async () => {
    previousBaseDir = getDataBaseDir();
    tempRoot = await mkdtemp(join(tmpdir(), "kayingcode-plugin-extension-summary-"));
    setDataBaseDir(tempRoot);
    host.state.capabilities = {};
    host.state.capabilityError = undefined;
    host.state.capabilityCalls = 0;
    host.state.overviewParams = [];
  });

  afterEach(async () => {
    setDataBaseDir(previousBaseDir);
    host.state.capabilities = {};
    host.state.capabilityError = undefined;
    host.state.capabilityCalls = 0;
    host.state.overviewParams = [];
    await rm(tempRoot, { force: true, recursive: true });
  });

  async function runOverview() {
    const service = createKayingCodeAgentService({
      modelSelectionReadinessSource: {
        getView: async () => readinessView as never,
      },
    }) as ReturnType<typeof createKayingCodeAgentService> & {
      disposeAllAndWait(): Promise<void>;
    };
    try {
      await service.getPluginsOverview({ workspacePath: tempRoot, workspaceKey: tempRoot });
      expect(host.state.overviewParams).toHaveLength(1);
      return host.state.overviewParams[0]!;
    } finally {
      await service.disposeAllAndWait();
    }
  }

  it("sends includeExtensionSummary only when the CLI advertises the capability", async () => {
    host.state.capabilities = { pluginExtensionSummary: true };

    const params = await runOverview();

    expect(params.includeExtensionSummary).toBe(true);
    expect(params.workspace).toMatchObject({ workspacePath: expect.any(String) });
  });

  it("omits the parameter for an old CLI that does not advertise it", async () => {
    host.state.capabilities = {};

    const params = await runOverview();

    expect(params).not.toHaveProperty("includeExtensionSummary");
    expect(host.state.capabilityCalls).toBe(1);
  });

  it("still returns the overview without the parameter when the probe fails", async () => {
    host.state.capabilityError = new Error("proto.methodNotFound");

    const params = await runOverview();

    expect(params).not.toHaveProperty("includeExtensionSummary");
    expect(host.state.capabilityCalls).toBe(1);
  });
});
