// IPC channel RPC 客户端。
//
// 对齐 Flutter lib/protocol/channel_client.dart（web 客户端 `Pne`）：
// 请求头数组 `[reqType, reqId, channelName, name]` + 参数值（调用为 args 数组，
// 事件订阅为自由值）；响应 `[respType, reqId]` + data。
// 桌面必须先发一条 resInitialize(200) 帧握手，call 才会真正发出。
import { ValueReader, ValueWriter, decodeValue, encodeValue } from "./valueCodec.js";
import type { ZcodeBinary } from "./zflowTypes.js";

export const CHANNEL_REQ_PROMISE = 100;
export const CHANNEL_REQ_PROMISE_CANCEL = 101;
export const CHANNEL_REQ_EVENT_LISTEN = 102;
export const CHANNEL_REQ_EVENT_DISPOSE = 103;

export const CHANNEL_RES_INITIALIZE = 200;
export const CHANNEL_RES_PROMISE_SUCCESS = 201;
export const CHANNEL_RES_PROMISE_ERROR = 202;
export const CHANNEL_RES_PROMISE_ERROR_OBJ = 203;
export const CHANNEL_RES_EVENT_FIRE = 204;

/** 桌面侧知名 channel 名（web 客户端 `Wb` 枚举），供上层按需引用。 */
export const Channels = {
  file: "file",
  system: "system",
  terminal: "terminal",
  git: "git",
  gitCheckpoint: "git-checkpoint",
  setting: "setting",
  credential: "credential",
  broadcast: "broadcast",
  zcodeTask: "zcode-task",
  kayingcodeTask: "kayingcode-task",
  kayingcodeAgent: "kayingcode-agent",
  zcodeAgent: "zcode-agent",
  zcodeSession: "zcode-session",
  fileWatcher: "file-watcher",
  oauth: "oauth",
  modelProvider: "model-provider",
  usageStats: "usage-stats",
  codingPlanSubscription: "coding-plan-subscription",
  skills: "skills",
  skillSync: "skill-sync",
  mcpSync: "mcp-sync",
  pluginSync: "plugin-sync",
  plugins: "plugins",
  pluginManagement: "plugin-management",
  subagents: "subagents",
  commands: "commands",
  hooks: "hooks",
  memory: "memory",
  outputStyle: "output-style",
  settingsSync: "settings-sync",
  bots: "bots",
  feedback: "feedback",
  repoWiki: "repo-wiki",
  promptAttachmentTransfer: "prompt-attachment-transfer",
  offPeakTask: "off-peak-task",
} as const;

export class ChannelRpcError extends Error {
  constructor(
    message: string,
    readonly data: unknown,
  ) {
    super(message);
  }
}

/** 请求/握手超时（对齐 Dart 的 `TimeoutException` 语义）。 */
export class ChannelRpcTimeoutError extends Error {}

/**
 * 把 channel 错误的 data 渲染成人类可读文案。
 *
 * JS 的 `String(obj)` 会退化成 `[object Object]`，而 Dart 的 `'$data'` 会打印
 * Map 内容（`{message: exec failed, code: 7}`）。直接 `String(data)` 会让 203
 * 分支的错误文案丢失全部信息，因此这里对普通对象显式 JSON 化；字符串/数字/布尔
 * 仍走原生字符串化，与 Dart 输出一致。
 */
function stringifyChannelValue(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export interface ChannelClientOptions {
  sendBody: (body: ZcodeBinary) => void;
  onLog?: (line: string) => void;
  mapChannelName?: (channel: string) => string;
}

interface PendingHandler {
  (type: number, data: unknown): void;
}

export class ChannelClient {
  private readonly sendBody: (body: ZcodeBinary) => void;
  private readonly onLog?: (line: string) => void;
  private readonly mapChannelName?: (channel: string) => string;

  private lastRequestId = 0;
  private initialized = false;
  private readonly initWaiters = new Set<{ resolve: () => void; cancel: () => void }>();
  private readonly handlers = new Map<number, PendingHandler>();
  private disposed = false;

  constructor(options: ChannelClientOptions) {
    this.sendBody = options.sendBody;
    this.onLog = options.onLog;
    this.mapChannelName = options.mapChannelName;
  }

  private waitForInit(timeoutMs: number): Promise<void> {
    if (this.initialized) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const waiter = { resolve, cancel: () => {} };
      const timer = setTimeout(() => {
        this.initWaiters.delete(waiter);
        reject(new ChannelRpcTimeoutError("channel init timeout (no Initialize frame from desktop)"));
      }, timeoutMs);
      waiter.cancel = () => clearTimeout(timer);
      this.initWaiters.add(waiter);
    });
  }

  /** 喂一条 channel body（rpc-frame 组装产物，value-stream；无 13 字节 IPC 帧）。 */
  handleMessage(body: ZcodeBinary): void {
    const reader = new ValueReader(body);
    let header: unknown;
    try {
      header = decodeValue(reader);
    } catch {
      return;
    }
    if (!Array.isArray(header) || header.length === 0) return;
    const type = Number(header[0]);
    if (!Number.isInteger(type)) return;
    if (type === CHANNEL_RES_INITIALIZE) {
      this.onLog?.("[ipc] initialized");
      if (!this.initialized) {
        this.initialized = true;
        for (const waiter of Array.from(this.initWaiters)) {
          waiter.cancel();
          waiter.resolve();
        }
      }
      return;
    }
    const id = Number(header[1]);
    if (!Number.isInteger(id)) return;
    let data: unknown;
    try {
      data = decodeValue(reader);
    } catch {
      data = null;
    }
    this.handlers.get(id)?.(type, data);
  }

  private sendRequest(reqType: number, id: number, channel: string, name: string, arg: unknown): void {
    if (this.disposed) return;
    const writer = new ValueWriter();
    encodeValue(writer, [
      reqType,
      id,
      this.mapChannelName ? this.mapChannelName(channel) : channel,
      name,
    ]);
    encodeValue(writer, arg);
    this.sendBody(writer.toBytes());
  }

  /** 一次 channel 调用；等待 Initialize 握手（≤30s），再等响应（≤timeout）。 */
  async call(
    channel: string,
    method: string,
    args: unknown[],
    timeoutMs = 30_000,
  ): Promise<unknown> {
    try {
      await this.waitForInit(30_000);
    } catch (error) {
      // 对齐 Flutter `TimeoutException('channel init timeout ...')`：握手超时
      // 抛超时语义的错误，退出码而不是通用 RPC 错误。
      throw new ChannelRpcTimeoutError(
        error instanceof Error ? error.message : "channel init timeout",
      );
    }
    const id = this.lastRequestId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.handlers.delete(id);
        reject(new ChannelRpcTimeoutError(`${channel}.${method} timed out`));
      }, timeoutMs);
      this.handlers.set(id, (type, data) => {
        if (type === CHANNEL_RES_PROMISE_SUCCESS) {
          this.handlers.delete(id);
          clearTimeout(timer);
          resolve(data);
          return;
        }
        if (type === CHANNEL_RES_PROMISE_ERROR) {
          // 202：data 为 Map 时取 message 字段，否则字符串化。
          // 对齐 Flutter `data is Map ? (data['message'] ?? data).toString() : '$data'`。
          this.handlers.delete(id);
          clearTimeout(timer);
          let message: string;
          if (data !== null && typeof data === "object" && !Array.isArray(data)) {
            const record = data as Record<string, unknown>;
            message = stringifyChannelValue("message" in record ? record.message : data);
          } else {
            message = stringifyChannelValue(data);
          }
          reject(new ChannelRpcError(message, data));
          return;
        }
        if (type === CHANNEL_RES_PROMISE_ERROR_OBJ) {
          // 203：整体字符串化对象（**不**取 message 字段）——对齐 Flutter
          // `ChannelRpcError('$data', data)`。Dart 的 Map 字符串化形如
          // `{message: exec failed, code: 7}`；为可读性这里用等价的 JSON 形式，
          // 但绝不能再降级成 `[object Object]`（那是 JS 默认 toString 的退化）。
          this.handlers.delete(id);
          clearTimeout(timer);
          reject(new ChannelRpcError(stringifyChannelValue(data), data));
        }
      });
      this.onLog?.(`[ipc] call ${channel}.${method} id=${id}`);
      this.sendRequest(CHANNEL_REQ_PROMISE, id, channel, method, args);
    });
  }

  /**
   * 订阅 channel 事件，返回取消函数（发 EventDispose）。
   * 对齐 Dart `addEventListener`：握手完成前只登记，握手后才真正发送。
   */
  addEventListener(
    channel: string,
    event: string,
    onEvent: (event: unknown) => void,
    arg?: unknown,
  ): () => void {
    if (this.disposed) return () => {};
    const id = this.lastRequestId++;
    this.handlers.set(id, (type, data) => {
      if (type === CHANNEL_RES_EVENT_FIRE) onEvent(data);
    });
    let cancelled = false;
    void this.waitForInit(30_000).then(() => {
      if (this.disposed || cancelled || !this.handlers.has(id)) return;
      this.onLog?.(`[ipc] listen ${channel}.${event} id=${id}`);
      this.sendRequest(CHANNEL_REQ_EVENT_LISTEN, id, channel, event, arg ?? null);
    });
    return () => {
      if (cancelled) return;
      cancelled = true;
      this.handlers.delete(id);
      if (!this.disposed) {
        this.sendRequest(CHANNEL_REQ_EVENT_DISPOSE, id, channel, event, null);
      }
    };
  }

  dispose(): void {
    this.disposed = true;
    this.handlers.clear();
    for (const waiter of Array.from(this.initWaiters)) {
      waiter.cancel();
    }
  }
}
