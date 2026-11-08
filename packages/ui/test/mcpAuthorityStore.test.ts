import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeMcpServerRecord, SaveCliMcpToUserDirectoryRequest } from "@zcode/shared";
import { createMcpStore, setMcpStorePlatform } from "@/store/mcpStore.js";
import type { McpDirectoryService, McpPlatformService } from "@/store/mcpStoreDesktop.js";

function createDirectoryService(servers: NativeMcpServerRecord[] = []) {
  const loadMcpFromUserDirectory = vi.fn(async () => ({ servers }));
  const saveMcpToUserDirectory = vi.fn(async (_payload: SaveCliMcpToUserDirectoryRequest) => true);
  const service = {
    loadMcpFromUserDirectory,
    saveMcpToUserDirectory,
  } as unknown as McpDirectoryService;
  return { service, loadMcpFromUserDirectory, saveMcpToUserDirectory };
}

function createPlatform() {
  const loadMcpFromUserDirectory = vi.fn(async () => ({ servers: [] }));
  const saveMcpToUserDirectory = vi.fn(async () => ({ success: true }));
  const migrateLegacyCommonMcp = vi.fn(async () => ({
    servers: {},
    totalCount: 0,
    importedCount: 0,
    skippedCount: 0,
  }));
  const platform = {
    loadMcpFromUserDirectory,
    saveMcpToUserDirectory,
    migrateLegacyCommonMcp,
  } as unknown as McpPlatformService;
  return { platform, loadMcpFromUserDirectory, saveMcpToUserDirectory };
}

function userServer(name: string): NativeMcpServerRecord {
  return {
    source: "kayingcodeagentmcp",
    scope: "user",
    name,
    config: { command: "node", args: [`${name}.js`] },
    enabled: true,
  };
}

beforeEach(() => {
  // mcpStore 的目录读取以 window 存在为前提；node 测试环境用最小 localStorage 代替。
  vi.stubGlobal("window", {});
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  });
});

afterEach(() => {
  setMcpStorePlatform(null);
  vi.unstubAllGlobals();
});

describe("mcpStore authority 分区", () => {
  it("authority store 的读取与写入全部走 Source directoryService", async () => {
    const { platform, saveMcpToUserDirectory: platformSave } = createPlatform();
    setMcpStorePlatform(platform);
    const source = createDirectoryService([userServer("source-server")]);
    const store = createMcpStore({ authority: true });
    store.getState().setDirectoryService(source.service);

    const loaded = await store
      .getState()
      .ensureLoadedForWorkspace("/source/anchor", source.service, undefined);
    expect(loaded).toBe(true);
    expect(source.loadMcpFromUserDirectory).toHaveBeenCalledWith({
      workspacePath: "/source/anchor",
    });
    expect(platform.loadMcpFromUserDirectory).not.toHaveBeenCalled();
    expect(store.getState().servers.map((server) => server.name)).toEqual(["source-server"]);

    const added = await store
      .getState()
      .addScopedMcpServer("kayingcodeagentmcp", "added", { command: "node", args: ["a.js"] });
    expect(added).toBe(true);
    expect(source.saveMcpToUserDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ action: "upsert", name: "added" }),
    );
    expect(platformSave).not.toHaveBeenCalled();

    const addedServer = store.getState().servers.find((server) => server.name === "added");
    expect(addedServer).toBeTruthy();
    const toggled = await store.getState().toggleServer(addedServer!.id, false);
    expect(toggled).toBe(true);
    expect(source.saveMcpToUserDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ action: "set-enabled", name: "added", enabled: false }),
    );

    const deleted = await store
      .getState()
      .deleteScopedMcpServer("kayingcodeagentmcp", "added", undefined);
    expect(deleted).toBe(true);
    expect(source.saveMcpToUserDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ action: "delete", name: "added" }),
    );
    expect(store.getState().servers.some((server) => server.name === "added")).toBe(false);
  });

  it("authority store 缺目录服务时拒绝写入且不改本地投影", async () => {
    const { platform, saveMcpToUserDirectory: platformSave } = createPlatform();
    setMcpStorePlatform(platform);
    const store = createMcpStore({ authority: true });

    const persisted = await store
      .getState()
      .addScopedMcpServer("kayingcodeagentmcp", "blocked", { command: "node" });
    expect(persisted).toBe(false);
    expect(platformSave).not.toHaveBeenCalled();
    expect(store.getState().servers).toEqual([]);
  });

  it("authority store 与活动 workspace 默认 store 相互隔离", async () => {
    const { platform } = createPlatform();
    setMcpStorePlatform(platform);
    const workspaceService = createDirectoryService([userServer("workspace-server")]);
    const sourceService = createDirectoryService([userServer("source-server")]);
    const workspaceStore = createMcpStore();
    const sourceStore = createMcpStore({ authority: true });
    workspaceStore.getState().setDirectoryService(workspaceService.service);
    sourceStore.getState().setDirectoryService(sourceService.service);

    await workspaceStore
      .getState()
      .ensureLoadedForWorkspace("/remote/ws", workspaceService.service, "remote:server:x:/");
    await sourceStore
      .getState()
      .ensureLoadedForWorkspace("/source/anchor", sourceService.service, undefined);

    expect(workspaceStore.getState().servers.map((server) => server.name)).toEqual([
      "workspace-server",
    ]);
    expect(sourceStore.getState().servers.map((server) => server.name)).toEqual(["source-server"]);

    await sourceStore
      .getState()
      .addScopedMcpServer("kayingcodeagentmcp", "source-only", { command: "node" });
    expect(workspaceStore.getState().servers.some((server) => server.name === "source-only")).toBe(
      false,
    );
    expect(
      workspaceStore
        .getState()
        .getEnabledMcpServersForKayingCode("kayingcode")
        .map((server) => server.name),
    ).toEqual(["workspace-server"]);
    expect(
      sourceStore
        .getState()
        .getEnabledMcpServersForKayingCode("kayingcode")
        .map((server) => server.name),
    ).toEqual(["source-server", "source-only"]);
  });
});
