import { expect, it, vi } from "vitest";
import { createSessionFacade } from "../src/app/session-facade.js";
import { mcpUiInstances } from "../src/kayingcode-protocol/mcp-ui/instances.js";
import { openMcpUiInstance } from "../src/kayingcode-protocol/mcp-ui/protocol.js";
import type { KayingCodeProtocolAgentServerContext } from "../src/kayingcode-protocol/server-types.js";

type Source = { identity: string; generation: number };

const params = {
  workspace: {
    workspacePath: "/Users/dev/w",
    workspaceKey: "/Users/dev/w",
    workspaceIdentity: "ws-1",
  },
  sessionId: "s",
  pluginId: "p",
  serverName: "m",
  scopeId: "v",
  resourceUri: "ui://app",
  ownerWebContentsId: 1,
};

function createContext(options: {
  initial: Source | null;
  /** 重连成功后 port 暴露的连接来源；缺省表示重连仍失败。 */
  restored?: Source | null;
  /** 重连连接任务的放行闸门，让并发 open 都进入等待后再完成。 */
  gate?: Promise<void>;
  /** 重连完成后依次返回的快照：第一次给 source 校验，第二次给 current 校验（stale 场景）。 */
  postReconnectReads?: (Source | null)[];
  /** 冷启动：session 不在常驻表里，ensureReady 完成后才可打开。 */
  coldSession?: boolean;
}) {
  let source = options.initial;
  const queued: (Source | null)[] = [];
  let inFlight: Promise<void> | undefined;
  let connectionAttempts = 0;
  let waitCalls = 0;
  let notifyBothWaiting = () => {};
  const bothWaiting = new Promise<void>((resolve) => {
    notifyBothWaiting = resolve;
  });
  const reconnectMcpAppConnection = vi.fn(async () => {
    // 与 adapter 的 connectionTask（record.connecting）一致：并发 open 共享同一连接任务，不产生第二条连接。
    inFlight ??= (async () => {
      connectionAttempts += 1;
      await options.gate;
      source = options.restored ?? null;
      if (options.postReconnectReads) queued.push(...options.postReconnectReads);
    })().finally(() => {
      inFlight = undefined;
    });
    await inFlight;
  });
  const record = {
    app: {
      getMcpAppConnectionSnapshot: () => (queued.length > 0 ? queued.shift()! : source),
      // 已有连接任务先等待（含并发 open 刚发起的重连）；连接停在 failed 时立即返回空快照。
      waitForMcpAppConnection: async () => {
        waitCalls += 1;
        if (waitCalls === 2) notifyBothWaiting();
        if (inFlight) await inFlight;
        return source;
      },
      reconnectMcpAppConnection,
      onMcpAppConnectionInvalidated: () => () => {},
      unsubscribeMcpResourcesForUi: async () => {},
    },
    traceContext: { traceId: "trace" },
  };
  // 打开前只经过 session 存活检查；没有持久化存储时按常驻 session 判定已就绪。
  // coldSession 模拟冷启动：ensureReady 完成后 session 才进入常驻表。
  const sessions = new Map(options.coldSession ? [] : [[params.sessionId, record]]);
  const ready = new Set(options.coldSession ? [] : [params.sessionId]);
  const ensureReady = vi.fn(async (sessionId: string) => {
    ready.add(sessionId);
    sessions.set(sessionId, record);
  });
  const context = {
    deps: {},
    sessions,
    ...(options.coldSession
      ? { sessionLifecycle: { ensureReady, isReady: (sessionId: string) => ready.has(sessionId) } }
      : {}),
  } as unknown as KayingCodeProtocolAgentServerContext;
  return {
    context,
    reconnectMcpAppConnection,
    bothWaiting,
    ensureReady,
    connectionAttempts: () => connectionAttempts,
  };
}

// 修复前连接不可用时直接报错；stdio 崩溃后连接停在 failed，用户点重试也无法恢复。
it("reconnects once before opening an App whose connection is unavailable", async () => {
  const { context, reconnectMcpAppConnection } = createContext({
    initial: null,
    restored: { identity: "c", generation: 2 },
  });
  const lease = await openMcpUiInstance(context, params);
  expect(reconnectMcpAppConnection).toHaveBeenCalledExactlyOnceWith("m");
  expect(lease.token).toBeTruthy();
  mcpUiInstances.close(lease);
});

// 冷启动时 session 仍在恢复；先 ensureReady 再取 session，避免面板停在 session unavailable。
it("waits for a recovering session before opening the App", async () => {
  const { context, ensureReady } = createContext({
    initial: { identity: "c", generation: 1 },
    coldSession: true,
  });
  const lease = await openMcpUiInstance(context, params);
  // 能走到签发即证明 ensureReady 先于 requireSession（常驻表空时 requireSession 会直接拒绝）。
  expect(ensureReady).toHaveBeenCalledExactlyOnceWith(params.sessionId);
  expect(lease.token).toBeTruthy();
  mcpUiInstances.close(lease);
});

it("reports the unavailable connection when reconnecting does not restore it", async () => {
  const { context, reconnectMcpAppConnection, connectionAttempts } = createContext({
    initial: null,
    restored: null,
  });
  await expect(openMcpUiInstance(context, params)).rejects.toMatchObject({
    code: -32001,
    message: "MCP App connection is unavailable",
  });
  // 单次重试：失败后不做退避或循环重连。
  expect(reconnectMcpAppConnection).toHaveBeenCalledOnce();
  expect(connectionAttempts()).toBe(1);
});

it("does not reconnect when the connection is already healthy", async () => {
  const { context, reconnectMcpAppConnection } = createContext({
    initial: { identity: "c", generation: 1 },
  });
  const lease = await openMcpUiInstance(context, params);
  expect(reconnectMcpAppConnection).not.toHaveBeenCalled();
  mcpUiInstances.close(lease);
});

it("shares one reconnect between concurrent opens of the same App", async () => {
  let releaseGate = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  const { context, bothWaiting, connectionAttempts } = createContext({
    initial: null,
    restored: { identity: "c", generation: 2 },
    gate,
  });
  const first = openMcpUiInstance(context, params);
  const second = openMcpUiInstance(context, params);
  // 两个 open 都已等待/进入重连后再放行，确保覆盖真正的并发窗口。
  await bothWaiting;
  releaseGate();
  const [a, b] = await Promise.all([first, second]);
  // 每个 open 各自请求一次重连，但 port 的单飞连接任务只启动一条连接：并发 open 不会重连两次。
  expect(connectionAttempts()).toBe(1);
  // 同逻辑页面同连接的并发 open 归并为同一凭证。
  expect(a.token).toBe(b.token);
  mcpUiInstances.close(a);
});

it("rejects the open when the connection is replaced while reconnecting", async () => {
  const { context } = createContext({
    initial: null,
    restored: { identity: "c", generation: 2 },
    // 重连签发后连接立刻换代：source 快照与 current 代际不一致，不能复用旧凭证。
    postReconnectReads: [
      { identity: "c", generation: 2 },
      { identity: "c", generation: 3 },
    ],
  });
  await expect(openMcpUiInstance(context, params)).rejects.toMatchObject({
    code: -32001,
    message: "MCP App connection is unavailable",
  });
});

it("reconnects through the MCP port with the 30s open budget", async () => {
  const waitForServer = vi.fn(async () => ({ timedOut: false }));
  const facade = createSessionFacade({
    configResult: { config: { ui: { locale: "en-US" } } },
    mcpPort: { waitForServer },
  } as unknown as Parameters<typeof createSessionFacade>[0]);
  await facade.reconnectMcpAppConnection("m");
  expect(waitForServer).toHaveBeenCalledExactlyOnceWith("m", {
    reconnect: true,
    timeoutMs: 30_000,
  });
});
