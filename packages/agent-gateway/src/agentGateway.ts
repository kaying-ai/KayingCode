// createAgentGateway —— 统一 HTTP/WS RPC ingress（ARCH-003/005）。
//
// 抽取自 packages/server/src/http.ts 与 server-cli server-core/http.ts 的等价实现。
// 宿主差异（loopback fail-closed、bearer token、静态资源、connect-remote、server-info
// 事实）留在宿主；gateway 拥有 clientMode→role 映射、capability、连接 scope 生命周期
// 与有界关闭，两套装配不得再各自复制这些语义。
import { randomUUID } from "node:crypto";
import { createNodeWebSocket } from "@hono/node-ws";
import type { WebSocket, WebSocketServer } from "ws";
import { ChannelServer, LoggingChannelServer, SocketProtocol } from "@zcode/rpc";
import {
  createKayingCodeAgentConnectionScope,
  IKayingCodeAgentService,
  IProviderProvisioningTargetService,
  type ServiceCollection,
} from "@zcode/services";
import { KAYINGCODE_RPC_HOST_CAPABILITY_HEADER } from "@zcode/shared";
import type {
  AgentGateway,
  AgentGatewayAttachOptions,
  AgentGatewayClientMode,
  AgentGatewayOptions,
} from "./contract.js";
import { createHostCapabilityStore } from "./hostCapability.js";
import { socketFromWebSocket } from "./webSocket.js";

const DEFAULT_WEBSOCKET_DRAIN_TIMEOUT_MS = 250;

interface TrackedConnection {
  scope: { dispose(): Promise<void> } | undefined;
  rawServer: ChannelServer;
}

function closeWebSocketServer(wss: WebSocketServer, drainTimeoutMs: number): Promise<void> {
  for (const client of wss.clients) {
    // HTTP server.close() 不会收敛已经 upgrade 的 WebSocket，活跃 desktop
    // continuous 连接会让 shutdown ack 永远发不出去。先发 close frame 给正常
    // 客户端一个短暂排空窗口，再 terminate 兜底，保证宿主能在预算内释放资源。
    client.close(1001, "Server shutting down");
  }
  return drainAndTerminate(wss, drainTimeoutMs);
}

async function drainAndTerminate(wss: WebSocketServer, drainTimeoutMs: number): Promise<void> {
  const deadline = Date.now() + drainTimeoutMs;
  while (wss.clients.size > 0 && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  for (const client of wss.clients) client.terminate();
  await new Promise<void>((resolve, reject) => {
    wss.close((error?: Error) => (error ? reject(error) : resolve()));
  });
}

export function createAgentGateway(options: AgentGatewayOptions): AgentGateway {
  const app = options.app;
  const { injectWebSocket, upgradeWebSocket, wss } = createNodeWebSocket({ app });
  const hostCapabilityStore = options.hostCapabilityStore ?? createHostCapabilityStore();
  const logger = options.logger;
  const connectionIdPrefix = options.connectionIdPrefix ?? "agent-gateway-ws";
  const policy = options.ingressPolicy ?? {};
  const activeConnections = new Set<TrackedConnection>();
  let closed = false;

  const attach = (
    ws: WebSocket,
    clientMode: AgentGatewayClientMode,
    services: ServiceCollection,
  ): void => {
    const socket = socketFromWebSocket(ws);
    const protocol = new SocketProtocol(socket);
    const rawServer = new ChannelServer(protocol, "server");
    const server = logger ? new LoggingChannelServer(rawServer, logger) : rawServer;
    const agentService = services.getOptional(IKayingCodeAgentService);
    const scope = agentService
      ? createKayingCodeAgentConnectionScope(agentService, {
          connectionId: `${connectionIdPrefix}-${randomUUID()}`,
          clientMode,
          role: clientMode === "desktop-continuous" ? "trusted-host-relay" : "terminal-client",
        })
      : undefined;
    const overrides = new Map<string, unknown>();
    if (scope) {
      overrides.set(IKayingCodeAgentService.channelName, scope.service);
    }
    // Provisioning 携带跨 Environment 凭据，只允许 Desktop trusted host 使用；普通 Web
    // remote/replayable 客户端即使知道频道名，也不能获得 target 写入接口。
    if (
      clientMode !== "desktop-continuous" &&
      services.getOptional(IProviderProvisioningTargetService)
    ) {
      overrides.set(IProviderProvisioningTargetService.channelName, {
        apply: async () => {
          throw new Error("Provider Provisioning 仅支持受信 Desktop Host");
        },
      });
    }
    services.exposeOnChannelServer(server, overrides);
    const tracked: TrackedConnection = { scope, rawServer };
    activeConnections.add(tracked);
    socket.onClose(() => {
      activeConnections.delete(tracked);
      void scope?.dispose();
      rawServer.dispose();
    });
  };

  if (policy.serverInfo !== false) {
    app.get("/api/server-info", (context) => context.json(options.serverInfo));
  }
  // 普通 `/ws` 永远是 terminal-client；浏览器/任意客户端设置旧 mode header
  // 都不能再把自己提升为 trusted host。
  app.get(
    "/ws",
    upgradeWebSocket(() => ({
      onOpen(_event, socket) {
        attach(socket.raw as WebSocket, "web-remote-replayable", options.services);
      },
    })),
  );
  if (policy.trustedHost !== false) {
    app.use("/ws/host", async (context, next) => {
      const capability = context.req.header(KAYINGCODE_RPC_HOST_CAPABILITY_HEADER);
      if (!hostCapabilityStore.consume(capability)) {
        return context.json({ error: "Invalid or expired host capability" }, 401);
      }
      await next();
    });
    app.get(
      "/ws/host",
      upgradeWebSocket(() => ({
        onOpen(_event, socket) {
          attach(socket.raw as WebSocket, "desktop-continuous", options.services);
        },
      })),
    );
    app.post("/api/rpc-host-capability", (context) =>
      context.json({
        ...hostCapabilityStore.issue(),
        instanceGeneration: options.serverInfo.instanceGeneration,
      }),
    );
  }

  return {
    serverInfo: options.serverInfo,
    hostCapabilityStore,
    upgradeWebSocket,
    injectWebSocket: (server) => {
      injectWebSocket(server);
    },
    attachWebSocket: (ws, attachOptions: AgentGatewayAttachOptions) => {
      attach(ws, attachOptions.clientMode, attachOptions.services ?? options.services);
    },
    activeConnectionCount: () => activeConnections.size,
    close: async ({ drainTimeoutMs = DEFAULT_WEBSOCKET_DRAIN_TIMEOUT_MS } = {}) => {
      // 幂等：宿主可能在 gateway.close() 之后再统一兜底调用一次。
      if (closed) return;
      closed = true;
      await closeWebSocketServer(wss, drainTimeoutMs);
      for (const tracked of activeConnections) {
        void tracked.scope?.dispose().catch(() => undefined);
        tracked.rawServer.dispose();
      }
      activeConnections.clear();
    },
  };
}
