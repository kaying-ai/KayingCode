// 工作区桥簿记：打开、换栈、降级恢复、看门狗。
//
// 从 zflowClient 拆出的桥生命周期管理（对齐 Flutter zflow_client.dart 的
// 桥相关部分 + web 客户端恢复路径）。relay 请求经 hooks 回调发出，
// 本模块不持有 socket。
import { BridgeSession, buildBridgeStack } from "./bridgeSession.js";
import { zflowRequestId } from "./zflowTypes.js";
import type { ZflowPayload, ZflowRelayState, ZflowTimePorts } from "./zflowTypes.js";

const BRIDGE_RECOVERY_MAX_ATTEMPTS = 15;
const BRIDGE_RECOVERY_RETRY_MS = 3_000;
const RECONNECT_WORKSPACE_TIMEOUT_MS = 15_000;
/** 桥帧看门狗：rpc-frame 静默 ≥25s 且恢复限频 ≥30s 才主动重连。 */
const WATCHDOG_INTERVAL_MS = 10_000;
const WATCHDOG_SILENCE_MS = 25_000;
const WATCHDOG_RECOVERY_MIN_GAP_MS = 30_000;

export interface ZflowBridgeManagerHooks {
  time: ZflowTimePorts;
  log: (line: string) => void;
  isPaired(): boolean;
  sendPayload: (payload: ZflowPayload) => void;
  /** relay 载荷上的 matcher 请求（zflowClient.request）。 */
  request(
    payload: ZflowPayload,
    matcher: (payload: ZflowPayload) => boolean,
    timeoutMs?: number,
  ): Promise<ZflowPayload>;
  randomHex: (bytes: number) => string;
}

interface RequestLike {
  (
    payload: ZflowPayload,
    matcher: (p: ZflowPayload) => boolean,
    timeoutMs?: number,
  ): Promise<ZflowPayload>;
}

export class ZflowBridgeManager {
  private readonly hooks: ZflowBridgeManagerHooks;
  private readonly request: RequestLike;

  private bridgeGeneration = 0;
  private readonly activeBridges = new Set<BridgeSession>();
  private readonly frameRouters = new Map<string, (payload: ZflowPayload) => void>();
  private readonly pendingBridgePayloads = new Map<string, ZflowPayload[]>();
  private needsBridgeRecovery = false;
  private lastBridgeFrameAt: number | null = null;
  private lastWatchdogRecoveryAt: number | null = null;
  private watchdogTimer: unknown = null;
  private disposed = false;

  constructor(hooks: ZflowBridgeManagerHooks) {
    this.hooks = hooks;
    this.request = hooks.request;
  }

  get bridges(): readonly BridgeSession[] {
    return [...this.activeBridges];
  }

  /** workspace-bridge-open → workspace-bridge-ready，然后挂 rpc-frame + channel 栈。 */
  async openBridge(workspaceKey: string, taskId?: string): Promise<BridgeSession> {
    const bridgeSessionId = zflowRequestId("bridge", this.hooks.randomHex);
    const generation = ++this.bridgeGeneration;
    const requestId = zflowRequestId("workspace-bridge", this.hooks.randomHex);
    const res = await this.request(
      {
        zcode_type: "workspace-bridge-open",
        requestId,
        bridgeSessionId,
        bridgeGeneration: generation,
        workspaceKey,
        ...(taskId ? { taskId } : {}),
      },
      (p) =>
        (p.zcode_type === "workspace-bridge-ready" || p.zcode_type === "workspace-bridge-error") &&
        p.bridgeSessionId === bridgeSessionId,
    );
    if (res.zcode_type === "workspace-bridge-error") {
      throw new Error(`workspace-bridge-error: ${String(res.error ?? JSON.stringify(res))}`);
    }
    const bridge = asBridge(res.bridge);
    if (typeof bridge.backendType !== "string") bridge.backendType = "zcode";
    if (typeof bridge.relayOrigin !== "string") bridge.relayOrigin = "";
    this.hooks.log(`[bridge] ready: ${JSON.stringify(bridge)}`);

    const session = new BridgeSession(bridge);
    this.attachStack(session, bridgeSessionId, bridge);
    this.activeBridges.add(session);
    this.startFrameWatchdog();
    const effectiveKey =
      typeof bridge.workspaceKey === "string" && bridge.workspaceKey.length > 0
        ? bridge.workspaceKey
        : workspaceKey;
    this.hooks.log(`[bridge] open: ${effectiveKey}`);
    return session;
  }

  /** rpc-frame / rpc-frame-ack 路由；顺带更新看门狗活性时钟。 */
  dispatchFrame(payload: ZflowPayload): void {
    this.lastBridgeFrameAt = this.hooks.time.now();
    // 桌面可能在 openBridge 的 await 续体挂上传输前就推帧（如 IPC Initialize），
    // 未注册桥的帧先缓冲、注册时冲刷。
    const id = typeof payload.bridgeSessionId === "string" ? payload.bridgeSessionId : null;
    const router = id ? this.frameRouters.get(id) : undefined;
    if (router) {
      router(payload);
    } else if (id) {
      const list = this.pendingBridgePayloads.get(id);
      if (list) list.push(payload);
      else this.pendingBridgePayloads.set(id, [payload]);
    }
  }

  /** bridge-degraded（如 rpc-transport-fault）：标降级并启动重试恢复循环。 */
  handleBridgeDegraded(payload: ZflowPayload): void {
    const bridgeSessionId =
      typeof payload.bridgeSessionId === "string" ? payload.bridgeSessionId : null;
    const reason = typeof payload.reason === "string" ? payload.reason : "unknown";
    this.hooks.log(`[bridge] degraded: ${String(bridgeSessionId)} reason=${reason}`);
    for (const session of this.activeBridges) {
      if (session.bridge.bridgeSessionId === bridgeSessionId) {
        session.degraded = reason;
        this.startBridgeRecovery(session);
      }
    }
  }

  /** relay 静默重连后所有活动桥必须恢复；重配对成功即触发。 */
  onRelayState(state: ZflowRelayState): void {
    if (state === "reconnecting" || state === "error") {
      if (this.activeBridges.size > 0) {
        this.needsBridgeRecovery = true;
        // 立刻标降级，让在途命令卡在恢复门上而不是在死 socket 上超时。
        for (const session of this.activeBridges) {
          if (session.degraded === null) session.degraded = "reconnecting";
        }
      }
      return;
    }
    if (state === "paired" && this.needsBridgeRecovery) {
      this.needsBridgeRecovery = false;
      for (const session of Array.from(this.activeBridges)) this.startBridgeRecovery(session);
    }
  }

  /** 每个桥至多一个恢复循环；突发信号不会并发重开同一桥。 */
  startBridgeRecovery(session: BridgeSession): void {
    if (session.isDisposed || session.recoveryFuture) return;
    const generation = ++session.recoveryGeneration;
    const future = this.recoverBridgeWithRetry(session, generation).catch(() => {});
    session.recoveryFuture = future;
    void future.then(() => {
      if (session.recoveryFuture === future) session.recoveryFuture = null;
    });
  }

  private recoveryIsCurrent(session: BridgeSession, generation: number): boolean {
    return !this.disposed && !session.isDisposed && generation === session.recoveryGeneration;
  }

  private async recoverBridgeWithRetry(session: BridgeSession, generation: number): Promise<void> {
    for (let attempt = 1; attempt <= BRIDGE_RECOVERY_MAX_ATTEMPTS; attempt += 1) {
      if (!this.recoveryIsCurrent(session, generation)) return;
      if (await this.recoverBridgeOnce(session, generation)) return;
      if (!this.recoveryIsCurrent(session, generation)) return;
      this.hooks.log(`[bridge] recovery attempt ${attempt} failed, retrying`);
      await sleep(this.hooks.time, BRIDGE_RECOVERY_RETRY_MS);
    }
  }

  /** 返回桥是否恢复健康。 */
  private async recoverBridgeOnce(session: BridgeSession, generation: number): Promise<boolean> {
    if (!this.recoveryIsCurrent(session, generation)) return true;
    const workspaceKey = session.workspaceKey;
    if (!workspaceKey) {
      // 没有可重连的目标；清降级让命令放行。
      session.degraded = null;
      return true;
    }
    session.degraded = "recovering";
    // 1) 廉价路径：workspace-reconnect-request（重挂桥即触发积压冲刷）。
    try {
      const id = zflowRequestId("workspace-reconnect", this.hooks.randomHex);
      const res = await this.request(
        {
          zcode_type: "workspace-reconnect-request",
          requestId: id,
          workspaceKey,
        },
        (p) =>
          p.zcode_type === "workspace-reconnect-response" &&
          p.requestId === id &&
          p.workspaceKey === workspaceKey,
        RECONNECT_WORKSPACE_TIMEOUT_MS,
      );
      if (!this.recoveryIsCurrent(session, generation)) return true;
      if (res.success === true) {
        this.hooks.log(`[bridge] reconnected ${workspaceKey}`);
        session.degraded = null;
        session.markRecovered();
        return true;
      }
    } catch (error) {
      this.hooks.log(`[bridge] reconnect-request failed: ${String(error)}`);
    }
    if (!this.recoveryIsCurrent(session, generation)) return true;
    // 2) 完整重开：新 workspace-bridge-open，把新栈换进同一 BridgeSession。
    try {
      await this.reopenBridge(session, workspaceKey, generation);
      if (!this.recoveryIsCurrent(session, generation)) return true;
      session.degraded = null;
      session.markRecovered();
      return true;
    } catch (error) {
      this.hooks.log(`[bridge] reopen failed: ${String(error)}`);
      if (this.recoveryIsCurrent(session, generation)) {
        session.degraded = `reopen-failed: ${String(error)}`;
      }
      return false;
    }
  }

  private async reopenBridge(
    session: BridgeSession,
    workspaceKey: string,
    recoveryGeneration: number,
  ): Promise<void> {
    const oldBridge = session.bridge;
    const bridgeSessionId = zflowRequestId("bridge", this.hooks.randomHex);
    const generation = ++this.bridgeGeneration;
    const requestId = zflowRequestId("workspace-bridge", this.hooks.randomHex);
    this.hooks.log(`[bridge] reopen ${workspaceKey} (gen ${generation})`);
    const res = await this.request(
      {
        zcode_type: "workspace-bridge-open",
        requestId,
        bridgeSessionId,
        bridgeGeneration: generation,
        ...(typeof oldBridge.recoveryId === "string" ? { recoveryId: oldBridge.recoveryId } : {}),
        workspaceKey,
      },
      (p) =>
        (p.zcode_type === "workspace-bridge-ready" || p.zcode_type === "workspace-bridge-error") &&
        p.bridgeSessionId === bridgeSessionId,
    );
    if (res.zcode_type === "workspace-bridge-error") {
      throw new Error(`workspace-bridge-error: ${String(res.error ?? JSON.stringify(res))}`);
    }
    if (!this.recoveryIsCurrent(session, recoveryGeneration)) return;
    const bridge = asBridge(res.bridge);
    this.attachStack(session, bridgeSessionId, bridge);
    this.hooks.log(`[bridge] reopened: ${JSON.stringify(bridge)}`);
  }

  /** 建 rpc-frame + channel 栈并挂到会话；冲刷注册前到达的缓冲帧。 */
  private attachStack(
    session: BridgeSession,
    requestedBridgeSessionId: string,
    bridge: Record<string, unknown>,
  ): void {
    // 换栈前必须先摘旧路由，否则恢复换栈后永远读旧 ID。
    const oldId =
      typeof session.bridge.bridgeSessionId === "string" ? session.bridge.bridgeSessionId : null;
    if (oldId && oldId.length > 0) {
      this.frameRouters.delete(oldId);
      this.pendingBridgePayloads.delete(oldId);
    }
    const stack = buildBridgeStack(
      bridge,
      { sendPayload: (payload) => this.hooks.sendPayload(payload), onLog: this.hooks.log },
      requestedBridgeSessionId,
    );
    session.swapStack(stack);
    const id = stack.transport.bridgeSessionId;
    this.frameRouters.set(id, (payload) => stack.transport.acceptPayload(payload));
    const pending = this.pendingBridgePayloads.get(id);
    if (pending) {
      this.pendingBridgePayloads.delete(id);
      for (const payload of pending) stack.transport.acceptPayload(payload);
    }
  }

  /**
   * 桥帧看门狗：链路活、桥冻结——pair_status_ack 每 10s 照常入站，但桌面桥的
   * 重放队列超限降级后会话帧最长冻结 45s 宽限+重建。rpc-frame 级静默是唯一
   * 可辨信号；主动 reconnectWorkspace（廉价路径）。懒启动：首个桥打开才起
   * 定时器，桥全部关闭即停。
   */
  private startFrameWatchdog(): void {
    if (this.watchdogTimer) return;
    this.watchdogTimer = this.hooks.time.setInterval(() => {
      if (this.disposed || this.activeBridges.size === 0) {
        if (this.activeBridges.size === 0) this.stopFrameWatchdog();
        return;
      }
      if (!this.hooks.isPaired()) return;
      const last = this.lastBridgeFrameAt;
      if (last === null) return;
      const silent = this.hooks.time.now() - last;
      if (silent < WATCHDOG_SILENCE_MS) return;
      if (
        this.lastWatchdogRecoveryAt !== null &&
        this.hooks.time.now() - this.lastWatchdogRecoveryAt < WATCHDOG_RECOVERY_MIN_GAP_MS
      ) {
        return;
      }
      this.lastWatchdogRecoveryAt = this.hooks.time.now();
      // 多桥场景逐个重连太重，最新打开的桥即当前工作区。
      const session = Array.from(this.activeBridges).at(-1);
      const workspaceKey = session?.workspaceKey ?? "";
      if (!workspaceKey) return;
      this.hooks.log(
        `[watchdog] 桥帧静默 ${Math.round(silent / 1000)}s，主动重连工作区 ${workspaceKey}`,
      );
      for (const active of Array.from(this.activeBridges)) this.startBridgeRecovery(active);
    }, WATCHDOG_INTERVAL_MS);
  }

  private stopFrameWatchdog(): void {
    this.hooks.time.clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  dispose(): void {
    this.disposed = true;
    this.stopFrameWatchdog();
    for (const session of this.activeBridges) {
      session.recoveryGeneration += 1;
      session.recoveryFuture = null;
      session.dispose();
    }
    this.activeBridges.clear();
    this.frameRouters.clear();
    this.pendingBridgePayloads.clear();
  }
}

function asBridge(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function sleep(time: ZflowTimePorts, ms: number): Promise<void> {
  return new Promise((resolve) => time.setTimeout(resolve, ms));
}
