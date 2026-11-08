import assert from "node:assert/strict";
import { test } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import WebSocket from "ws";
import {
  ChannelClient,
  Emitter,
  SocketProtocol,
  VSBuffer,
  type IChannel,
  type ISocket,
} from "@zcode/rpc";
import { IProviderProvisioningTargetService, ServiceCollection } from "@zcode/services";
import {
  KAYINGCODE_RPC_HOST_CAPABILITY_HEADER,
  SERVER_REMOTE_PROTOCOL_VERSION,
  type ServerRemoteInfo,
} from "@zcode/shared";
import { createAgentGateway } from "./agentGateway.js";
import type { AgentGateway, AgentGatewayIngressPolicy } from "./contract.js";
import { createHostCapabilityStore, type HostCapabilityStore } from "./hostCapability.js";

const serverInfo: ServerRemoteInfo = {
  serverId: "gateway-test-server",
  instanceGeneration: 3,
  version: "0.0.0-test",
  protocolVersion: SERVER_REMOTE_PROTOCOL_VERSION,
  minimumClientProtocolVersion: SERVER_REMOTE_PROTOCOL_VERSION,
  authRequired: false,
  auth: { methods: ["ssh-tunnel"], tlsRequired: false },
  workspaces: [],
  capabilities: {
    desktopContinuous: true,
    trustedHostCapability: true,
    workspaceCatalog: true,
    conversationV4: false,
    attachmentChunkUpload: false,
    file: false,
    git: false,
    terminal: false,
    providerSettings: false,
    browserControl: false,
    cua: false,
    automationScheduler: false,
    websocketRpc: true,
    processResourceTelemetry: false,
  },
};

interface RunningGateway {
  baseUrl: string;
  gateway: AgentGateway;
  clock: { now: number };
  close: () => Promise<void>;
}

async function startGateway(
  overrides: {
    services?: ServiceCollection;
    hostCapabilityStore?: HostCapabilityStore;
    ingressPolicy?: AgentGatewayIngressPolicy;
  } = {},
): Promise<RunningGateway> {
  const app = new Hono();
  const clock = { now: 1_000_000 };
  const hostCapabilityStore =
    overrides.hostCapabilityStore ?? createHostCapabilityStore({ now: () => clock.now });
  const gateway = createAgentGateway({
    app,
    services: overrides.services ?? new ServiceCollection(),
    serverInfo,
    hostCapabilityStore,
    connectionIdPrefix: "gateway-test-ws",
    ingressPolicy: overrides.ingressPolicy,
  });
  const server: ServerType = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  gateway.injectWebSocket(server);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    gateway,
    clock,
    close: async () => {
      await gateway.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error?: Error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

interface ClientConnection {
  ws: WebSocket;
  open: Promise<void>;
  rejected: Promise<Error>;
}

function connectWebSocket(url: string, headers?: Record<string, string>): ClientConnection {
  const ws = new WebSocket(url, { headers });
  let opened = false;
  const open = new Promise<void>((resolve, reject) => {
    ws.once("open", () => {
      opened = true;
      resolve();
    });
    ws.once("error", (error: Error) => {
      if (!opened) reject(error);
    });
  });
  // 拒绝路径走 rejected promise；避免 open 的 unhandled rejection 干扰测试判定。
  open.catch(() => {});
  const rejected = new Promise<Error>((resolve) => {
    ws.once("error", (error: Error) => resolve(error));
  });
  return { ws, open, rejected };
}

/**
 * open 事件内同步建立 ChannelClient：ChannelServer 在连接建立时即发送 Initialize，
 * 客户端包装必须赶在后续 message 事件分发前挂好监听（与生产 connectViaWebSocket 一致）。
 */
function connectRpcWebSocket(
  url: string,
  headers?: Record<string, string>,
): Promise<{ ws: WebSocket; client: ChannelClient }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    ws.once("open", () => {
      const client = new ChannelClient(new SocketProtocol(wrapClientWebSocket(ws)));
      resolve({ ws, client });
    });
    ws.once("error", (error: Error) => reject(error));
  });
}

function wrapClientWebSocket(ws: WebSocket): ISocket {
  const onData = new Emitter<VSBuffer>();
  const onClose = new Emitter<void>();
  const onEnd = new Emitter<void>();
  ws.on("message", (raw) =>
    onData.fire(VSBuffer.wrap(Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer))),
  );
  ws.on("close", () => {
    onClose.fire();
    onEnd.fire();
  });
  ws.on("error", () => {
    onClose.fire();
    onEnd.fire();
  });
  return {
    onData: onData.event,
    onClose: onClose.event,
    onEnd: onEnd.event,
    write(buffer) {
      if (ws.readyState === WebSocket.OPEN) ws.send(buffer.buffer);
    },
    end() {
      ws.close();
    },
    drain() {
      return Promise.resolve();
    },
    dispose() {
      ws.close();
    },
  };
}

async function waitForOpenPromisesToSettle(): Promise<void> {
  // 服务端 onOpen 与客户端 open 事件各在握手两端触发；留一个事件循环窗口。
  await new Promise((resolve) => setTimeout(resolve, 30));
}

test("server-info 返回宿主注入的事实（serverId/generation/auth/capabilities）", async (t) => {
  const running = await startGateway();
  t.onTestFinished(() => running.close());

  const response = await fetch(`${running.baseUrl}/api/server-info`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), serverInfo);
});

test("/ws 无需 capability 即可升级（terminal-client/replayable 语义）", async (t) => {
  const running = await startGateway();
  t.onTestFinished(() => running.close());

  const connection = connectWebSocket(`${running.baseUrl.replace("http", "ws")}/ws`);
  await connection.open;
  await waitForOpenPromisesToSettle();
  assert.equal(running.gateway.activeConnectionCount(), 1);
  connection.ws.close();
  await waitForOpenPromisesToSettle();
  assert.equal(running.gateway.activeConnectionCount(), 0);
});

test("/ws/host 缺失 capability 拒绝升级（401）", async (t) => {
  const running = await startGateway();
  t.onTestFinished(() => running.close());

  const connection = connectWebSocket(`${running.baseUrl.replace("http", "ws")}/ws/host`);
  const error = await connection.rejected;
  assert.match(error.message, /401/u);
});

test("capability 首次消费成功、重放拒绝，并携带 instanceGeneration", async (t) => {
  const running = await startGateway();
  t.onTestFinished(() => running.close());

  const issueResponse = await fetch(`${running.baseUrl}/api/rpc-host-capability`, {
    method: "POST",
  });
  assert.equal(issueResponse.status, 200);
  const issued = (await issueResponse.json()) as {
    capability: string;
    expiresAt: number;
    instanceGeneration: number;
  };
  assert.ok(issued.capability.length > 0);
  assert.equal(issued.instanceGeneration, 3);
  assert.ok(issued.expiresAt > running.clock.now);

  const first = connectWebSocket(`${running.baseUrl.replace("http", "ws")}/ws/host`, {
    [KAYINGCODE_RPC_HOST_CAPABILITY_HEADER]: issued.capability,
  });
  await first.open;
  await waitForOpenPromisesToSettle();

  const replay = connectWebSocket(`${running.baseUrl.replace("http", "ws")}/ws/host`, {
    [KAYINGCODE_RPC_HOST_CAPABILITY_HEADER]: issued.capability,
  });
  const replayError = await replay.rejected;
  assert.match(replayError.message, /401/u);
});

test("capability 超过 TTL 后消费失败（含未使用票据）", async (t) => {
  const running = await startGateway();
  t.onTestFinished(() => running.close());

  const issueResponse = await fetch(`${running.baseUrl}/api/rpc-host-capability`, {
    method: "POST",
  });
  const issued = (await issueResponse.json()) as { capability: string; expiresAt: number };

  running.clock.now = issued.expiresAt + 1;
  const expired = connectWebSocket(`${running.baseUrl.replace("http", "ws")}/ws/host`, {
    [KAYINGCODE_RPC_HOST_CAPABILITY_HEADER]: issued.capability,
  });
  const error = await expired.rejected;
  assert.match(error.message, /401/u);
});

test("close() 有界关闭活跃连接、计数归零并拒绝新连接", async () => {
  const running = await startGateway();
  const connection = connectWebSocket(`${running.baseUrl.replace("http", "ws")}/ws`);
  await connection.open;
  await waitForOpenPromisesToSettle();
  assert.equal(running.gateway.activeConnectionCount(), 1);

  const closed = new Promise<{ code: number }>((resolve) => {
    connection.ws.once("close", (code) => resolve({ code }));
  });
  const startAt = Date.now();
  await running.gateway.close({ drainTimeoutMs: 500 });
  const closeEvent = await closed;
  assert.equal(closeEvent.code, 1001);
  assert.ok(Date.now() - startAt < 5_000, "close 应有界完成");
  assert.equal(running.gateway.activeConnectionCount(), 0);

  const next = connectWebSocket(`${running.baseUrl.replace("http", "ws")}/ws`);
  await assert.rejects(next.open);
  await running.close();
});

test("非 desktop 连接的 Provisioning 调用被拒绝桩拦截", async (t) => {
  const services = new ServiceCollection().register(IProviderProvisioningTargetService, {
    apply: async () => {
      throw new Error("base provisioning must not be called");
    },
  });
  const running = await startGateway({ services });
  t.onTestFinished(() => running.close());

  const { client } = await connectRpcWebSocket(`${running.baseUrl.replace("http", "ws")}/ws`);
  const channel = client.getChannel<IChannel>(IProviderProvisioningTargetService.channelName);
  await assert.rejects(channel.call("apply", []), /仅支持受信 Desktop Host/u);
  client.dispose();
});

test("desktop-continuous 连接不被拒绝桩拦截（保留 trusted host 行为）", async (t) => {
  const services = new ServiceCollection().register(IProviderProvisioningTargetService, {
    apply: async () => ({
      syncId: "sync-1",
      status: "applied",
      personalProviderCount: 0,
      credentialCount: 0,
      rolledBack: false,
    }),
  });
  const running = await startGateway({ services });
  t.onTestFinished(() => running.close());

  const issueResponse = await fetch(`${running.baseUrl}/api/rpc-host-capability`, {
    method: "POST",
  });
  const issued = (await issueResponse.json()) as { capability: string };
  const { client } = await connectRpcWebSocket(`${running.baseUrl.replace("http", "ws")}/ws/host`, {
    [KAYINGCODE_RPC_HOST_CAPABILITY_HEADER]: issued.capability,
  });
  const channel = client.getChannel<IChannel>(IProviderProvisioningTargetService.channelName);
  const result = (await channel.call("apply", [])) as { status: string };
  assert.equal(result.status, "applied");
  client.dispose();
});

test("ingressPolicy 关闭 trustedHost 时不注册 /ws/host 与 capability 签发", async (t) => {
  const running = await startGateway({ ingressPolicy: { trustedHost: false } });
  t.onTestFinished(() => running.close());

  const issueResponse = await fetch(`${running.baseUrl}/api/rpc-host-capability`, {
    method: "POST",
  });
  assert.equal(issueResponse.status, 404);

  const connection = connectWebSocket(`${running.baseUrl.replace("http", "ws")}/ws/host`);
  const error = await connection.rejected;
  assert.match(error.message, /404/u);

  // 普通 /ws 不受影响。
  const plain = connectWebSocket(`${running.baseUrl.replace("http", "ws")}/ws`);
  await plain.open;
  await waitForOpenPromisesToSettle();
  assert.equal(running.gateway.activeConnectionCount(), 1);
});
