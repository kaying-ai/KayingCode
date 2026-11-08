// 合同使用示例：宿主装配（仅类型层，运行时入口是 createAgentGateway）。
import type { AgentGateway, AgentGatewayOptions, AgentGatewayAttachOptions } from "./contract.js";
import type { Hono } from "hono";
import type { WebSocket } from "ws";
import type { ServiceCollection } from "@zcode/services";
import type { ServerRemoteInfo } from "@zcode/shared";

export interface ExampleHostAssembly {
  app: Hono;
  services: ServiceCollection;
  serverInfo: ServerRemoteInfo;
}

/** 宿主把部署事实交给 gateway；gateway 负责固定语义的 WS/RPC 路由。 */
export function exampleGatewayOptions(assembly: ExampleHostAssembly): AgentGatewayOptions {
  return {
    app: assembly.app,
    services: assembly.services,
    serverInfo: assembly.serverInfo,
    connectionIdPrefix: "example-host-ws",
  };
}

/** 宿主自定义 WS 路由（如 remote bridge）也必须经 attachWebSocket 进入。 */
export function exampleAttachRemoteBridge(
  gateway: AgentGateway,
  ws: WebSocket,
  remoteServices: ServiceCollection,
): void {
  const options: AgentGatewayAttachOptions = {
    clientMode: "web-remote-replayable",
    services: remoteServices,
  };
  gateway.attachWebSocket(ws, options);
}
