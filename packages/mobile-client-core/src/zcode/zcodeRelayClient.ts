// zcode relay 终端 socket 客户端。
//
// 对齐 Flutter lib/protocol/relay_client.dart（web 客户端 `pen` 类）：
// auth_init → auth_challenge → auth_response(proof) → pair_status matched，
// 心跳 + outbound 队列 + 指数退避重连 + KICKED。socket/时钟/定时器全部注入
// （weapp 包装 SocketTask；浏览器缺省全局 WebSocket）。
// 帧协议见 relayFrames.ts，队列见 relayOutboundQueue.ts，定时器簇见 relayTimers.ts。
import { openRelaySocket } from "./relaySocketSession.js";
import { dispatchRelayMessage } from "./relayMessageDispatch.js";
import { RelayWireProtocol } from "./relayWireProtocol.js";
import { RelayOutboundQueue } from "./relayOutboundQueue.js";
import { RelayTimers, ZFLOW_DEAD_LINK_THRESHOLD_MS } from "./relayTimers.js";
import type { ZflowEndpointParams } from "./zflowParams.js";
import {
  defaultZflowSocket,
  realZflowTimePorts,
  zflowRelayCloseReason,
  type ZflowPayload,
  type ZflowRelayFailure,
  type ZflowRelayState,
  type ZflowSocketFactory,
  type ZflowSocketLike,
  type ZflowTimePorts,
} from "./zflowTypes.js";

export { ZFLOW_DEAD_LINK_THRESHOLD_MS };

export interface ZcodeRelayClientOptions {
  socketFactory?: ZflowSocketFactory;
  time?: ZflowTimePorts;
  onLog?: (line: string) => void;
  getTerminalToken?: () => Promise<string>;
}

export class ZcodeRelayClient {
  readonly params: ZflowEndpointParams & { relayWsUrl: string };
  private readonly time: ZflowTimePorts;
  private readonly socketFactory: ZflowSocketFactory;
  private readonly log: (line: string) => void;
  private readonly timers: RelayTimers;
  private readonly wire: RelayWireProtocol;
  private readonly getTerminalToken?: () => Promise<string>;
  private failureValue: ZflowRelayFailure | null = null;

  private stateValue: ZflowRelayState = "idle";
  private readonly stateListeners = new Set<(state: ZflowRelayState) => void>();
  private readonly payloadListeners = new Set<(payload: ZflowPayload) => void>();
  private readonly failureListeners = new Set<(failure: ZflowRelayFailure) => void>();

  private socket: ZflowSocketLike | null = null;
  private wasPaired = false;
  private intentionallyClosed = false;
  private disposed = false;
  private reconnectAttempt = 0;
  private lastPairStatusAckAt = 0;
  private lastInboundAt = 0;
  private socketGeneration = 0;
  private connectInFlight: Promise<void> | null = null;
  private readonly queue = new RelayOutboundQueue();

  constructor(
    params: ZflowEndpointParams & { relayWsUrl: string },
    options: ZcodeRelayClientOptions = {},
  ) {
    this.params = params;
    this.time = options.time ?? realZflowTimePorts;
    this.socketFactory = options.socketFactory ?? defaultZflowSocket;
    this.log = options.onLog ?? (() => {});
    this.wire = new RelayWireProtocol(params);
    this.getTerminalToken = options.getTerminalToken;
    this.timers = new RelayTimers(this.time, {
      isPaired: () => this.stateValue === "paired",
      isWaiting: () => this.stateValue === "waiting",
      skipHalfBeat: (tick) => this.stateValue === "waiting" && tick % 2 === 1,
      ackStale: () => this.time.now() - this.lastPairStatusAckAt > 30_000,
      rewaitStuck: () => this.wasPaired && this.stateValue === "waiting" && !this.disposed,
      waitingTimeoutDue: () => this.stateValue === "waiting" && !this.wasPaired,
      sendPairStatusQuery: () => this.send(this.wire.heartbeat(this.time.now())),
      reconnect: () => void this.reconnect(),
      onWaitingTimeout: () => {
        this.setState("error");
        this.emitFailure({
          reason: "invalid-mobile-connection",
          message: "Desktop did not match this mobile connection before the waiting timeout.",
        });
      },
      enterReconnecting: () => this.setState("reconnecting"),
      log: (line) => this.log(line),
    });
  }

  get state(): ZflowRelayState {
    return this.stateValue;
  }
  get failure(): ZflowRelayFailure | null {
    return this.failureValue;
  }

  onState(listener: (state: ZflowRelayState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onPayload(listener: (payload: ZflowPayload) => void): () => void {
    this.payloadListeners.add(listener);
    return () => this.payloadListeners.delete(listener);
  }

  onFailure(listener: (failure: ZflowRelayFailure) => void): () => void {
    this.failureListeners.add(listener);
    return () => this.failureListeners.delete(listener);
  }

  private setState(state: ZflowRelayState): void {
    this.stateValue = state;
    this.log(`[relay] state -> ${state}`);
    for (const listener of Array.from(this.stateListeners)) listener(state);
  }

  private emitFailure(failure: ZflowRelayFailure): void {
    this.failureValue = failure;
    for (const listener of Array.from(this.failureListeners)) listener(failure);
  }

  start(): Promise<void> {
    this.disposed = false;
    this.intentionallyClosed = false;
    this.reconnectAttempt = 0;
    this.failureValue = null;
    this.setState("connecting");
    return this.connect();
  }

  private connect(): Promise<void> {
    const inFlight = this.connectInFlight;
    if (inFlight) return inFlight;
    const future = this.connectOnce().catch((error: unknown) => {
      if (!this.disposed)
        this.fail(
          error instanceof Error && error.message === "auth-required"
            ? "auth-required"
            : "relay-unavailable",
        );
    });
    this.connectInFlight = future;
    void future.then(() => {
      if (this.connectInFlight === future) this.connectInFlight = null;
    });
    return future;
  }

  private async connectOnce(): Promise<void> {
    const generation = ++this.socketGeneration;
    this.wire.reset();
    this.timers.cancelHandshake();
    const oldSocket = this.socket;
    this.socket = null;
    if (oldSocket) {
      try {
        oldSocket.close();
      } catch {
        // 关闭旧 socket 的异常不影响新连接。
      }
    }
    // 对齐官方 reconnectNow()：新 socket 从新的活性窗口起算，否则重连后
    // 第一跳看到陈旧时钟会立刻再次拆链。
    this.lastPairStatusAckAt = this.time.now();
    this.lastInboundAt = this.time.now();
    // holder 供回调守卫核对 socket 身份（对齐 Dart 的 identical 检查）；
    // 接线与赋值在同一 tick，之间不可能有回调插入。
    let url = this.params.relayWsUrl;
    if (!this.getTerminalToken) throw new Error("auth-required");
    const token = await this.getTerminalToken();
    if (this.disposed || generation !== this.socketGeneration) return;
    url += `${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
    const holder: { socket: ZflowSocketLike | null } = { socket: null };
    const socket = await openRelaySocket({
      url,
      factory: this.socketFactory,
      log: (line) => this.log(line),
      handlers: {
        isCurrent: () =>
          !this.disposed && generation === this.socketGeneration && this.socket === holder.socket,
        onMessage: (data) => this.handleRawMessage(data, generation),
        onClose: (code, reason) => this.handleSocketClosed(code, reason, generation),
        onError: () => this.log("[relay] socket error"),
      },
    });
    if (!socket) {
      if (!this.disposed && generation === this.socketGeneration) {
        this.handleSocketClosed(1006, "connect failed", generation);
      }
      return;
    }
    if (this.disposed || generation !== this.socketGeneration) return;
    this.socket = socket;
    holder.socket = socket;
    this.setState("authenticating");
    this.timers.startHandshake(() => this.fail("auth-timeout"));
    this.send(
      this.wire.init(
        {
          platform: this.params.platformName,
          version: this.params.appVersion ?? "web",
          name: this.params.deviceName || "zflow",
        },
        this.time.now(),
      ),
    );
  }

  private send(frame: Record<string, unknown>): void {
    this.socket?.send(JSON.stringify(frame));
  }

  /** 未配对期间入队，matched 后冲刷；超限丢弃。 */
  sendPayload(payload: ZflowPayload): void {
    if (this.stateValue !== "paired" || !this.socket) {
      if (!this.queue.enqueue(payload)) {
        this.log(`[relay] dropped queued payload (limit): ${String(payload.zcode_type)}`);
      }
      return;
    }
    this.send(this.wire.data(payload, this.time.now()));
  }

  /** 取消一个尚未离开 relay 的排队请求（已写 socket 的无法撤回）。 */
  cancelQueuedRequest(requestId: string): void {
    if (this.queue.cancel(requestId)) {
      this.log(`[relay] dropped timed-out queued request ${requestId}`);
    }
  }

  private flushOutboundQueue(): void {
    const payloads = this.queue.drain();
    if (payloads.length === 0) return;
    this.log(`[relay] flushing ${payloads.length} queued payload(s)`);
    for (const payload of payloads) this.send(this.wire.data(payload, this.time.now()));
  }

  private handleRawMessage(data: string, generation: number): void {
    if (generation !== this.socketGeneration) return;
    this.lastInboundAt = this.time.now();
    dispatchRelayMessage(data, this.wire, this.stateValue, this.time.now(), {
      send: (frame) => this.send(frame),
      status: (value) => {
        this.timers.cancelHandshake();
        this.applyPairStatus(value);
      },
      payload: (value) => {
        for (const listener of Array.from(this.payloadListeners)) listener(value);
      },
      error: (code, message) => this.handleRelayError(code, message),
      log: (line) => this.log(line),
    });
  }

  private applyPairStatus(status: string | null): void {
    this.lastPairStatusAckAt = this.time.now();
    this.timers.resetStaleProbe();
    if (status === "waiting") {
      if (this.wasPaired) {
        this.timers.clearWaitingTimers();
        this.setState("waiting");
        this.timers.startHeartbeat();
        this.timers.startRewaitTimer();
      } else {
        this.setState("waiting");
        this.timers.startWaitingTimer();
      }
      return;
    }
    if (status === "matched") {
      this.timers.clearWaitingTimers();
      this.reconnectAttempt = 0;
      this.setState("paired");
      this.wasPaired = true;
      this.timers.startHeartbeat();
      this.flushOutboundQueue();
    }
  }

  private handleRelayError(code: string | null, message?: string): void {
    this.log(`[relay] error frame: ${String(code)} ${message ?? ""}`);
    if (code === "KICKED") {
      this.setState("kicked");
      this.intentionallyClosed = true;
      this.emitFailure({ reason: "kicked", message });
      try {
        this.socket?.close();
      } catch {
        // 服务器即将断开。
      }
    }
    if (code !== "KICKED") {
      if (code === "DEVICE_OFFLINE")
        this.reconnectAttempt = this.timers.scheduleReconnect(this.reconnectAttempt);
      else this.fail(code === "AUTH_FAILED" ? "auth-required" : "relay-unavailable");
    }
  }

  private fail(reason: string): void {
    this.intentionallyClosed = true;
    this.timers.cancelAll();
    this.setState("error");
    this.emitFailure({ reason });
    this.socket?.close();
  }

  private handleSocketClosed(code: number, reason: string, generation?: number): void {
    if (this.disposed || (generation !== undefined && generation !== this.socketGeneration)) return;
    this.timers.stopHeartbeat();
    this.timers.cancelHandshake();
    this.timers.clearWaitingTimers();
    const mapped = zflowRelayCloseReason(code);
    this.log(`[relay] closed code=${code} reason=${reason} mapped=${String(mapped)}`);
    if (mapped === null && !this.intentionallyClosed && code !== 1006) {
      this.log("[诊断] 关闭码不在已知映射表 — 可能是新错误语义，请导出协议日志反馈");
    }
    if (this.intentionallyClosed) return;
    if (this.wasPaired || mapped === "desktop-disconnected") {
      this.reconnectAttempt = this.timers.scheduleReconnect(this.reconnectAttempt);
      return;
    }
    this.setState("error");
    this.emitFailure({
      reason: mapped ?? "relay-unavailable",
      message: reason || `connection closed (${code})`,
    });
  }

  /** App 恢复前台时的活性动作（对齐 Dart `poke`）。 */
  poke(): void {
    if (this.disposed || this.intentionallyClosed) return;
    if (this.stateValue === "paired") {
      if (this.time.now() - this.lastInboundAt > ZFLOW_DEAD_LINK_THRESHOLD_MS) {
        this.log("[relay] poke: no inbound recently, reconnecting immediately");
        void this.reconnect();
        return;
      }
      this.send(this.wire.heartbeat(this.time.now()));
    } else if (this.stateValue === "reconnecting") {
      this.timers.cancelReconnect();
      void this.connect();
    }
  }

  private async reconnect(): Promise<void> {
    this.timers.cancelReconnect();
    // 必经 reconnecting，让桥恢复等监听方知道链路断了。
    this.setState("reconnecting");
    await this.connect();
  }

  /** 诊断：强制断开 socket 以演练重连/桥恢复路径。 */
  debugDropSocket(): void {
    this.intentionallyClosed = false;
    const socket = this.socket;
    this.socket = null;
    try {
      socket?.close(3000, "debug-drop");
    } catch {
      // 诊断探针，忽略关闭异常。
    }
    this.handleSocketClosed(1006, "debug-drop");
  }

  dispose(): void {
    this.disposed = true;
    this.intentionallyClosed = true;
    this.queue.clear();
    this.timers.cancelAll();
    try {
      this.socket?.close();
    } catch {
      // dispose 阶段忽略。
    }
    this.socket = null;
    this.setState("closed");
    this.stateListeners.clear();
    this.payloadListeners.clear();
    this.failureListeners.clear();
  }
}
