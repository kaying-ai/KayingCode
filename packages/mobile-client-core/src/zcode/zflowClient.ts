// zcode（zflow）高层门面：relay 连接 → 配对 → bootstrap → 工作区桥 → channel RPC。
//
// 对齐 Flutter lib/protocol/zflow_client.dart（web 客户端 `otn()` 流程）。
// 桥簿记（打开/换栈/降级恢复/看门狗）已拆到 zflowBridgeManager.ts，本类只做
// relay 请求/响应、入站载荷路由，以及对页面暴露的门面。会话/对话映射
// （Dart conversation.dart）属下一批。
import type { MobileConnectionParams } from "../mobileConnectionParams.js";
import type { BridgeSession } from "./bridgeSession.js";
import { ZcodeRelayClient } from "./zcodeRelayClient.js";
import { ZflowBridgeManager } from "./zflowBridgeManager.js";
import { zflowRelayWsUrl } from "./zflowParams.js";
import {
  realZflowTimePorts,
  zflowRequestId,
  type ZflowPayload,
  type ZflowRelayState,
  type ZflowSocketFactory,
  type ZflowTimePorts,
} from "./zflowTypes.js";

const RECONNECT_WORKSPACE_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 30_000;

export interface ZflowClientOptions {
  socketFactory?: ZflowSocketFactory;
  time?: ZflowTimePorts;
  onLog?: (line: string) => void;
  /** 握手 meta.platform；缺省取平台端口的 deviceInfo().platform。 */
  platformName?: string;
  appVersion?: string | null;
  getTerminalToken?: () => Promise<string>;
}

type PayloadMatcher = (payload: ZflowPayload) => boolean;

interface PendingRequest {
  matcher: PayloadMatcher;
  resolve: (payload: ZflowPayload) => void;
  reject: (error: Error) => void;
  timer: unknown;
}

export class ZflowClient {
  readonly relay: ZcodeRelayClient;
  private readonly time: ZflowTimePorts;
  private readonly log: (line: string) => void;
  private readonly randomHex: (bytes: number) => string;
  private readonly bridgeManager: ZflowBridgeManager;
  private readonly unsubscribePayload: () => void;
  private readonly unsubscribeState: () => void;

  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly workspaceListListeners = new Set<(result: unknown) => void>();
  private disposed = false;

  constructor(params: MobileConnectionParams, options: ZflowClientOptions = {}) {
    const wsUrl = zflowRelayWsUrl(params);
    this.time = options.time ?? realZflowTimePorts;
    this.log = options.onLog ?? (() => {});
    this.randomHex = (bytes) => {
      // 请求 ID 只求唯一性；直接用时间+随机退化实现，避免依赖平台端口装配顺序。
      const rand = Math.floor(Math.random() * 0xffffffff)
        .toString(16)
        .padStart(8, "0");
      return `${this.time.now().toString(16)}${rand}${bytes.toString(16)}`;
    };
    this.relay = new ZcodeRelayClient(
      {
        deviceSid: params.deviceSid ?? "",
        deviceName: params.deviceName,
        appVersion: options.appVersion ?? null,
        platformName: options.platformName ?? "web",
        relayWsUrl: wsUrl,
        protocol: params.zcodeProtocol,
      },
      {
        socketFactory: options.socketFactory,
        time: this.time,
        onLog: this.log,
        getTerminalToken: options.getTerminalToken,
      },
    );
    // 桥簿记不持有 socket：relay 能力经 hooks 注入，桥的收发都回到本类的 request/relay。
    this.bridgeManager = new ZflowBridgeManager({
      time: this.time,
      log: this.log,
      isPaired: () => this.relay.state === "paired",
      sendPayload: (payload) => this.relay.sendPayload(payload),
      request: (payload, matcher, timeoutMs) => this.request(payload, matcher, timeoutMs),
      randomHex: this.randomHex,
    });
    this.unsubscribePayload = this.relay.onPayload((payload) => this.dispatchPayload(payload));
    this.unsubscribeState = this.relay.onState((state) => this.onRelayState(state));
  }

  // ── 连接与配对 ────────────────────────────────────────────────────────

  connect(): Promise<void> {
    return this.relay.start();
  }

  /** 等 relay matched；失败原因 fail-fast（凭证/桌面/relay 错误）。 */
  waitPaired(timeoutMs = 60_000): Promise<void> {
    if (this.relay.state === "paired") return Promise.resolve();
    if (this.relay.failure) return Promise.reject(new Error(this.relay.failure.reason));
    const time = this.time;
    return new Promise<void>((resolve, reject) => {
      const timer = time.setTimeout(() => {
        cleanup();
        reject(new Error("pairing timeout"));
      }, timeoutMs);
      const onState = (state: ZflowRelayState) => {
        if (state === "paired") {
          cleanup();
          resolve();
        }
      };
      const onFailure = (failure: { reason: string; message?: string }) => {
        cleanup();
        reject(new Error(`${failure.reason}${failure.message ? `: ${failure.message}` : ""}`));
      };
      const offState = this.relay.onState(onState);
      const offFailure = this.relay.onFailure(onFailure);
      function cleanup(): void {
        time.clearTimeout(timer);
        offState();
        offFailure();
      }
    });
  }

  /** App 恢复前台时的活性动作（透传 relay.poke）。 */
  pokeRelay(): void {
    this.relay.poke();
  }

  // ── relay 载荷上的请求/响应 ───────────────────────────────────────────

  /**
   * 单次请求/响应：每个 pending matcher 对每个载荷都做匹配（web 客户端 `k()`
   * 语义——响应不保证回显 requestId），命中即完成。
   */
  request(
    payload: ZflowPayload,
    matcher: PayloadMatcher,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<ZflowPayload> {
    const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
    return new Promise<ZflowPayload>((resolve, reject) => {
      const timer = this.time.setTimeout(() => {
        this.pendingRequests.delete(requestId);
        this.relay.cancelQueuedRequest(requestId);
        reject(new Error(`request ${requestId} timed out`));
      }, timeoutMs);
      this.pendingRequests.set(requestId, { matcher, resolve, reject, timer });
      this.relay.sendPayload(payload);
    });
  }

  /** bootstrap-request → bootstrap-response（工作区总览）。 */
  async bootstrap(): Promise<Record<string, unknown>> {
    const id = zflowRequestId("bootstrap", this.randomHex);
    const res = await this.request(
      { zcode_type: "bootstrap-request", requestId: id },
      (p) => p.zcode_type === "bootstrap-response" && p.requestId === id,
    );
    return res.result !== null && typeof res.result === "object"
      ? (res.result as Record<string, unknown>)
      : res;
  }

  /** workspace-list-request → workspace-list-response。 */
  async listWorkspaces(): Promise<unknown> {
    const id = zflowRequestId("workspace-list", this.randomHex);
    const res = await this.request(
      { zcode_type: "workspace-list-request", requestId: id },
      (p) => p.zcode_type === "workspace-list-response" && p.requestId === id,
    );
    return res.result;
  }

  /** mobile-view-state-update（web 客户端 `N()`）。 */
  sendMobileViewState(options: { workspaceKey: string; taskId?: string }): void {
    this.relay.sendPayload({
      zcode_type: "mobile-view-state-update",
      viewState: {
        activeWorkspaceKey: options.workspaceKey,
        ...(options.taskId ? { activeTaskId: options.taskId } : {}),
        updatedAt: this.time.now(),
      },
      deviceInfo: {
        platform: this.relay.params.platformName,
        version: this.relay.params.appVersion ?? "web",
        name: this.relay.params.deviceName || "zflow",
      },
    });
  }

  /** workspace-reconnect-request（廉价恢复路径）。 */
  async reconnectWorkspace(workspaceKey: string): Promise<ZflowPayload> {
    const id = zflowRequestId("workspace-reconnect", this.randomHex);
    return this.request(
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
  }

  // ── 工作区桥（委托 ZflowBridgeManager） ───────────────────────────────

  /**
   * workspace-bridge-open → workspace-bridge-ready，挂 rpc-frame + channel 栈。
   * 桥簿记在 manager；manager 不发 view-state，打开成功后本类补发（取桥覆盖的
   * effectiveKey / initialTaskId，对齐 Flutter openBridge）。
   */
  async openBridge(workspaceKey: string, taskId?: string): Promise<BridgeSession> {
    const session = await this.bridgeManager.openBridge(workspaceKey, taskId);
    const bridge = session.bridge;
    const effectiveKey =
      typeof bridge.workspaceKey === "string" && bridge.workspaceKey.length > 0
        ? bridge.workspaceKey
        : workspaceKey;
    const initialTaskId = typeof bridge.initialTaskId === "string" ? bridge.initialTaskId : taskId;
    this.sendMobileViewState({
      workspaceKey: effectiveKey,
      ...(initialTaskId ? { taskId: initialTaskId } : {}),
    });
    return session;
  }

  get bridges(): readonly BridgeSession[] {
    return this.bridgeManager.bridges;
  }

  onWorkspaceListUpdated(listener: (result: unknown) => void): () => void {
    this.workspaceListListeners.add(listener);
    return () => this.workspaceListListeners.delete(listener);
  }

  // ── 载荷分发 ──────────────────────────────────────────────────────────

  private dispatchPayload(payload: ZflowPayload): void {
    const type = payload.zcode_type;
    if (type === "workspace-list-updated") {
      for (const listener of Array.from(this.workspaceListListeners)) listener(payload.result);
      return;
    }
    if (type === "bridge-degraded") {
      this.bridgeManager.handleBridgeDegraded(payload);
      return;
    }
    if (type === "rpc-frame" || type === "rpc-frame-ack") {
      this.bridgeManager.dispatchFrame(payload);
      return;
    }
    // 每个请求 matcher 对每个载荷都试一次（响应不保证回显 requestId）。
    for (const [requestId, pending] of Array.from(this.pendingRequests)) {
      if (pending.matcher(payload)) {
        this.time.clearTimeout(pending.timer);
        this.pendingRequests.delete(requestId);
        pending.resolve(payload);
      }
    }
  }

  private onRelayState(state: ZflowRelayState): void {
    this.bridgeManager.onRelayState(state);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.pendingRequests.values()) {
      this.time.clearTimeout(pending.timer);
      pending.reject(new Error("zflow client disposed"));
    }
    this.pendingRequests.clear();
    this.bridgeManager.dispose();
    this.unsubscribePayload();
    this.unsubscribeState();
    this.relay.dispose();
    this.workspaceListListeners.clear();
  }
}
