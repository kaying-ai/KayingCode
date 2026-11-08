import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IPluginManagementService } from "@zcode/services";
import { usePluginManagementStore } from "@/store/pluginManagementStore.js";

function createPluginService() {
  const listPlugins = vi.fn(async () => ({ plugins: [], diagnostics: [] }));
  const getPluginsOverview = vi.fn(async () => ({
    marketplaces: [],
    availablePlugins: [],
    installedPlugins: [],
    restorableBuiltins: [],
    diagnostics: [],
  }));
  const service = { listPlugins, getPluginsOverview } as unknown as IPluginManagementService;
  return { service, listPlugins, getPluginsOverview };
}

beforeEach(() => {
  usePluginManagementStore.setState({
    workspacePath: null,
    workspaceIdentity: null,
    authorityKey: null,
    configScope: null,
    plugins: [],
    marketplaces: [],
    marketplaceAvailabilityKnown: false,
    availablePlugins: [],
    installedPlugins: [],
    restorableBuiltins: [],
    diagnostics: [],
    loading: false,
    error: null,
    lastFailedPluginId: null,
    togglingPluginId: null,
    operationId: null,
    operationVersion: 0,
    describeCache: {},
  });
});

describe("pluginManagementStore authority", () => {
  it("同一锚点路径下切换 authority 会重新加载而不是复用缓存", async () => {
    const { service, listPlugins } = createPluginService();
    await usePluginManagementStore.getState().initialize({
      workspacePath: "/source/anchor",
      configScope: "user",
      pluginService: service,
      authorityKey: "source-settings:a",
    });
    expect(usePluginManagementStore.getState().authorityKey).toBe("source-settings:a");
    expect(listPlugins).toHaveBeenCalledTimes(1);

    await usePluginManagementStore.getState().initialize({
      workspacePath: "/source/anchor",
      configScope: "user",
      pluginService: service,
      authorityKey: "source-settings:b",
    });
    expect(usePluginManagementStore.getState().authorityKey).toBe("source-settings:b");
    expect(listPlugins).toHaveBeenCalledTimes(2);
  });

  it("缺省 authority 保持原有上下文键", async () => {
    const { service } = createPluginService();
    await usePluginManagementStore.getState().initialize({
      workspacePath: "/repo",
      workspaceIdentity: "remote:server:x:/",
      configScope: "user",
      pluginService: service,
    });
    expect(usePluginManagementStore.getState().authorityKey).toBeNull();
  });
});
