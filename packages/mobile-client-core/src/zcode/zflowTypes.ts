// zcode（zflow）协议共享类型与平台端口。
//
// 对齐 Flutter lib/protocol/relay_client.dart 的状态机枚举、关闭码映射，
// 以及 rpc_transport / zflow_client 需要的 socket / 时钟注入契约。
// 纯 TS、无平台 SDK：socket 与定时器经端口注入（weapp 在 Taro 侧包装
// SocketTask；浏览器缺省用全局 WebSocket）。

/** relay 链路状态机，与 Dart `RelayState` 同名同序。 */
export type ZflowRelayState =
  | "idle"
  | "connecting"
  | "authenticating"
  | "waiting"
  | "paired"
  | "reconnecting"
  | "error"
  | "kicked"
  | "closed";

export interface ZflowRelayFailure {
  reason: string;
  message?: string;
}

/** 关闭码映射，对齐 web 客户端 `VC()`/`BC` 与 Dart `relayCloseReason`。 */
export function zflowRelayCloseReason(code: number): string | null {
  switch (code) {
    case 4004:
      return "session-not-found";
    case 4009:
      return "session-conflict";
    case 4010:
      return "desktop-disconnected";
    case 4011:
      return "session-expired";
    case 4012:
      return "workspace-closed";
    case 4013:
      return "invalid-mobile-connection";
    default:
      return null;
  }
}

/** relay / bridge 上层业务载荷（JSON 对象）。 */
export type ZflowPayload = Record<string, unknown>;

/** 二进制消息（rpc-frame 组装产物 / channel body）。 */
export type ZcodeBinary = Uint8Array;

/**
 * relay socket 抽象。`opened` 在链路就绪后 resolve（对齐 Dart
 * `WebSocketChannel.ready`）；消息只支持 JSON 文本帧。
 */
export interface ZflowSocketLike {
  readonly opened: Promise<void>;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  setMessageHandler(handler: (data: string) => void): void;
  setCloseHandler(handler: (code: number, reason: string) => void): void;
  setErrorHandler(handler: (error: unknown) => void): void;
}

export type ZflowSocketFactory = (url: string) => ZflowSocketLike;

/** 浏览器缺省 socket：全局 WebSocket 包装（JSON 文本帧）。 */
export function defaultZflowSocket(url: string): ZflowSocketLike {
  const socket = new WebSocket(url);
  let messageHandler: ((data: string) => void) | null = null;
  let closeHandler: ((code: number, reason: string) => void) | null = null;
  let errorHandler: ((error: unknown) => void) | null = null;
  socket.addEventListener("message", (event) => {
    if (typeof event.data === "string") messageHandler?.(event.data);
  });
  socket.addEventListener("close", (event) => {
    closeHandler?.(event.code, event.reason ?? "");
  });
  socket.addEventListener("error", () => {
    errorHandler?.(new Error("socket error"));
  });
  return {
    opened: new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () => reject(new Error(`socket open failed: ${url}`)));
    }),
    send: (data) => socket.send(data),
    close: (code, reason) => socket.close(code, reason),
    setMessageHandler: (handler) => {
      messageHandler = handler;
    },
    setCloseHandler: (handler) => {
      closeHandler = handler;
    },
    setErrorHandler: (handler) => {
      errorHandler = handler;
    },
  };
}

/**
 * 时钟/定时器注入：生产用真实 setTimeout/setInterval，测试用手动调度器。
 * 全部 zcode 模块只允许经这里触达时间——不允许直接 new Date/Date.now/setTimeout。
 */
export interface ZflowTimePorts {
  now(): number;
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realZflowTimePorts: ZflowTimePorts = {
  now: () => Date.now(),
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** 手动调度器（测试用）：advance(ms) 触发到期的定时器。 */
export class ManualZflowTimePorts implements ZflowTimePorts {
  private current = 1_000_000;
  private nextHandle = 1;
  private timers = new Map<number, { at: number; handler: () => void; intervalMs?: number }>();

  now(): number {
    return this.current;
  }

  setInterval(handler: () => void, ms: number): unknown {
    const handle = this.nextHandle++;
    this.timers.set(handle, { at: this.current + ms, handler, intervalMs: ms });
    return handle;
  }

  clearInterval(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  setTimeout(handler: () => void, ms: number): unknown {
    const handle = this.nextHandle++;
    this.timers.set(handle, { at: this.current + ms, handler });
    return handle;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  /** 推进时钟并触发所有到期定时器（到期定时器按调度时间升序执行）。 */
  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      let earliest: { handle: number; at: number } | null = null;
      for (const [handle, timer] of this.timers) {
        if (timer.at <= target && (earliest === null || timer.at < earliest.at)) {
          earliest = { handle, at: timer.at };
        }
      }
      if (earliest === null) break;
      const timer = this.timers.get(earliest.handle)!;
      this.current = Math.max(this.current, timer.at);
      if (timer.intervalMs === undefined) {
        this.timers.delete(earliest.handle);
      } else {
        timer.at = this.current + timer.intervalMs;
      }
      timer.handler();
    }
    this.current = target;
  }
}

/** 请求 ID：`<prefix>-<hex32>`；服务器按 opaque 字符串处理。 */
export function zflowRequestId(prefix: string, randomHex: (bytes: number) => string): string {
  return `${prefix}-${randomHex(16)}`;
}
