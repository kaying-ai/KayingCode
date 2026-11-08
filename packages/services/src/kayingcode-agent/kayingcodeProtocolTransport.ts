import type { Event, IDisposable } from "@zcode/rpc";
import type { KayingCodeProtocolMessage } from "@zcode/shared";

export type KayingCodeProtocolTransportKind = "stdio" | "websocket" | "memory";

export interface KayingCodeProtocolTransportClosedEvent {
  code?: number | null;
  signal?: NodeJS.Signals | null;
  reason?: string;
}

export interface KayingCodeProtocolTransport extends IDisposable {
  readonly kind: KayingCodeProtocolTransportKind;
  readonly onMessage: Event<KayingCodeProtocolMessage>;
  readonly onClose: Event<KayingCodeProtocolTransportClosedEvent>;
  send(message: KayingCodeProtocolMessage): Promise<void>;
  disposeAndWait?(): Promise<void>;
}
