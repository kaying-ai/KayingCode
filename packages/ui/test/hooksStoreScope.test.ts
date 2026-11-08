import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Hook } from "@zcode/shared";
import type { IHooksService } from "@zcode/services";
import { useHooksStore } from "@/store/hooksStore.js";

function createFakeHooksService(hooks: Hook[] = []) {
  const loadHooks = vi.fn(async () => ({ hooks, hooksEnabled: true }));
  const saveHooks = vi.fn(async () => undefined);
  const service = { loadHooks, saveHooks } as unknown as IHooksService;
  return { service, loadHooks, saveHooks };
}

beforeEach(() => {
  useHooksStore.setState({
    workspacePath: null,
    workspaceIdentity: null,
    scope: "all",
    loadedWorkspaceKey: null,
    hooks: [],
    loading: false,
    error: null,
    operatingHookId: null,
  });
});

describe("hooks store source user scope", () => {
  it("scope=user 时把 user-only 合同传给 Host", async () => {
    const { service, loadHooks } = createFakeHooksService();
    await useHooksStore.getState().initialize("/source-anchor", undefined, service, "user");
    expect(loadHooks).toHaveBeenCalledWith({
      workspacePath: "/source-anchor",
      scope: "user",
    });
  });

  it("缺省 scope 保持原有 workspace+user 合并语义（不传 scope 字段）", async () => {
    const { service, loadHooks } = createFakeHooksService();
    await useHooksStore.getState().initialize("/repo", undefined, service);
    expect(loadHooks).toHaveBeenCalledWith({ workspacePath: "/repo" });
  });

  it("同一路径切换 scope 视为不同投影，必须重新读取", async () => {
    const { service, loadHooks } = createFakeHooksService();
    await useHooksStore.getState().initialize("/same-path", undefined, service);
    await useHooksStore.getState().initialize("/same-path", undefined, service, "user");
    expect(loadHooks).toHaveBeenCalledTimes(2);
    expect(useHooksStore.getState().scope).toBe("user");
  });

  it("scope=user 的写入不会带上项目路径语义", async () => {
    const { service, saveHooks } = createFakeHooksService();
    await useHooksStore.getState().initialize("/source-anchor", undefined, service, "user");
    await useHooksStore.getState().addHook(
      { event: "SessionStart", type: "command", command: "echo hi" },
      service,
    );
    expect(saveHooks).toHaveBeenCalledWith(
      expect.objectContaining({ workspacePath: "/source-anchor", scope: "user" }),
    );
  });
});
