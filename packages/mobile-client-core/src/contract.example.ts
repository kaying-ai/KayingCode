// 合同使用示例（仅类型层；运行时入口见各导出模块）。
import {
  ChannelBackedKayingCodeAgentService,
  RelayAgentConnection,
  ZcodeAuthSession,
  type BridgeSession,
  type RelayWorkspaceTarget,
  type RelayPlatformPorts,
} from "./contract.js";

/** V2 平台壳注入安全随机源与 HTTP；每次 socket 连接调用 getTerminalToken。 */
export function exampleZcodeV2Auth(
  origin: string,
  ports: RelayPlatformPorts,
  randomSecret: () => Promise<string>,
) {
  return new ZcodeAuthSession({ origin, request: ports.fetch, randomSecret });
}

/** ZCode 桥直接提供移动 V4 服务面，复用同一会话投影。 */
export function exampleZcodeConversation(bridge: BridgeSession, target: RelayWorkspaceTarget) {
  return RelayAgentConnection.fromAgent(
    new ChannelBackedKayingCodeAgentService(bridge, target),
    target,
  );
}

/** weapp/native（MOB-P-002/004）：注入平台 ports，核心零改动。 */
export const exampleWeappPorts: RelayPlatformPorts = {
  storage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
  deviceInfo: () => ({ platform: "weapp", deviceName: "WeChat", os: "other" }),
  randomHex: (byteLength) => Array.from({ length: byteLength * 2 }, () => "0").join(""),
  fetch: (url, init) => fetch(url, init),
};
