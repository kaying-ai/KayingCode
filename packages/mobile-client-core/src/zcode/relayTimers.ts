// relay 定时器簇：心跳、等待超时、重连退避。
//
// 从 zcodeRelayClient 拆出的纯调度逻辑（对齐 Flutter relay_client.dart 的
// _startHeartbeat / _startWaitingTimer / _scheduleReconnect）。状态判断经
// hooks 回调取自客户端；stale-probe 与心跳节拍计数在此持有。

export const ZFLOW_HEARTBEAT_INTERVAL_MS = 10_000;
export const ZFLOW_HEARTBEAT_ACK_TIMEOUT_MS = 30_000;
export const ZFLOW_WAITING_TIMEOUT_MS = 30_000;
export const ZFLOW_RECONNECT_WAIT_TIMEOUT_MS = 20_000;
/** 配对在线但连续无入站帧超过该阈值视为死链（poke 直接重连）。 */
export const ZFLOW_DEAD_LINK_THRESHOLD_MS = 25_000;

export interface RelayTimerHooks {
  /** 心跳只在这两个状态下跑。 */
  isPaired(): boolean;
  isWaiting(): boolean;
  /** waiting 态减半心跳（无流式流量，省手机无线电唤醒）。 */
  skipHalfBeat(tick: number): boolean;
  /** 最近一次 pair_status ack 是否超过 30s。 */
  ackStale(): boolean;
  rewaitStuck(): boolean;
  waitingTimeoutDue(): boolean;
  sendPairStatusQuery(): void;
  reconnect(): void;
  onWaitingTimeout(): void;
  enterReconnecting(): void;
  log(line: string): void;
}

export class RelayTimers {
  private hbTick = 0;
  private staleProbeSent = false;
  private heartbeatTimer: unknown = null;
  private waitingTimer: unknown = null;
  private rewaitTimer: unknown = null;
  private reconnectTimer: unknown = null;
  private handshakeTimer: unknown = null;

  startHandshake(onTimeout: () => void): void {
    this.cancelHandshake();
    this.handshakeTimer = this.time.setTimeout(onTimeout, 15_000);
  }
  cancelHandshake(): void {
    this.time.clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
  }

  constructor(
    private readonly time: ZflowTimePortsLike,
    private readonly hooks: RelayTimerHooks,
  ) {}

  resetStaleProbe(): void {
    this.staleProbeSent = false;
  }

  startHeartbeat(): void {
    this.time.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = this.time.setInterval(() => {
      const paired = this.hooks.isPaired();
      if (!paired && !this.hooks.isWaiting()) return;
      this.hbTick += 1;
      if (this.hooks.skipHalfBeat(this.hbTick)) return;
      if (this.hooks.ackStale()) {
        // 先探测再拆链：定时器冻结/短暂抖动会把活链路误判为陈旧。
        // 发一次额外查询，下一跳仍陈旧才真正重连。
        if (!this.staleProbeSent) {
          this.staleProbeSent = true;
          this.hooks.log("[relay] heartbeat stale, probing before reconnect");
          return;
        }
        this.staleProbeSent = false;
        this.hooks.log("[relay] heartbeat ack timeout, reconnecting");
        this.hooks.reconnect();
        return;
      }
      this.staleProbeSent = false;
      this.hooks.sendPairStatusQuery();
    }, ZFLOW_HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat(): void {
    this.time.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  startWaitingTimer(): void {
    this.clearWaitingTimers();
    this.waitingTimer = this.time.setTimeout(() => {
      if (this.hooks.waitingTimeoutDue()) this.hooks.onWaitingTimeout();
    }, ZFLOW_WAITING_TIMEOUT_MS);
  }

  /** 已配对过的重连本应立即 matched；服务器持续 waiting 就强制重连。 */
  startRewaitTimer(): void {
    this.time.clearTimeout(this.rewaitTimer);
    this.rewaitTimer = this.time.setTimeout(() => {
      if (this.hooks.rewaitStuck()) {
        this.hooks.log("[relay] re-pair stuck in waiting, reconnecting");
        this.hooks.reconnect();
      }
    }, ZFLOW_RECONNECT_WAIT_TIMEOUT_MS);
  }

  clearWaitingTimers(): void {
    this.time.clearTimeout(this.waitingTimer);
    this.waitingTimer = null;
    this.time.clearTimeout(this.rewaitTimer);
    this.rewaitTimer = null;
  }

  /** 指数退避重连（1s·2^attempt，夹在 1–15s，attempt 封顶 4）。返回新 attempt。 */
  scheduleReconnect(attempt: number): number {
    this.hooks.enterReconnecting();
    const clamped = Math.min(Math.max(attempt, 0), 4);
    const delayMs = Math.min(Math.max(1000 * 2 ** clamped, 1000), 15000);
    const next = attempt + 1;
    this.hooks.log(`[relay] reconnect in ${delayMs}ms (attempt ${next})`);
    this.time.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = this.time.setTimeout(() => this.hooks.reconnect(), delayMs);
    return next;
  }

  cancelReconnect(): void {
    this.time.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  cancelAll(): void {
    this.cancelHandshake();
    this.stopHeartbeat();
    this.clearWaitingTimers();
    this.cancelReconnect();
  }
}

interface ZflowTimePortsLike {
  now(): number;
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
