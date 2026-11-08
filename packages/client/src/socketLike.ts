// KayingCodeSocketLike —— 注入式移动传输合同（MOB-C-001，计划 §9.3）。
//
// 目标：Browser / Node / 微信小程序 / Capacitor 原生壳共用同一个 ChannelClient 入口，
// 不在移动业务代码里复制 RPC framing。既有链路是
// `ISocket → SocketProtocol → ChannelClient → RemoteServiceAccess`，本模块只补齐
// 「平台无关的 SocketLike 合同 + 双向桥接」，复用 rpc 的全部帧语义：
// 单帧上限与背压由 SocketProtocol / V4 wire 层执行，SocketLike 只保证
// 有序、完整、二进制安全的字节交付与 close 通知。
//
// 新平台（小程序 SocketTask、native socket）只需实现 KayingCodeSocketLike，
// 通过 connectViaSocketLike 进入既有 RPC 世界；不要为它们再写一套 wrap 函数。
import {
  ChannelClient,
  Emitter,
  SocketProtocol,
  VSBuffer,
  type IDisposable,
  type ISocket,
} from "@zcode/rpc";
import type { IServiceAccessor } from "@zcode/services";
import { RemoteServiceAccess } from "./remoteServiceAccess.js";

export interface SocketLikeCloseEvent {
  /** 传输层 close code；无协议语义（1005/1006 等由平台 adapter 决定）。 */
  code: number;
  reason: string;
  /** true = 主动/正常关闭；false = 错误或异常断开。 */
  wasClean: boolean;
}

export interface KayingCodeSocketLike {
  /** 订阅二进制帧；帧必须按发送顺序完整交付。 */
  onData(listener: (bytes: Uint8Array) => void): IDisposable;
  /** 订阅关闭；关闭后不再有数据回调。 */
  onClose(listener: (event: SocketLikeCloseEvent) => void): IDisposable;
  /** 发送一帧二进制数据；同步或异步写入都允许。 */
  write(bytes: Uint8Array): void | Promise<void>;
  /** 发起关闭（幂等）；平台 adapter 负责底层资源清理。 */
  close(): void;
}

/**
 * 连接工厂：移动端「注入式 transport」的接缝。
 * weapp / native adapter（MOB-P-002/MOB-P-004）实现该工厂并注入连接状态机；
 * Browser/Node 的既有 WebSocket 入口同样可以包成工厂。
 */
export type KayingCodeSocketLikeFactory = () => Promise<KayingCodeSocketLike>;

/**
 * ISocket → SocketLike 桥：让已有 browser/node WebSocket 适配产物直接获得
 * SocketLike 视图。ISocket 没有 close 详情，onEnd 视为正常关闭、onClose 视为
 * 异常断开（现有 ws wrapper 两者同发，因此 WS 正常 close 映射为 wasClean=true）。
 */
export function socketLikeFromISocket(socket: ISocket): KayingCodeSocketLike {
  const onClose = new Emitter<SocketLikeCloseEvent>();
  let closed = false;
  const fireCloseOnce = (event: SocketLikeCloseEvent) => {
    if (closed) return;
    closed = true;
    onClose.fire(event);
  };
  socket.onEnd(() => fireCloseOnce({ code: 0, reason: "", wasClean: true }));
  socket.onClose(() => fireCloseOnce({ code: 0, reason: "socket closed", wasClean: false }));
  return {
    onData: (listener) => socket.onData((buffer) => listener(new Uint8Array(buffer.buffer))),
    onClose: onClose.event,
    write: (bytes) => socket.write(VSBuffer.wrap(bytes)),
    close: () => socket.end(),
  };
}

/**
 * SocketLike → ISocket 桥：任何平台 SocketLike 都能进入
 * `SocketProtocol → ChannelClient`，共享既有帧语义（顺序、分帧、上限）。
 */
export function socketLikeToISocket(socketLike: KayingCodeSocketLike): ISocket {
  const onData = new Emitter<VSBuffer>();
  const onClose = new Emitter<void>();
  const onEnd = new Emitter<void>();
  const dataSubscription = socketLike.onData((bytes) => onData.fire(VSBuffer.wrap(bytes)));
  const closeSubscription = socketLike.onClose(() => {
    // ISocket 消费方同时依赖 onClose 与 onEnd（与既有 ws wrapper 语义一致）。
    onClose.fire();
    onEnd.fire();
  });
  return {
    onData: onData.event,
    onClose: onClose.event,
    onEnd: onEnd.event,
    write: (buffer) => {
      void socketLike.write(new Uint8Array(buffer.buffer));
    },
    end: () => socketLike.close(),
    drain: () => Promise.resolve(),
    dispose: () => {
      closeSubscription.dispose();
      dataSubscription.dispose();
      socketLike.close();
    },
  };
}

/**
 * 移动端共用 ChannelClient 入口：从已建立的 SocketLike 直接得到 IServiceAccessor。
 * 连接建立（含 abort）是平台 adapter 的职责；本函数只承接已就绪的 socket。
 */
export function connectViaSocketLike(socketLike: KayingCodeSocketLike): IServiceAccessor {
  const client = new ChannelClient(new SocketProtocol(socketLikeToISocket(socketLike)));
  return new RemoteServiceAccess(client);
}
