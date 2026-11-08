/* eslint-disable max-lines -- 协议解析、pending request 与关闭清理共享同一连接 owner，不拆分请求生命周期。 */
import {
  kayingcodeProtocolMethods,
  sessionLifecycleParamsSchema,
  sessionLifecycleActivationParamsSchema,
  kayingcodeRuntimeCapabilitiesSchema,
  type KayingCodeWorkspaceRef,
  sessionLifecycleSnapshotSchema,
  sessionLifecycleResultSchema,
} from "@zcode/shared";
import { KayingCodeStorageStartupGate } from "#src/kayingcode-agent/kayingcodeStorageStartupGate.js";
import { Emitter } from "@zcode/rpc";
import type { IDisposable } from "@zcode/rpc";
import type {
  KayingCodeProtocolMethod,
  KayingCodeProtocolNotification,
  KayingCodeProtocolRequest,
  KayingCodeProtocolRequestId,
  KayingCodeProtocolTrace,
} from "@zcode/shared";
import type { V4Method } from "@zcode/shared/kayingcode-protocol-v4";
import type { z } from "zod";
import type { KayingCodeProtocolTransport } from "./kayingcodeProtocolTransport.js";

/** 客户端可发的方法名：旧 kayingcodeProtocolMethods + v4/*（并存，收敛为 v4）。 */
type KayingCodeProtocolClientMethod = KayingCodeProtocolMethod | V4Method;

interface KayingCodeProtocolClientOptions {
  requireStorageStartup?: boolean;
  requestTimeoutMs?: number;
}

interface KayingCodeProtocolRequestTimeoutEvent {
  method: KayingCodeProtocolClientMethod;
  requestId: KayingCodeProtocolRequestId;
  timeoutMs: number;
}

interface PendingRequest<T> {
  method: string;
  observation: boolean;
  timeout: ReturnType<typeof setTimeout>;
  resumeTimeout: () => void;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  resultSchema?: z.ZodType<T>;
  cleanupAbort?: () => void;
}

interface KayingCodeProtocolClientRequestOptions {
  /** 单 session 操作超时不能擅自回收整个 workspace；后端仍持有操作，可另行查询。 */
  invalidateConnectionOnTimeout?: boolean;
  /** 观测不得参与 runtime 健康判定或业务空闲续期；默认保持业务请求语义。 */
  lifecycle?: "operation" | "observation";
  signal?: AbortSignal;
  trace?: KayingCodeProtocolTrace;
  timeoutMs?: number;
}

const DEFAULT_KAYINGCODE_PROTOCOL_REQUEST_TIMEOUT_MS = 3 * 60_000;

class KayingCodeProtocolClientError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "KayingCodeProtocolClientError";
  }
}

export class KayingCodeProtocolRequestTimeoutError extends Error {
  constructor(
    readonly method: KayingCodeProtocolClientMethod,
    readonly requestId: KayingCodeProtocolRequestId,
    readonly timeoutMs: number,
  ) {
    super(`KayingCode Protocol request timed out: ${method}`);
    this.name = "KayingCodeProtocolRequestTimeoutError";
  }
}

export class KayingCodeProtocolClient implements IDisposable {
  /** 与已连接 workspace 的 CLI 生命周期 owner 通信；此入口不拉起或重启整个进程。 */
  readonly sessionLifecycle = {
    getState: (sessionId: string) =>
      this.request(
        kayingcodeProtocolMethods.sessionLifecycleGetState,
        sessionLifecycleParamsSchema.parse({ sessionId }),
        sessionLifecycleSnapshotSchema,
        { lifecycle: "observation" },
      ),
    ensureReady: (sessionId: string, workspace?: KayingCodeWorkspaceRef) =>
      this.requestSessionActivation(
        kayingcodeProtocolMethods.sessionLifecycleEnsureReady,
        sessionId,
        workspace,
      ),
    stop: async (sessionId: string): Promise<void> => {
      await this.request(
        kayingcodeProtocolMethods.sessionLifecycleStop,
        sessionLifecycleParamsSchema.parse({ sessionId }),
        sessionLifecycleResultSchema,
        { invalidateConnectionOnTimeout: false },
      );
    },
    restart: (sessionId: string, workspace?: KayingCodeWorkspaceRef) =>
      this.requestSessionActivation(
        kayingcodeProtocolMethods.sessionLifecycleRestart,
        sessionId,
        workspace,
      ),
  };

  private async requestSessionActivation(
    method:
      | typeof kayingcodeProtocolMethods.sessionLifecycleEnsureReady
      | typeof kayingcodeProtocolMethods.sessionLifecycleRestart,
    sessionId: string,
    workspace?: KayingCodeWorkspaceRef,
  ) {
    if (workspace) {
      // 旧 CLI 的严格参数不接受 workspace；不能退回会丢失归属的重启，也不能重启整个进程。
      const capabilities = await this.request(
        kayingcodeProtocolMethods.runtimeCapabilities,
        {},
        kayingcodeRuntimeCapabilitiesSchema,
        // 能力查询是观察请求，等待超时不能淘汰共享 CLI 连接。
        { lifecycle: "observation" },
      );
      if (!capabilities.sessionLifecycleWorkspace)
        throw new Error("fault.sessionLifecycle.unsupported");
    }
    return this.request(
      method,
      sessionLifecycleActivationParamsSchema.parse({ sessionId, workspace }),
      sessionLifecycleResultSchema,
      { invalidateConnectionOnTimeout: false },
    );
  }

  readonly storageStartup: KayingCodeStorageStartupGate;
  private readonly pending = new Map<string, PendingRequest<unknown>>();
  private readonly notificationEmitter = new Emitter<KayingCodeProtocolNotification>();
  private readonly requestEmitter = new Emitter<KayingCodeProtocolRequest>();
  private readonly requestTimeoutEmitter = new Emitter<KayingCodeProtocolRequestTimeoutEvent>();
  // 业务请求归零时触发；观测完成不能给被观察进程续命。
  private readonly pendingDrainedEmitter = new Emitter<void>();
  private readonly closeEmitter = new Emitter<void>();
  private readonly disposables: IDisposable[] = [];
  private nextRequestId = 1;
  private disposed = false;
  private readonly requestTimeoutMs: number;

  /**
   * client 是否已 dispose（进程被回收/transport 关闭后为 true）。
   * 调用方（如 getClient 复用 active entry）必须在复用前检查此标记，
   * 避免对一个已被 processManager 回收但尚未触发 onClose 的 client 发请求，
   * 否则会立即抛 "KayingCode Protocol client is disposed"。
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  readonly onNotification = this.notificationEmitter.event;
  readonly onRequest = this.requestEmitter.event;
  readonly onRequestTimeout = this.requestTimeoutEmitter.event;
  readonly onPendingRequestsDrained = this.pendingDrainedEmitter.event;
  readonly onClose = this.closeEmitter.event;

  /** 当前尚未收到响应的请求数。 */
  get pendingRequestCount(): number {
    return this.pending.size;
  }

  get pendingOperationRequestCount(): number {
    let count = 0;
    for (const pending of this.pending.values()) if (!pending.observation) count += 1;
    return count;
  }

  constructor(
    private readonly transport: KayingCodeProtocolTransport,
    options?: KayingCodeProtocolClientOptions,
  ) {
    this.storageStartup = new KayingCodeStorageStartupGate(options?.requireStorageStartup ?? false);
    this.requestTimeoutMs =
      options?.requestTimeoutMs ?? DEFAULT_KAYINGCODE_PROTOCOL_REQUEST_TIMEOUT_MS;
    this.disposables.push(
      transport.onMessage((message) => this.handleMessage(message)),
      transport.onClose((event) => {
        this.storageStartup.dispose();
        const suffix = event.reason ? `: ${event.reason}` : "";
        this.rejectAll(new Error(`KayingCode agent transport closed${suffix}`));
        this.closeEmitter.fire();
      }),
    );
  }

  get transportKind() {
    return this.transport.kind;
  }

  async request<T = unknown>(
    method: KayingCodeProtocolClientMethod,
    params?: unknown,
    resultSchema?: z.ZodType<T>,
    options?: KayingCodeProtocolClientRequestOptions,
  ): Promise<T> {
    this.assertNotDisposed();
    // 不先创建请求/启动 watchdog；只在真实 COMMIT 后进入原有协议请求生命周期。
    if (this.storageStartup.isWaiting) await this.storageStartup.wait(options?.signal);
    this.assertNotDisposed();
    options?.signal?.throwIfAborted();
    const id = this.nextRequestId++;
    const requestKey = String(id);
    const requestTimeoutMs = options?.timeoutMs ?? this.requestTimeoutMs;
    const observation = options?.lifecycle === "observation";

    const resultPromise = new Promise<T>((resolve, reject) => {
      const expire = () => {
        const pending = this.pending.get(requestKey);
        pending?.cleanupAbort?.();
        this.deletePending(requestKey);
        const error = new KayingCodeProtocolRequestTimeoutError(method, id, requestTimeoutMs);
        // 子进程仍存活但协议 event loop 已无响应时，只让单次 request 超时是不够的：
        // process manager 仍复用这个 stale client，导致后续 plugins/list 等请求连续卡在超时窗口。
        // 超时事件把“连接已不可信”的事实上抛给 owner，由 owner 负责淘汰进程。
        // 资源查询的短超时只表示本轮无数据，不能被升级成整个 Agent 的故障回收。
        if (!observation && options?.invalidateConnectionOnTimeout !== false) {
          this.requestTimeoutEmitter.fire({ method, requestId: id, timeoutMs: requestTimeoutMs });
        }
        reject(error);
      };
      const timeout = setTimeout(expire, requestTimeoutMs);

      const abortHandler = () => {
        const pending = this.pending.get(requestKey);
        if (!pending) return;
        clearTimeout(pending.timeout);
        pending.cleanupAbort?.();
        this.deletePending(requestKey);
        const reason = options?.signal?.reason;
        reject(
          reason instanceof Error ? reason : new DOMException("Request aborted", "AbortError"),
        );
      };
      const pending: PendingRequest<T> = {
        method,
        observation,
        timeout,
        resumeTimeout: () => {
          pending.timeout = setTimeout(expire, requestTimeoutMs);
        },
        resolve: resolve as (value: unknown) => void,
        reject,
        resultSchema,
        cleanupAbort: () => options?.signal?.removeEventListener("abort", abortHandler),
      };
      this.pending.set(requestKey, pending as PendingRequest<unknown>);
      if (options?.signal?.aborted) {
        abortHandler();
      } else {
        options?.signal?.addEventListener("abort", abortHandler, { once: true });
      }
    });

    // 已在发送前取消的请求不能继续写入 transport；否则服务端会执行一个客户端已经
    // 放弃、也无法接收响应的模型任务。
    if (!this.pending.has(requestKey)) {
      return resultPromise;
    }

    try {
      // 发送可能因背压而阻塞；此时 dispose/abort/超时仍会拒绝 resultPromise。
      // 同时接管两条 Promise，避免等发送结束才监听响应导致 unhandledRejection；
      // 任一失败及时向调用方传播，另一条迟到失败也由同一聚合请求接管。
      const [, result] = await Promise.all([
        this.transport.send({
          id,
          method,
          params,
          ...(options?.trace ? { trace: options.trace } : {}),
        }),
        resultPromise,
      ]);
      return result;
    } catch (error) {
      const pending = this.pending.get(requestKey);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.cleanupAbort?.();
        this.deletePending(requestKey);
      }
      throw error;
    }
  }

  async notify(method: KayingCodeProtocolClientMethod, params?: unknown): Promise<void> {
    this.assertNotDisposed();
    await this.transport.send({ method, params });
  }

  async respond(id: KayingCodeProtocolRequestId, result: unknown): Promise<void> {
    this.assertNotDisposed();
    await this.transport.send({ id, result });
  }

  async respondError(
    id: KayingCodeProtocolRequestId,
    error: { code: number; message: string; data?: unknown },
  ): Promise<void> {
    this.assertNotDisposed();
    await this.transport.send({ id, error });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.disposeLocalResources();
    this.transport.dispose();
  }

  async disposeAndWait(): Promise<void> {
    const wasDisposed = this.disposed;
    if (!wasDisposed) {
      this.disposed = true;
      this.disposeLocalResources();
    }
    if (this.transport.disposeAndWait) {
      await this.transport.disposeAndWait();
      return;
    }
    if (!wasDisposed) {
      this.transport.dispose();
    }
  }

  private handleMessage(message: unknown): void {
    if (!message || typeof message !== "object") {
      return;
    }

    if ("result" in message && "id" in message) {
      this.resolveResponse(
        (message as { id: KayingCodeProtocolRequestId; result: unknown }).id,
        (message as { result: unknown }).result,
      );
      return;
    }

    if ("error" in message && "id" in message) {
      const errorMessage = message as {
        id: KayingCodeProtocolRequestId;
        error: { code: number; message: string; data?: unknown };
      };
      this.rejectResponse(
        errorMessage.id,
        new KayingCodeProtocolClientError(
          errorMessage.error.message,
          errorMessage.error.code,
          errorMessage.error.data,
        ),
      );
      return;
    }

    if ("method" in message && "id" in message) {
      this.requestEmitter.fire(message as KayingCodeProtocolRequest);
      return;
    }

    if ("method" in message) {
      if (
        message.method === "startup/storageState" &&
        this.storageStartup.accept((message as KayingCodeProtocolNotification).params)
      ) {
        // 自定义/旧部署命令无法事先声明能力；首个请求可能已发出。只有首次合法启动帧
        // 能暂停这些计时器，ready 后恢复；该进程的终态不能被后续通知重新续期。
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timeout);
          if (this.storageStartup.snapshot?.phase === "ready") pending.resumeTimeout();
        }
        if (this.storageStartup.snapshot?.phase === "failed") {
          this.rejectAll(
            new Error(`SQLite startup failed: ${this.storageStartup.snapshot.errorCode}`),
          );
        }
      }
      this.notificationEmitter.fire(message as KayingCodeProtocolNotification);
    }
  }

  private resolveResponse(id: KayingCodeProtocolRequestId, result: unknown): void {
    const requestKey = String(id);
    const pending = this.pending.get(requestKey);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    pending.cleanupAbort?.();
    this.deletePending(requestKey);

    try {
      const parsed = pending.resultSchema ? pending.resultSchema.parse(result) : result;
      pending.resolve(parsed);
    } catch (error) {
      pending.reject(
        error instanceof Error
          ? error
          : new Error(`KayingCode Protocol response parse failed: ${pending.method}`),
      );
    }
  }

  private rejectResponse(id: KayingCodeProtocolRequestId, error: Error): void {
    const requestKey = String(id);
    const pending = this.pending.get(requestKey);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    pending.cleanupAbort?.();
    this.deletePending(requestKey);
    pending.reject(error);
  }

  private rejectAll(error: Error): void {
    const hadPending = this.pendingOperationRequestCount > 0;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.cleanupAbort?.();
      pending.reject(error);
    }
    this.pending.clear();
    if (hadPending && !this.disposed) {
      this.pendingDrainedEmitter.fire();
    }
  }

  private deletePending(requestKey: string): void {
    const pending = this.pending.get(requestKey);
    if (!this.pending.delete(requestKey)) {
      return;
    }
    if (!pending?.observation && this.pendingOperationRequestCount === 0 && !this.disposed) {
      this.pendingDrainedEmitter.fire();
    }
  }

  private disposeLocalResources(): void {
    this.rejectAll(new Error("KayingCode Protocol client disposed"));
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.storageStartup.dispose();
    this.notificationEmitter.dispose();
    this.requestEmitter.dispose();
    this.requestTimeoutEmitter.dispose();
    this.pendingDrainedEmitter.dispose();
    this.closeEmitter.dispose();
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error("KayingCode Protocol client is disposed");
    }
  }
}
