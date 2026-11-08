// relay 线协议帧：解析与构造。
//
// 对齐 Flutter relay_client.dart 的 `_handleRawMessage` 帧分派与 `_send` 构造。
// 全部为 JSON 文本帧；客户端发出的一律带 client_ts。

export interface RelayAuthMeta {
  platform: string;
  version: string;
  name: string;
}

export type RelayOutboundFrame = Record<string, unknown>;

export type RelayInboundFrame = { type: string } & Record<string, unknown>;

/**
 * 解析入站文本帧。非 JSON、非对象或缺 `type` 字段返回 null（调用方记诊断日志）；
 * 已知类型做字段收敛，未知类型原样透传（调用方按未知帧记日志）。
 */
export function parseRelayFrame(text: string): RelayInboundFrame | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    return null;
  }
  if (decoded === null || typeof decoded !== "object") return null;
  const record = decoded as Record<string, unknown>;
  if (typeof record.type !== "string") return null;
  return record as RelayInboundFrame;
}

export function authInitFrame(options: {
  deviceSid: string;
  meta: RelayAuthMeta;
  clientTs: number;
}): RelayOutboundFrame {
  return {
    type: "auth_init",
    device_sid: options.deviceSid,
    meta: options.meta,
    client_ts: options.clientTs,
  };
}

export function dataFrame(payload: Record<string, unknown>, clientTs: number): RelayOutboundFrame {
  return { type: "data", payload, client_ts: clientTs };
}

export function pairStatusQueryFrame(clientTs: number): RelayOutboundFrame {
  return { type: "pair_status_query", client_ts: clientTs };
}
