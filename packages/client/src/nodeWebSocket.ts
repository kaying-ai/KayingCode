import WebSocket, { type RawData } from "ws";
import { ChannelClient, Emitter, SocketProtocol, VSBuffer, type ISocket } from "@zcode/rpc";
import type { IServiceAccessor } from "@zcode/services";
import { RemoteServiceAccess } from "./remoteServiceAccess.js";

export interface NodeWebSocketCloseEvent {
  code: number;
  reason: string;
}

export interface NodeWebSocketConnection {
  services: IServiceAccessor;
  onDidClose(listener: (event: NodeWebSocketCloseEvent) => void): { dispose(): void };
  dispose(): void;
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

function wrapNodeWebSocket(ws: WebSocket): ISocket {
  const onData = new Emitter<VSBuffer>();
  const onClose = new Emitter<void>();
  const onEnd = new Emitter<void>();
  let ended = false;
  const fireEnd = () => {
    if (ended) return;
    ended = true;
    onClose.fire();
    onEnd.fire();
  };
  ws.on("message", (data) => onData.fire(VSBuffer.wrap(toBuffer(data))));
  ws.once("close", fireEnd);
  ws.once("error", fireEnd);
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

export function connectViaNodeWebSocket(
  wsUrl: string,
  options: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {},
): Promise<NodeWebSocketConnection> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      const error = new Error("WebSocket connection aborted");
      error.name = "AbortError";
      reject(error);
      return;
    }
    const ws = new WebSocket(wsUrl, { headers: options.headers });
    const closeEmitter = new Emitter<NodeWebSocketCloseEvent>();
    let settled = false;
    const handleAbort = () => ws.close(1000, "Connection aborted");
    options.signal?.addEventListener("abort", handleAbort, { once: true });
    ws.once("error", (error) => {
      if (!settled) reject(error);
    });
    ws.on("close", (code, reason) => {
      options.signal?.removeEventListener("abort", handleAbort);
      closeEmitter.fire({ code, reason: reason.toString("utf8") });
      if (!settled) reject(new Error(`WebSocket closed before ready (${code})`));
    });
    ws.once("open", () => {
      settled = true;
      const socket = wrapNodeWebSocket(ws);
      const client = new ChannelClient(new SocketProtocol(socket));
      resolve({
        services: new RemoteServiceAccess(client),
        onDidClose: closeEmitter.event,
        dispose() {
          options.signal?.removeEventListener("abort", handleAbort);
          socket.dispose();
          client.dispose();
          closeEmitter.dispose();
        },
      });
    });
  });
}
