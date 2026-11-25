// 连接池租约语义：释放只退订本租约登记的资源、配置移除立即关闭、按需重连单飞、
// App 连接身份带租约前缀、快照监听隔离。适配器用内存 fake，不启进程/网络。
import { expect, it, vi } from "vitest";
import type {
  McpPort,
  McpServerConfig,
  McpServerStatus,
  McpToolDescriptor,
} from "@zcode/contracts";
import { createMcpConnectionPool } from "../src/mcp/pool.js";

const SERVER = "fixture";

const CONFIG: McpServerConfig = {
  type: "stdio",
  command: process.execPath,
  args: ["-e", ""],
  isolation: "workspace",
};

const TOOL: McpToolDescriptor = {
  serverName: SERVER,
  toolName: "probe",
  description: "probe",
  inputSchema: { type: "object" },
};

function mcpStatus(state: McpServerStatus["status"] = "connected"): McpServerStatus {
  return { status: state, transport: "stdio", toolCount: 1, updatedAt: "now" };
}

function createFakeAdapter(options: { connectGate?: () => Promise<void> } = {}) {
  const state = {
    alive: true,
    closeCalls: 0,
    connectCalls: 0,
    snapshot: { identity: "raw-identity", generation: 1 } as {
      identity: string;
      generation: number;
    } | null,
    unsubscribed: [] as Array<{ serverName: string; uri: string; subscriberKey: string }>,
  };
  const listeners = new Set<() => void>();
  const adapter: McpPort = {
    async connectServer() {
      state.connectCalls += 1;
      if (options.connectGate) await options.connectGate();
      return mcpStatus();
    },
    async disconnectServer() {
      return mcpStatus("disconnected");
    },
    status: async () => ({ [SERVER]: mcpStatus() }),
    listTools: async () => [TOOL],
    getToolSnapshot: () => ({
      [SERVER]: { status: mcpStatus(), tools: [TOOL], toolsVersion: "v1" },
    }),
    callTool: async () => ({ content: [{ type: "text", text: "ok" }] }),
    pingServer: async () => state.alive,
    appConnectionSnapshot: () => state.snapshot,
    async waitForAppConnection() {
      return state.snapshot;
    },
    onSnapshotChanged(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async subscribeResource() {},
    async unsubscribeResource(request) {
      state.unsubscribed.push({
        serverName: request.serverName,
        subscriberKey: request.subscriberKey,
        uri: request.uri,
      });
    },
    async close() {
      state.closeCalls += 1;
    },
  };
  return { adapter, listeners, state };
}

/** 等一个宏任务，让 pool 里 `void` 的退订/关闭任务跑完。 */
async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

it("releasing one lease unsubscribes only its own resource registrations", async () => {
  const fixture = createFakeAdapter();
  const pool = createMcpConnectionPool({
    createAdapter: () => fixture.adapter,
    idleGraceMs: 60_000,
  });
  const first = pool.acquireLease({ leaseId: "first" });
  const second = pool.acquireLease({ leaseId: "second" });
  try {
    await first.connectServer(SERVER, CONFIG, { workspaceIdentity: "/workspace" });
    await second.connectServer(SERVER, CONFIG, { workspaceIdentity: "/workspace" });
    // workspace 隔离配置共享同一条连接；租约只是引用计数。
    expect(fixture.state.connectCalls).toBe(1);

    await first.subscribeResource!({
      serverName: SERVER,
      subscriberKey: "session|first|app",
      uri: "ui://first",
    });
    await second.subscribeResource!({
      serverName: SERVER,
      subscriberKey: "session|second|app",
      uri: "ui://second",
    });

    await first.close();
    await tick();
    expect(fixture.state.unsubscribed.map((item) => item.uri)).toEqual(["ui://first"]);
    // 另一租约仍持有连接，不能因为一方释放而关闭。
    expect(fixture.state.closeCalls).toBe(0);

    await second.close();
    await tick();
    expect(fixture.state.unsubscribed.map((item) => item.uri)).toEqual([
      "ui://first",
      "ui://second",
    ]);
  } finally {
    await pool.close();
  }
});

it("closes a removed server's connection immediately instead of waiting for the idle grace", async () => {
  const fixture = createFakeAdapter();
  const pool = createMcpConnectionPool({
    createAdapter: () => fixture.adapter,
    idleGraceMs: 60_000,
  });
  const lease = pool.acquireLease({ leaseId: "settings" });
  try {
    await lease.connectConfiguredServers({
      [SERVER]: CONFIG,
      retained: { ...CONFIG, command: "retained" },
    });
    await lease.connectConfiguredServers({ retained: { ...CONFIG, command: "retained" } });
    await vi.waitFor(() => expect(fixture.state.closeCalls).toBe(1));
  } finally {
    await lease.close();
    await pool.close();
  }
});

it("prefixes App connection identities with the pool entry and rejects a changed connection", async () => {
  const fixture = createFakeAdapter();
  const pool = createMcpConnectionPool({ createAdapter: () => fixture.adapter });
  const lease = pool.acquireLease({ leaseId: "app" });
  try {
    await lease.connectServer(SERVER, CONFIG);
    const snapshot = lease.appConnectionSnapshot!(SERVER);
    expect(snapshot?.identity.endsWith(":raw-identity")).toBe(true);
    // 等待路径与快照路径必须给出同一种 identity 格式。
    await expect(lease.waitForAppConnection!(SERVER)).resolves.toEqual(snapshot);
    await expect(
      lease.callTool({ serverName: SERVER, toolName: "probe" }, { appConnection: snapshot! }),
    ).resolves.toEqual({ content: [{ type: "text", text: "ok" }] });
    // 未加租约前缀的原始 identity 不能匹配。
    await expect(
      lease.callTool(
        { serverName: SERVER, toolName: "probe" },
        { appConnection: { identity: "raw-identity", generation: 1 } },
      ),
    ).rejects.toThrow("MCP App connection changed");
    fixture.state.snapshot = { identity: "raw-identity", generation: 2 };
    await expect(
      lease.callTool({ serverName: SERVER, toolName: "probe" }, { appConnection: snapshot! }),
    ).rejects.toThrow("MCP App connection changed");
  } finally {
    await lease.close();
    await pool.close();
  }
});

it("reconnects a stale pooled connection once for concurrent revalidations", async () => {
  const fixture = createFakeAdapter();
  const pool = createMcpConnectionPool({ createAdapter: () => fixture.adapter });
  const lease = pool.acquireLease({ leaseId: "settings" });
  try {
    await lease.connectServer(SERVER, CONFIG);
    expect(fixture.state.connectCalls).toBe(1);
    fixture.state.alive = false;
    await Promise.all([
      lease.connectServer(SERVER, CONFIG, { revalidate: true }),
      lease.connectServer(SERVER, CONFIG, { revalidate: true }),
    ]);
    expect(fixture.state.connectCalls).toBe(2);
    await expect(lease.pingServer!(SERVER)).resolves.toBe(false);
  } finally {
    await lease.close();
    await pool.close();
  }
});

it("cancels only the released lease's reconnect wait while the shared connection keeps starting", async () => {
  const gate = Promise.withResolvers<void>();
  let gateReconnect = false;
  const fixture = createFakeAdapter({
    connectGate: () => (gateReconnect ? gate.promise : Promise.resolve()),
  });
  const pool = createMcpConnectionPool({ createAdapter: () => fixture.adapter });
  const first = pool.acquireLease({ leaseId: "first" });
  const second = pool.acquireLease({ leaseId: "second" });
  try {
    await first.connectServer(SERVER, CONFIG, { workspaceIdentity: "/workspace" });
    await second.connectServer(SERVER, CONFIG, { workspaceIdentity: "/workspace" });
    fixture.state.alive = false;
    gateReconnect = true;

    const reconnecting = first.connectServer(SERVER, CONFIG, {
      revalidate: true,
      workspaceIdentity: "/workspace",
    });
    await vi.waitFor(() => expect(fixture.state.connectCalls).toBe(2));
    // 释放只结束本租约的等待；连接任务仍归 pool，另一租约继续持有。
    await first.close();
    await expect(reconnecting).rejects.toThrow("MCP session lease closed");

    gate.resolve();
    await expect(
      second.connectServer(SERVER, CONFIG, { revalidate: true, workspaceIdentity: "/workspace" }),
    ).resolves.toMatchObject({ status: "connected" });
    expect(fixture.state.closeCalls).toBe(0);
  } finally {
    gate.resolve();
    await Promise.allSettled([first.close(), second.close()]);
    await pool.close();
  }
});

it("isolates a throwing snapshot listener and detaches it when the lease closes", async () => {
  const fixture = createFakeAdapter();
  const pool = createMcpConnectionPool({ createAdapter: () => fixture.adapter });
  const lease = pool.acquireLease({ leaseId: "listener" });
  try {
    await lease.connectServer(SERVER, CONFIG);
    const healthy = vi.fn();
    lease.onSnapshotChanged!(() => {
      throw new Error("listener failed");
    });
    lease.onSnapshotChanged!(healthy);
    for (const listener of fixture.listeners) listener();
    expect(healthy).toHaveBeenCalledTimes(1);

    await lease.close();
    for (const listener of fixture.listeners) listener();
    expect(healthy).toHaveBeenCalledTimes(1);
  } finally {
    await pool.close();
  }
});
