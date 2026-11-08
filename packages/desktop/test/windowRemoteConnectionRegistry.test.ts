import { describe, expect, it, vi } from "vitest";
import type { WorkspaceConnectionTarget } from "@zcode/shared";
import {
  createWindowRemoteConnectionRegistry,
  type WindowRemoteConnectionCloseEvent,
  type WindowRemoteConnectionHandle,
} from "../src/host/windowRemoteConnectionRegistry.js";

interface FakeServices {
  id: string;
}

interface FakeCapabilities {
  sourceServerId?: string;
  persistentSourceConnection?: boolean;
}

interface FakeHandle extends WindowRemoteConnectionHandle<FakeServices, FakeCapabilities> {
  emitClose(event: WindowRemoteConnectionCloseEvent): void;
  emitReconnect(): void;
}

function createFakeHandle(input: {
  serviceId: string;
  sourceServerId?: string;
  persistent?: boolean;
}): FakeHandle {
  const closeListeners = new Set<(event: WindowRemoteConnectionCloseEvent) => void>();
  const reconnectListeners = new Set<() => void>();
  return {
    services: { id: input.serviceId },
    capabilities: {
      ...(input.sourceServerId ? { sourceServerId: input.sourceServerId } : {}),
      ...(input.persistent ? { persistentSourceConnection: true } : {}),
    },
    dispose: vi.fn(async () => undefined),
    onDidClose(listener) {
      closeListeners.add(listener);
      return { dispose: () => closeListeners.delete(listener) };
    },
    onDidReconnect(listener) {
      reconnectListeners.add(listener);
      return { dispose: () => reconnectListeners.delete(listener) };
    },
    emitClose(event) {
      for (const listener of closeListeners) listener(event);
    },
    emitReconnect() {
      for (const listener of reconnectListeners) listener();
    },
  };
}

function createIds(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}-${(next += 1)}`;
}

const sshTarget: WorkspaceConnectionTarget = {
  kind: "ssh",
  host: "127.0.0.1",
  username: "tester",
  port: 2222,
};

describe("windowRemoteConnectionRegistry Source 等价适配", () => {
  it("回填握手 serverId 并可按身份解析在线 Source，终态断开后 fail-closed", async () => {
    const handle = createFakeHandle({ serviceId: "svc-1", sourceServerId: "source-1" });
    const closed: string[] = [];
    const registry = createWindowRemoteConnectionRegistry<FakeServices, FakeCapabilities>({
      connect: async (request) => {
        expect(request.target).toEqual(sshTarget);
        return handle;
      },
      createId: createIds("session"),
      resolveSourceServerId: (current) => current.capabilities?.sourceServerId,
      onSessionClosed: (event) => closed.push(event.remoteSessionId),
    });

    const descriptor = await registry.connect({
      requestId: "request-1",
      target: sshTarget,
      remoteAssets: {},
    });
    expect(descriptor.sourceServerId).toBe("source-1");
    expect(registry.getOnlineSource("source-1")?.services).toBe(handle.services);
    expect(registry.getSession(descriptor.remoteSessionId)?.sourceServerId).toBe("source-1");

    handle.emitClose({ exitCode: 1, signal: null, error: "link lost" });
    expect(registry.getOnlineSource("source-1")).toBeUndefined();
    expect(closed).toEqual([descriptor.remoteSessionId]);
    expect(registry.getSession(descriptor.remoteSessionId)?.sourceAvailability).toBe("offline");

    await registry.dispose();
  });

  it("常驻 Source 断开时保留物理 owner，关闭 last logical session 只释放 wrapper", async () => {
    const handle = createFakeHandle({
      serviceId: "svc-2",
      sourceServerId: "source-2",
      persistent: true,
    });
    const registry = createWindowRemoteConnectionRegistry<FakeServices, FakeCapabilities>({
      connect: async () => handle,
      createId: createIds("session"),
      resolveSourceServerId: (current) => current.capabilities?.sourceServerId,
      shouldKeepConnectionAlive: (current) =>
        current.capabilities?.persistentSourceConnection === true,
    });

    const descriptor = await registry.connect({
      requestId: "request-2",
      target: sshTarget,
      remoteAssets: {},
    });
    await registry.disposeSession(descriptor.remoteSessionId);
    // 只释放 registry wrapper；物理 Source 由 Manager 持有，不能因关 tab 断开。
    expect(handle.dispose).toHaveBeenCalledTimes(1);
    expect(registry.getOnlineSource("source-2")).toBeUndefined();

    await registry.dispose();
  });

  it("物理重连后为离线 session 发布新 id，并由 onSessionReconnected 提交", async () => {
    const closeListeners = new Set<(event: WindowRemoteConnectionCloseEvent) => void>();
    const reconnectListeners = new Set<() => void>();
    // index 的 handle 在重连时是同一个对象，services 通过 getter 切到新代。
    let services: FakeServices = { id: "svc-3a" };
    const handle: FakeHandle = {
      get services() {
        return services;
      },
      capabilities: { sourceServerId: "source-3", persistentSourceConnection: true },
      dispose: vi.fn(async () => undefined),
      onDidClose(listener) {
        closeListeners.add(listener);
        return { dispose: () => closeListeners.delete(listener) };
      },
      onDidReconnect(listener) {
        reconnectListeners.add(listener);
        return { dispose: () => reconnectListeners.delete(listener) };
      },
      emitClose(event) {
        for (const listener of closeListeners) listener(event);
      },
      emitReconnect() {
        for (const listener of reconnectListeners) listener();
      },
    };
    const reconnects: Array<{ previous: string; current: string; serviceId: string }> = [];
    const registry = createWindowRemoteConnectionRegistry<FakeServices, FakeCapabilities>({
      connect: async () => handle,
      createId: createIds("session"),
      resolveSourceServerId: (current) => current.capabilities?.sourceServerId,
      shouldKeepConnectionAlive: (current) =>
        current.capabilities?.persistentSourceConnection === true,
      onSessionReconnected: ({ previous, current, services: currentServices, commit }) => {
        reconnects.push({
          previous: previous.remoteSessionId,
          current: current.remoteSessionId,
          serviceId: currentServices.id,
        });
        commit();
      },
    });

    const descriptor = await registry.connect({
      requestId: "request-3",
      target: sshTarget,
      remoteAssets: {},
    });
    handle.emitClose({ exitCode: null, signal: null, recoverable: true, recoveryAttempt: 1 });
    expect(registry.getSession(descriptor.remoteSessionId)?.sourceAvailability).toBe("offline");

    // Manager 换代：index 会把 services/capabilities 切到新代后触发 reconnect。
    services = { id: "svc-3b" };
    handle.emitReconnect();
    await vi.waitFor(() => {
      expect(reconnects).toHaveLength(1);
    });
    expect(reconnects[0]).toEqual({
      previous: descriptor.remoteSessionId,
      current: expect.any(String),
      serviceId: "svc-3b",
    });
    expect(reconnects[0]!.current).not.toBe(descriptor.remoteSessionId);
    const replacement = registry.getSession(reconnects[0]!.current);
    expect(replacement?.state).toBe("online");
    expect(replacement?.sourceAvailability).toBe("online");
    expect(registry.getSession(descriptor.remoteSessionId)).toBeNull();
    expect(registry.getOnlineSource("source-3")?.services.id).toBe("svc-3b");

    await registry.dispose();
  });

  it("透传 confirmSourceServerInstall 给部署链路", async () => {
    const requests: Array<{ confirmSourceServerInstall?: boolean }> = [];
    const registry = createWindowRemoteConnectionRegistry<FakeServices, FakeCapabilities>({
      connect: async (request) => {
        requests.push(
          request.confirmSourceServerInstall
            ? { confirmSourceServerInstall: request.confirmSourceServerInstall }
            : {},
        );
        return createFakeHandle({ serviceId: "svc-4" });
      },
      createId: createIds("session"),
    });

    await registry.connect({
      requestId: "request-4",
      target: sshTarget,
      remoteAssets: {},
      confirmSourceServerInstall: true,
    });
    expect(requests).toEqual([{ confirmSourceServerInstall: true }]);

    await registry.dispose();
  });

  it("为受管 Source 首连补稳定 workspace identity", async () => {
    const handle = createFakeHandle({ serviceId: "svc-5", sourceServerId: "source-5" });
    const registry = createWindowRemoteConnectionRegistry<FakeServices, FakeCapabilities>({
      connect: async () => handle,
      createId: createIds("session"),
      resolveSourceServerId: (current) => current.capabilities?.sourceServerId,
    });

    const descriptor = await registry.connect({
      requestId: "request-5",
      target: { kind: "server", url: "http://127.0.0.1:1" },
      remoteAssets: {},
      workspacePath: "/repo",
    });
    // Main 首连只传 workspacePath；descriptor 必须有稳定的 server identity，
    // 否则 attachRendererPort 会因缺少 workspace scope 拒绝建立 MessagePort。
    expect(descriptor.workspacePath).toBe("/repo");
    expect(descriptor.workspaceIdentity).toBe("remote:server:source-5:/repo");
    expect(registry.getSession(descriptor.remoteSessionId)?.workspaceIdentity).toBe(
      "remote:server:source-5:/repo",
    );

    await registry.dispose();
  });

  it("同一 WSL target 的第二次连接标记为复用（join 在线 owner）", async () => {
    const handle = createFakeHandle({
      serviceId: "svc-6",
      sourceServerId: "source-6",
      persistentSourceConnection: true,
    });
    const registry = createWindowRemoteConnectionRegistry<FakeServices, FakeCapabilities>({
      connect: async () => handle,
      createId: createIds("session"),
      resolveSourceServerId: (current) => current.capabilities?.sourceServerId,
      shouldKeepConnectionAlive: (current) =>
        current.capabilities?.persistentSourceConnection === true,
    });

    const first = await registry.connect({
      requestId: "request-6a",
      target: { kind: "wsl", distro: "Ubuntu-22.04" },
      remoteAssets: {},
    });
    // 首个 owner 是新建连接，不能伪报复用。
    expect(first.reusedConnectionTarget).toBeUndefined();

    const second = await registry.connect({
      requestId: "request-6b",
      target: { kind: "wsl", distro: "Ubuntu-22.04" },
      remoteAssets: {},
    });
    // 回归：join 已在线 owner 时旧实现只回放首个 handle 的初次连接事实，复用标记丢失。
    expect(second.reusedConnectionTarget).toMatchObject({
      kind: "wsl",
      distro: "Ubuntu-22.04",
    });

    await registry.dispose();
  });
});
