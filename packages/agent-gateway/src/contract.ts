// @kayingcode/agent-gateway 公开合同 —— 跨模块只允许从这里 import。
//
// Agent Gateway 是无产品状态的 HTTP/WS RPC ingress（计划 §5.2/§5.4，ARCH-003）：
// 固定 clientMode→role 映射、一次性 host capability、每连接独立 connection scope
// 与有界关闭。部署策略（loopback 限制、bearer token、静态资源、server-info 事实）
// 由宿主（Web Host / Agent Node）拥有，gateway 只承接 WS/RPC 接入语义。
import type { ServerType } from "@hono/node-server";
import type { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import type { WebSocket } from "ws";
import type { ServiceCollection } from "@zcode/services";
import type { ServerRemoteInfo } from "@zcode/shared";
import type { HostCapabilityStore } from "./hostCapability.js";

export type { HostCapabilityStore, HostCapabilityStoreOptions } from "./hostCapability.js";
export { DEFAULT_HOST_CAPABILITY_TTL_MS, createHostCapabilityStore } from "./hostCapability.js";
export type AgentGatewayClientMode = "desktop-continuous" | "web-remote-replayable";

export type AgentGatewayUpgradeWebSocket = ReturnType<
  typeof createNodeWebSocket
>["upgradeWebSocket"];

export interface AgentGatewayIngressPolicy {
  /**
   * 是否注册 /ws/host（trusted host 通道）与 /api/rpc-host-capability 签发。
   * 默认 true；关闭后宿主必须自行保证不出现 desktop-continuous 入口。
   */
  trustedHost?: boolean;
  /** 是否注册 /api/server-info。默认 true。 */
  serverInfo?: boolean;
}

export interface AgentGatewayOptions {
  /** 宿主创建的 Hono app；gateway 在其上注册固定语义的 WS/RPC 路由。 */
  app: Hono;
  services: ServiceCollection;
  /** server-info 事实由宿主构建（serverId/generation/workspaces/capabilities）。 */
  serverInfo: ServerRemoteInfo;
  /** LoggingChannelServer 的日志出口；缺省时不包装日志中间件。 */
  logger?: (...args: unknown[]) => void;
  /** connectionId 前缀（诊断用，保证每次连接全局唯一 id）。 */
  connectionIdPrefix?: string;
  ingressPolicy?: AgentGatewayIngressPolicy;
  /** 测试可注入时钟/随机源的 capability store；缺省新建。 */
  hostCapabilityStore?: HostCapabilityStore;
}

export interface AgentGatewayAttachOptions {
  clientMode: AgentGatewayClientMode;
  /** 缺省使用 gateway 构造时的 services；host 自定义路由（如 remote bridge）可覆盖。 */
  services?: ServiceCollection;
}

export interface AgentGateway {
  readonly serverInfo: ServerRemoteInfo;
  readonly hostCapabilityStore: HostCapabilityStore;
  readonly upgradeWebSocket: AgentGatewayUpgradeWebSocket;
  /** 将宿主的 node http server 接入 WS upgrade（@hono/node-ws injectWebSocket 透传）。 */
  injectWebSocket(server: ServerType): void;
  /**
   * 为任意 raw WebSocket 建立受控 RPC attachment。/ws、/ws/host 之外的自定义路由
   * 必须经由本方法进入 RPC 世界，不得绕过 clientMode→role 映射。
   */
  attachWebSocket(ws: WebSocket, options: AgentGatewayAttachOptions): void;
  /** 当前活跃（未 close）的受控连接数。 */
  activeConnectionCount(): number;
  /**
   * 有界关闭：向所有活跃 WS 发 close(1001) → drain 窗口（默认 250ms）→ terminate
   * → dispose 剩余 scope → 关闭 wss。幂等；HTTP server 本身的 close 由宿主负责。
   */
  close(options?: { drainTimeoutMs?: number }): Promise<void>;
}
