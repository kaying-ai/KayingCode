// 工作区桥会话：一次 workspace-bridge-open 的生命周期载体。
//
// 对齐 Flutter zflow_client.dart 的 `BridgeSession`（本批不含 attachment 收养
// 与 ConversationTransport，二者属于会话映射批次）：桥元数据、rpc-frame 传输、
// channel 客户端三件套，degraded/recovered 两个可观察状态，以及恢复期换栈。
import { ChannelClient } from "./channelClient.js";
import { RpcFrameTransport } from "./rpcFrameTransport.js";
import type { ZflowPayload } from "./zflowTypes.js";

export interface BridgeStack {
  bridge: Record<string, unknown>;
  transport: RpcFrameTransport;
  channels: ChannelClient;
}

export class BridgeSession {
  private bridgeValue: Record<string, unknown>;
  private transportValue: RpcFrameTransport;
  private channelsValue: ChannelClient;
  private disposed = false;

  /** 非 null 表示桥处于降级（rpc-transport-fault / reconnecting 等）。 */
  degraded: string | null = null;
  /** 每次桥恢复/重开自增——订阅方必须据此重订阅（旧桥的订阅状态已死）。 */
  recovered = 0;
  private readonly recoveryListeners = new Set<(generation: number) => void>();
  /** 恢复循环代数：过期信号直接作废。 */
  recoveryGeneration = 0;
  recoveryFuture: Promise<void> | null = null;

  constructor(bridge: Record<string, unknown>) {
    this.bridgeValue = bridge;
    this.transportValue = new RpcFrameTransport({
      bridgeSessionId: typeof bridge.bridgeSessionId === "string" ? bridge.bridgeSessionId : "",
      sendPayload: () => {},
    });
    this.channelsValue = new ChannelClient({ sendBody: () => {} });
  }

  get bridge(): Record<string, unknown> {
    return this.bridgeValue;
  }

  get transport(): RpcFrameTransport {
    return this.transportValue;
  }

  get channels(): ChannelClient {
    return this.channelsValue;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  onRecovered(listener: (generation: number) => void): () => void {
    this.recoveryListeners.add(listener);
    return () => this.recoveryListeners.delete(listener);
  }

  markRecovered(): void {
    if (this.disposed) return;
    this.recovered += 1;
    for (const listener of Array.from(this.recoveryListeners)) listener(this.recovered);
  }

  get workspaceKey(): string | null {
    return typeof this.bridgeValue.workspaceKey === "string" ? this.bridgeValue.workspaceKey : null;
  }

  get initialTaskId(): string | null {
    return typeof this.bridgeValue.initialTaskId === "string"
      ? this.bridgeValue.initialTaskId
      : null;
  }

  /** 恢复期把新传输栈换入同一会话（页面持有的 BridgeSession 引用不变）。 */
  swapStack(stack: BridgeStack): void {
    this.transportValue.dispose();
    this.channelsValue.dispose();
    this.bridgeValue = stack.bridge;
    this.transportValue = stack.transport;
    this.channelsValue = stack.channels;
  }

  /** 桥降级期间发送会挂到死桥上；等健康或超时（对齐 Dart `waitHealthy`）。 */
  waitHealthy(timeoutMs = 45_000): Promise<void> {
    if (this.disposed || this.degraded === null) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        clearInterval(interval);
        reject(new Error(`bridge 恢复超时: ${String(this.degraded)}`));
      }, timeoutMs);
      const interval = setInterval(() => {
        if (this.disposed || this.degraded === null) {
          clearTimeout(timer);
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });
  }

  /** 桥元数据里承载授权目标 scope 的键（恢复换栈时逐一核对）。 */
  static readonly SCOPE_KEYS = [
    "workspaceKey",
    "nodeId",
    "serverId",
    "backendType",
    "relayOrigin",
  ] as const;

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.recoveryListeners.clear();
    this.transportValue.dispose();
    this.channelsValue.dispose();
  }
}

/** 建桥所需的最小 relay 能力（zflowClient 注入）。 */
export interface BridgeTransportHooks {
  sendPayload: (payload: ZflowPayload) => void;
  onLog?: (line: string) => void;
}

/** 按桥元数据构建 rpc-frame + channel 栈。 */
export function buildBridgeStack(
  bridge: Record<string, unknown>,
  hooks: BridgeTransportHooks,
  fallbackBridgeSessionId: string,
): BridgeStack {
  const bridgeSessionId =
    typeof bridge.bridgeSessionId === "string" && bridge.bridgeSessionId.length > 0
      ? bridge.bridgeSessionId
      : fallbackBridgeSessionId;
  const transport = new RpcFrameTransport({
    bridgeSessionId,
    bridgeGeneration:
      typeof bridge.bridgeGeneration === "number" ? bridge.bridgeGeneration : undefined,
    recoveryId: typeof bridge.recoveryId === "string" ? bridge.recoveryId : undefined,
    sendPayload: hooks.sendPayload,
    onLog: hooks.onLog,
  });
  // 经 workspace 桥时每条 rpc-frame 消息就是一个 ChannelClient body
  // （value-stream）——这条路径没有 13 字节 IPC 帧。
  const channels = new ChannelClient({
    sendBody: (body) => transport.sendMessage(body),
    onLog: hooks.onLog,
  });
  transport.onMessage((message) => channels.handleMessage(message));
  return { bridge, transport, channels };
}
