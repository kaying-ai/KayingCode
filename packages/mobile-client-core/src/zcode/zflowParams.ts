// ZCode 连接参数的传输层推导。
//
// 解析由 mobileConnectionParams.ts 完成；这里只推导当前 /api/v1/remote/ws2
// 与可选 mid，不提供旧版 /ws 或 proof 降级。
import type { MobileConnectionParams } from "../mobileConnectionParams.js";

export function zflowRelayWsUrl(params: MobileConnectionParams): string {
  if (params.backendType !== "zcode") {
    throw new Error("zflowRelayWsUrl: params is not a zcode connection");
  }
  const port = params.port === null ? "" : `:${params.port}`;
  const base = `wss://${params.host}${port}/api/v1/remote/ws2`;
  return params.deviceMid ? `${base}?mid=${encodeURIComponent(params.deviceMid)}` : base;
}

/** zflow 客户端需要的最小连接字段（来自 mobileAccounts 的档案）。 */
export interface ZflowEndpointParams {
  deviceSid: string;
  /** 展示与握手用；缺省 "zflow"。 */
  deviceName?: string | null;
  appVersion?: string | null;
  /** 握手 meta.platform（web 客户端上报 browser；移动端如实上报）。 */
  platformName: string;
  protocol?: "v2";
}
