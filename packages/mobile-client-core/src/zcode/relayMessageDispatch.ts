import { parseRelayFrame } from "./relayFrames.js";
import type { RelayWireProtocol } from "./relayWireProtocol.js";
import type { ZflowPayload } from "./zflowTypes.js";

export function dispatchRelayMessage(
  text: string,
  wire: RelayWireProtocol,
  state: string,
  now: number,
  hooks: {
    send(frame: Record<string, unknown>): void;
    status(value: string | null): void;
    payload(value: ZflowPayload): void;
    error(code: string | null, message?: string): void;
    log(line: string): void;
  },
): void {
  const frame = parseRelayFrame(text);
  if (!frame) {
    hooks.log("[诊断] relay 连接收到无法解析的帧，请导出协议日志反馈");
    return;
  }
  switch (frame.type) {
    case "auth_ack":
    case "pair_status_ack":
      if (wire.accept(frame, state))
        hooks.status(typeof frame.pair_status === "string" ? frame.pair_status : null);
      return;
    case "data":
      if (
        wire.accept(frame, state) &&
        frame.payload !== null &&
        typeof frame.payload === "object" &&
        !Array.isArray(frame.payload)
      )
        hooks.payload(frame.payload as ZflowPayload);
      return;
    case "error":
      hooks.error(
        typeof frame.code === "string" ? frame.code : null,
        typeof frame.message === "string" ? frame.message : undefined,
      );
      return;
    default:
      hooks.log(`[诊断] 收到未知帧类型 "${String(frame.type)}"，请导出协议日志反馈`);
  }
}
