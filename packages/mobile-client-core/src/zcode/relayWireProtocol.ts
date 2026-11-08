import {
  authInitFrame,
  dataFrame,
  pairStatusQueryFrame,
  type RelayAuthMeta,
  type RelayInboundFrame,
} from "./relayFrames.js";
import type { ZflowEndpointParams } from "./zflowParams.js";

/** 仅持有当前 socket 的鉴权门禁；连接和重连仍由 ZcodeRelayClient 唯一管理。 */
export class RelayWireProtocol {
  private authenticated = false;
  constructor(private readonly params: ZflowEndpointParams) {}
  reset(): void {
    this.authenticated = false;
  }
  timestamp(ms: number): number {
    return Math.floor(ms / 1000);
  }

  init(meta: RelayAuthMeta, ms: number): Record<string, unknown> {
    return authInitFrame({
      deviceSid: this.params.deviceSid,
      meta,
      clientTs: this.timestamp(ms),
    });
  }

  heartbeat(ms: number): Record<string, unknown> {
    return pairStatusQueryFrame(this.timestamp(ms));
  }

  data(payload: Record<string, unknown>, ms: number): Record<string, unknown> {
    return dataFrame(payload, this.timestamp(ms));
  }

  accept(frame: RelayInboundFrame, state: string): boolean {
    if (frame.type === "error") return true;
    if (frame.type === "auth_ack") {
      if (
        state !== "authenticating" ||
        frame.device_sid !== this.params.deviceSid ||
        !["matched", "waiting"].includes(String(frame.pair_status))
      )
        return false;
      this.authenticated = true;
      return true;
    }
    if (!this.authenticated) return false;
    if (frame.type === "data") return state === "paired";
    return (
      frame.type === "pair_status_ack" && ["matched", "waiting"].includes(String(frame.pair_status))
    );
  }

}
