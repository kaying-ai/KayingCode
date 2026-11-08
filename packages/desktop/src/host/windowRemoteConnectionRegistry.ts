/* eslint-disable max-lines -- 所有 transport 生命周期共享同一个 registry 状态机，必须原子演进。 */
import {
  buildServerRemoteWorkspaceIdentity,
  buildSshRemoteHostKey,
  stripWorkspaceConnectionTargetSecrets,
  type RemoteTarget,
  type ServerRemoteInfo,
  type SourceServerArtifactPolicy,
  type WorkspaceConnectionTarget,
  type WindowHostAttachmentScope,
  type WindowHostRemoteWorkspaceDescriptor,
} from "@zcode/shared";

// 导出给 Source Server 相关 host 模块复用；本地 Remote Agent 链路只填 remoteCdn* 与 remoteCacheDir。
export interface WindowRemoteAssetDirs {
  mockCdnDir?: string;
  remoteCdnBaseUrl?: string;
  remoteCdnBaseUrls?: string[];
  remoteCacheDir?: string;
  sourceServerArtifactPolicy?: SourceServerArtifactPolicy;
}

export interface WindowRemoteConnectionCloseEvent {
  exitCode: number | null;
  signal: string | null;
  error?: string;
  // 以下字段由上游 Source Server 自动恢复策略填写；本地 Remote Agent 链路保持 undefined。
  recoverable?: boolean;
  recoveryAttempt?: number;
  recoveryLimit?: number;
  recoveryBudgetExhausted?: boolean;
  reasonCode?: string;
  retryable?: boolean;
}

export interface WindowRemoteConnectionHandle<TServices, TCapabilities = never> {
  services: TServices;
  capabilities?: TCapabilities;
  serverInfo?: ServerRemoteInfo;
  /** 本次连接直接复用已有物理连接时的实际脱敏目标；只用于描述，不是 session 持久状态。 */
  reusedConnectionTarget?: RemoteTarget;
  dispose(): void | Promise<void>;
  onDidClose?(listener: (event: WindowRemoteConnectionCloseEvent) => void): { dispose(): void };
  /**
   * 同一 Source 物理连接自动重连完成；handle 的 services/capabilities 已切到新代。
   * 本地 Remote Agent 链路没有自动重连，保持 undefined。
   */
  onDidReconnect?(listener: () => void): { dispose(): void };
}

interface WindowRemoteConnectionConnectRequest {
  target: WorkspaceConnectionTarget;
  remoteAssets: WindowRemoteAssetDirs;
  signal: AbortSignal;
  /** 用户已确认安装/更新 Source Server；只在 Server Manager 部署链路上生效。 */
  confirmSourceServerInstall?: boolean;
}

type WindowRemoteConnectionState = "connecting" | "online" | "closing" | "failed" | "disconnected";

export interface WindowRemoteLogicalSessionSnapshot {
  /** 握手确认后的稳定 Source 身份；Remote Agent 与握手前为 undefined。 */
  sourceServerId?: string;
  remoteSessionId: string;
  requestId: string;
  target: WorkspaceConnectionTarget;
  workspacePath?: string;
  workspaceIdentity?: string;
  generation: number;
  state: WindowRemoteConnectionState;
  sourceAvailability: "online" | "offline";
}

class WindowRemoteConnectCancelledError extends Error {
  constructor() {
    super("远程连接已取消");
    this.name = "WindowRemoteConnectCancelledError";
  }
}

class WindowRemoteConnectionUnavailableError extends Error {
  constructor(remoteSessionId: string) {
    super(`远程连接当前不可用，remoteSessionId=${remoteSessionId}`);
    this.name = "WindowRemoteConnectionUnavailableError";
  }
}

interface ConnectionEntry<TServices, TCapabilities> {
  key: string;
  sourceServerId?: string;
  target: WorkspaceConnectionTarget;
  state: WindowRemoteConnectionState;
  abortController: AbortController;
  sessions: Set<string>;
  ready: Promise<WindowRemoteConnectionHandle<TServices, TCapabilities>>;
  handle?: WindowRemoteConnectionHandle<TServices, TCapabilities>;
  closeSubscription?: { dispose(): void };
  reconnectSubscription?: { dispose(): void };
  /** 物理连接代际；自动重连后递增，source-settings attachment 按它判定失效。 */
  generation: number;
  disposePromise?: Promise<void>;
  disposed: boolean;
  idleTimer?: ReturnType<typeof setTimeout>;
  idleReason: string;
  workspaceKeys: Set<string>;
  runningTaskCountByWorkspaceKey: Map<string, number>;
  workspaceRuntimeByKey: Map<string, WorkspaceRuntimeState>;
}

interface RemoteWorkspaceContext {
  workspacePath: string;
  workspaceIdentity?: string;
}

interface WorkspaceRuntimeState {
  context: RemoteWorkspaceContext;
  generation: number;
  pendingReleaseGeneration?: number;
  releaseInFlight?: Promise<void>;
}

interface LogicalSession<TServices, TCapabilities> {
  remoteSessionId: string;
  requestId: string;
  target: WorkspaceConnectionTarget;
  sourceServerId?: string;
  workspacePath?: string;
  workspaceIdentity?: string;
  generation: number;
  state: WindowRemoteConnectionState;
  sourceAvailability: "online" | "offline";
  entry: ConnectionEntry<TServices, TCapabilities>;
  workspaceKey?: string;
  workspaceGeneration?: number;
  workspaceReady: Promise<void>;
  workspaceReadyState: "pending" | "ready" | "failed";
  cancelled: boolean;
  rejectCancellation: (error: WindowRemoteConnectCancelledError) => void;
  cancellation: Promise<never>;
}

/**
 * `getOnlineSource` 的结果：只暴露当前在线的 handle，不是 Source 连接的所有权凭证。
 * 调用方只能读取 services/capabilities，不能据此 disconnect 或 dispose 物理连接。
 */
export interface WindowRemoteOnlineSource<TServices, TCapabilities> {
  sourceServerId: string;
  services: TServices;
  capabilities?: TCapabilities;
  serverInfo?: ServerRemoteInfo;
  generation: number;
}

export interface WindowRemoteSessionReconnectEvent<TServices> {
  previous: WindowRemoteLogicalSessionSnapshot;
  current: WindowRemoteLogicalSessionSnapshot;
  services: TServices;
  /** 新 session 仍是当前 owner 时才允许提交对外状态。 */
  isCurrent: () => boolean;
  /** 提交新 generation；返回 false 表示已失去 owner，调用方必须放弃。 */
  commit: () => boolean;
}

function normalizeWslSegment(value: string | undefined): string {
  return value?.trim() || "<default>";
}

/**
 * 只有 Remote Agent（SSH tunnel 到已运行 Agent Core）才有 workspace allowlist/catalog；
 * Source Server 的 serverInfo.workspaces 是声明列表，不能当成 attachment 白名单。
 */
function isRemoteAgentTarget(target: WorkspaceConnectionTarget): boolean {
  return target.kind === "server" && "ssh" in target;
}

function buildConnectionKey(target: WorkspaceConnectionTarget, remoteSessionId: string): string {
  switch (target.kind) {
    case "ssh":
      return `ssh:${buildSshRemoteHostKey(target)}`;
    case "wsl":
      return `wsl:${normalizeWslSegment(target.distro)}\0${normalizeWslSegment(target.user)}`;
    case "docker":
      // Docker 保持现有 dedicated logical session 生命周期，不按 target 复用。
      return `${target.kind}:dedicated:${remoteSessionId}`;
    case "server":
      return "ssh" in target
        ? `server:${buildSshRemoteHostKey({ kind: "ssh", ...target.ssh })}:${target.serverPort ?? "discover"}`
        : `server:${target.serverId ?? target.url}`;
  }
}

function toSessionSnapshot<TServices, TCapabilities>(
  session: LogicalSession<TServices, TCapabilities>,
): WindowRemoteLogicalSessionSnapshot {
  return {
    remoteSessionId: session.remoteSessionId,
    requestId: session.requestId,
    target: stripWorkspaceConnectionTargetSecrets(session.target),
    ...(session.sourceServerId ? { sourceServerId: session.sourceServerId } : {}),
    ...(session.workspacePath ? { workspacePath: session.workspacePath } : {}),
    ...(session.workspaceIdentity ? { workspaceIdentity: session.workspaceIdentity } : {}),
    generation: session.generation,
    state: session.state,
    sourceAvailability: session.sourceAvailability,
  };
}

export function createWindowRemoteConnectionRegistry<TServices, TCapabilities = never>(options: {
  connect: (
    request: WindowRemoteConnectionConnectRequest,
  ) => Promise<WindowRemoteConnectionHandle<TServices, TCapabilities>>;
  createId: () => string;
  onSessionClosed?: (event: WindowRemoteConnectionCloseEvent & { remoteSessionId: string }) => void;
  /** 物理连接自动重连后为离线 logical session 发布下一代；缺失时直接提交新 session。 */
  onSessionReconnected?: (
    event: WindowRemoteSessionReconnectEvent<TServices>,
  ) => Promise<void> | void;
  onSessionReconnectError?: (error: unknown) => void;
  /** 同一 Source 只允许一个在线 owner；用于把 source-settings / bots 解析到当前代。 */
  resolveSourceServerId?: (
    handle: WindowRemoteConnectionHandle<TServices, TCapabilities>,
  ) => string | undefined;
  /** Source 常驻连接不随最后一个 logical session 关闭；物理连接由 SourceServerConnectionManager 持有。 */
  shouldKeepConnectionAlive?: (
    handle: WindowRemoteConnectionHandle<TServices, TCapabilities>,
  ) => boolean;
  releaseWorkspace?: (services: TServices, context: RemoteWorkspaceContext) => Promise<void>;
  onWorkspaceReleaseError?: (context: RemoteWorkspaceContext, error: unknown) => void;
  wslIdleTtlMs?: number;
}) {
  const entriesByKey = new Map<string, ConnectionEntry<TServices, TCapabilities>>();
  const entriesBySourceServerId = new Map<string, ConnectionEntry<TServices, TCapabilities>>();
  const sessionsById = new Map<string, LogicalSession<TServices, TCapabilities>>();
  const pendingSessionsByRequestId = new Map<string, LogicalSession<TServices, TCapabilities>>();
  let disposed = false;
  let disposePromise: Promise<void> | null = null;
  const wslIdleTtlMs = options.wslIdleTtlMs ?? 60_000;

  function shouldKeepConnectionAlive(entry: ConnectionEntry<TServices, TCapabilities>): boolean {
    return Boolean(entry.handle && options.shouldKeepConnectionAlive?.(entry.handle));
  }

  function removeEntryOwners(entry: ConnectionEntry<TServices, TCapabilities>): void {
    if (entriesByKey.get(entry.key) === entry) {
      entriesByKey.delete(entry.key);
    }
    if (entry.sourceServerId && entriesBySourceServerId.get(entry.sourceServerId) === entry) {
      entriesBySourceServerId.delete(entry.sourceServerId);
    }
  }

  function clearIdleTimer(entry: ConnectionEntry<TServices, TCapabilities>): void {
    if (!entry.idleTimer) {
      return;
    }
    clearTimeout(entry.idleTimer);
    entry.idleTimer = undefined;
  }

  function hasRunningTasks(entry: ConnectionEntry<TServices, TCapabilities>): boolean {
    return Array.from(entry.runningTaskCountByWorkspaceKey.values()).some((count) => count > 0);
  }

  function sessionOwnsWorkspace(
    session: LogicalSession<TServices, TCapabilities>,
    entry: ConnectionEntry<TServices, TCapabilities>,
    workspaceKey: string,
  ): boolean {
    return (
      !session.cancelled &&
      session.entry === entry &&
      session.workspaceKey === workspaceKey &&
      sessionsById.get(session.remoteSessionId) === session
    );
  }

  function hasOtherWorkspaceOwner(
    entry: ConnectionEntry<TServices, TCapabilities>,
    workspaceKey: string,
    excludedRemoteSessionId: string,
  ): boolean {
    return Array.from(sessionsById.values()).some(
      (candidate) =>
        candidate.remoteSessionId !== excludedRemoteSessionId &&
        sessionOwnsWorkspace(candidate, entry, workspaceKey),
    );
  }

  function startWorkspaceRelease(
    entry: ConnectionEntry<TServices, TCapabilities>,
    workspaceKey: string,
    state: WorkspaceRuntimeState,
    generation: number,
  ): Promise<void> | undefined {
    if (
      entry.target.kind !== "wsl" ||
      state.generation !== generation ||
      state.releaseInFlight ||
      !entry.handle ||
      entry.state !== "online" ||
      !options.releaseWorkspace
    ) {
      return state.releaseInFlight;
    }
    state.pendingReleaseGeneration = undefined;
    const release = options
      .releaseWorkspace(entry.handle.services, state.context)
      .catch((error) => {
        options.onWorkspaceReleaseError?.(state.context, error);
        throw error;
      })
      .finally(() => {
        if (state.releaseInFlight === release) {
          state.releaseInFlight = undefined;
        }
        if (
          state.generation === generation &&
          !state.pendingReleaseGeneration &&
          !Array.from(sessionsById.values()).some((candidate) =>
            sessionOwnsWorkspace(candidate, entry, workspaceKey),
          )
        ) {
          entry.workspaceRuntimeByKey.delete(workspaceKey);
        }
      });
    // release 由 dispose/running-task 事件触发；失败由结构化回调记录，同时保留 rejecting
    // Promise 给同 workspace 的下一代 acquire，使其 fail-closed 而不是踩过未完成清理。
    void release.catch(() => undefined);
    state.releaseInFlight = release;
    return release;
  }

  function requestWorkspaceRelease(params: {
    entry: ConnectionEntry<TServices, TCapabilities>;
    remoteSessionId: string;
    workspaceKey?: string;
    workspaceGeneration?: number;
  }): Promise<void> | undefined {
    const { entry, workspaceKey, workspaceGeneration } = params;
    if (entry.target.kind !== "wsl" || !workspaceKey || !workspaceGeneration) {
      return undefined;
    }
    if (hasOtherWorkspaceOwner(entry, workspaceKey, params.remoteSessionId)) {
      return undefined;
    }
    const state = entry.workspaceRuntimeByKey.get(workspaceKey);
    if (!state || state.generation !== workspaceGeneration) {
      return undefined;
    }
    if ((entry.runningTaskCountByWorkspaceKey.get(workspaceKey) ?? 0) > 0) {
      state.pendingReleaseGeneration = workspaceGeneration;
      return undefined;
    }
    return startWorkspaceRelease(entry, workspaceKey, state, workspaceGeneration);
  }

  function prepareWorkspaceRuntime(
    session: LogicalSession<TServices, TCapabilities>,
  ): Promise<void> {
    if (session.entry.target.kind !== "wsl" || !session.workspacePath || !session.workspaceKey) {
      session.workspaceReadyState = "ready";
      session.workspaceReady = Promise.resolve();
      return session.workspaceReady;
    }
    const workspaceKey = session.workspaceKey;
    const entry = session.entry;
    const existing = entry.workspaceRuntimeByKey.get(workspaceKey);
    const hasOtherOwner = hasOtherWorkspaceOwner(entry, workspaceKey, session.remoteSessionId);
    const state =
      existing ??
      ({
        context: {
          workspacePath: session.workspacePath,
          ...(session.workspaceIdentity ? { workspaceIdentity: session.workspaceIdentity } : {}),
        },
        generation: 0,
      } satisfies WorkspaceRuntimeState);
    entry.workspaceRuntimeByKey.set(workspaceKey, state);
    state.context = {
      workspacePath: session.workspacePath,
      ...(session.workspaceIdentity ? { workspaceIdentity: session.workspaceIdentity } : {}),
    };
    if (!hasOtherOwner) {
      state.generation += 1;
      // 上一代 release 仍因 running task 等待时，新 logical owner 已重新持有
      // workspace；尚未开始的旧 release 必须失效，不能在 task 归零后误清新 runtime。
    }
    state.pendingReleaseGeneration = undefined;
    session.workspaceGeneration = state.generation;
    session.workspaceReadyState = "pending";
    const releaseToWait = state.releaseInFlight;
    const ready = (releaseToWait ?? Promise.resolve())
      .then(() => {
        if (
          sessionsById.get(session.remoteSessionId) !== session ||
          session.cancelled ||
          entry.workspaceRuntimeByKey.get(workspaceKey)?.generation !== session.workspaceGeneration
        ) {
          throw new WindowRemoteConnectCancelledError();
        }
        session.workspaceReadyState = "ready";
      })
      .catch((error) => {
        session.workspaceReadyState = "failed";
        throw error;
      });
    session.workspaceReady = ready;
    return ready;
  }

  function scheduleWslIdleDispose(
    entry: ConnectionEntry<TServices, TCapabilities>,
    reason: string,
  ): void {
    clearIdleTimer(entry);
    entry.idleReason = reason;
    if (
      entry.target.kind !== "wsl" ||
      entry.disposed ||
      entry.sessions.size > 0 ||
      hasRunningTasks(entry)
    ) {
      return;
    }
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = undefined;
      if (
        entriesByKey.get(entry.key) !== entry ||
        entry.disposed ||
        entry.sessions.size > 0 ||
        hasRunningTasks(entry)
      ) {
        return;
      }
      void disposeEntry(entry);
    }, wslIdleTtlMs);
  }

  async function disposeEntry(entry: ConnectionEntry<TServices, TCapabilities>): Promise<void> {
    if (entry.disposePromise) {
      return entry.disposePromise;
    }
    entry.disposed = true;
    clearIdleTimer(entry);
    entry.state = "closing";
    entry.abortController.abort();
    entry.closeSubscription?.dispose();
    entry.closeSubscription = undefined;
    entry.reconnectSubscription?.dispose();
    entry.reconnectSubscription = undefined;
    removeEntryOwners(entry);
    entry.disposePromise = Promise.resolve(entry.handle?.dispose()).then(() => undefined);
    return entry.disposePromise;
  }

  function handleConnectionClosed(
    entry: ConnectionEntry<TServices, TCapabilities>,
    event: WindowRemoteConnectionCloseEvent,
  ): void {
    if (entry.disposed || entry.state === "closing") {
      return;
    }
    if (entry.state === "disconnected") {
      // Source Manager 会连续发布 retrying(1/3→3/3) 与终态 offline；logical session 只按
      // 真实事件继续投影，不能重置物理 owner 的回收标记。
      for (const remoteSessionId of entry.sessions) {
        const session = sessionsById.get(remoteSessionId);
        if (!session || session.state !== "disconnected") continue;
        options.onSessionClosed?.({ remoteSessionId, ...event });
      }
      if (event.recoverable !== true) {
        removeEntryOwners(entry);
        // 终态断开后不会再收到 reconnect；必须释放 handle 上的 close/reconnect 订阅。
        void disposeEntry(entry);
      }
      return;
    }
    entry.state = "disconnected";
    clearIdleTimer(entry);
    // Source 常驻连接在可恢复断开期间保留 entry，等待 Manager 发布重连；终态或非常驻连接立即让出 key。
    if (event.recoverable !== true) {
      removeEntryOwners(entry);
      void disposeEntry(entry);
    } else if (!shouldKeepConnectionAlive(entry)) {
      removeEntryOwners(entry);
    }
    for (const remoteSessionId of entry.sessions) {
      const session = sessionsById.get(remoteSessionId);
      if (!session) {
        continue;
      }
      session.state = "disconnected";
      session.sourceAvailability = "offline";
      options.onSessionClosed?.({ remoteSessionId, ...event });
    }
  }

  /**
   * 物理 Source 自动重连后为仍处于 disconnected 的 logical session 发布下一代 id。
   * 旧 attachment 持有上一代 services，必须由 onSessionReconnected 完成 Controller/端口换代，
   * 不能把新 services 静默塞回旧 session。
   */
  async function handleConnectionReconnected(
    entry: ConnectionEntry<TServices, TCapabilities>,
  ): Promise<void> {
    if (entry.disposed || !entry.handle) return;
    const currentOwner = entriesByKey.get(entry.key);
    if (currentOwner && currentOwner !== entry) {
      // 手动重连已接管同一个 connection key；旧 wrapper 不能再发布换代，否则会和
      // 新 entry 的 logical session 互相覆盖。这里只释放订阅，物理 Source 仍归 Manager。
      await disposeEntry(entry);
      return;
    }
    entry.generation += 1;
    entry.state = "online";
    entriesByKey.set(entry.key, entry);
    if (entry.sourceServerId) {
      entriesBySourceServerId.set(entry.sourceServerId, entry);
    }
    const previousSessions: Array<LogicalSession<TServices, TCapabilities>> = [];
    for (const remoteSessionId of entry.sessions) {
      const session = sessionsById.get(remoteSessionId);
      if (session && session.state === "disconnected") previousSessions.push(session);
    }
    for (const previous of previousSessions) {
      const current: LogicalSession<TServices, TCapabilities> = {
        ...previous,
        remoteSessionId: options.createId(),
        generation: previous.generation + 1,
        state: "connecting",
        sourceAvailability: "offline",
        workspaceReady: Promise.resolve(),
        workspaceReadyState: "pending",
        cancelled: false,
        rejectCancellation: () => undefined,
        cancellation: new Promise<never>(() => undefined),
      };
      entry.sessions.delete(previous.remoteSessionId);
      sessionsById.delete(previous.remoteSessionId);
      entry.sessions.add(current.remoteSessionId);
      sessionsById.set(current.remoteSessionId, current);
      const isCurrent = () =>
        sessionsById.get(current.remoteSessionId) === current && !entry.disposed;
      let committed = false;
      const commit = () => {
        if (committed || !isCurrent()) return false;
        committed = true;
        current.state = "online";
        current.sourceAvailability = "online";
        return true;
      };
      try {
        if (options.onSessionReconnected) {
          await options.onSessionReconnected({
            previous: toSessionSnapshot(previous),
            current: toSessionSnapshot(current),
            services: entry.handle.services,
            isCurrent,
            commit,
          });
        } else {
          commit();
        }
        if (!committed) {
          restoreDisconnectedSession(entry, previous, current);
        }
      } catch (error) {
        restoreDisconnectedSession(entry, previous, current);
        options.onSessionReconnectError?.(error);
      }
    }
  }

  /** 换代失败时回滚到上一代断开 session，Renderer 仍可看到可恢复的离线 owner。 */
  function restoreDisconnectedSession(
    entry: ConnectionEntry<TServices, TCapabilities>,
    previous: LogicalSession<TServices, TCapabilities>,
    current: LogicalSession<TServices, TCapabilities>,
  ): void {
    if (sessionsById.get(current.remoteSessionId) === current) {
      sessionsById.delete(current.remoteSessionId);
    }
    entry.sessions.delete(current.remoteSessionId);
    if (sessionsById.has(previous.remoteSessionId)) return;
    previous.state = "disconnected";
    previous.sourceAvailability = "offline";
    sessionsById.set(previous.remoteSessionId, previous);
    entry.sessions.add(previous.remoteSessionId);
  }

  function createEntry(params: {
    key: string;
    target: WorkspaceConnectionTarget;
    remoteAssets: WindowRemoteAssetDirs;
    confirmSourceServerInstall?: boolean;
  }): ConnectionEntry<TServices, TCapabilities> {
    const abortController = new AbortController();
    const entry: ConnectionEntry<TServices, TCapabilities> = {
      key: params.key,
      target: params.target,
      state: "connecting" as const,
      abortController,
      sessions: new Set<string>(),
      ready: Promise.resolve(undefined as never),
      generation: 1,
      disposed: false,
      idleReason: "wsl-host-idle",
      workspaceKeys: new Set(),
      runningTaskCountByWorkspaceKey: new Map(),
      workspaceRuntimeByKey: new Map(),
    };
    entry.ready = options
      .connect({
        target: params.target,
        remoteAssets: params.remoteAssets,
        signal: abortController.signal,
        ...(params.confirmSourceServerInstall ? { confirmSourceServerInstall: true } : {}),
      })
      .then(async (handle) => {
        entry.handle = handle;
        if (entry.disposed || entry.sessions.size === 0) {
          // 底层 SSH/WSL connector 可能无法中断认证或部署。
          // 最后一个 logical owner 取消后，迟到的成功结果必须立即释放，不能复活旧连接。
          await disposeEntry(entry);
          return handle;
        }
        entry.state = "online";
        const sourceServerId = options.resolveSourceServerId?.(handle);
        if (sourceServerId) {
          entry.sourceServerId = sourceServerId;
          // 同一 Source 的在线 owner 归唯一 entry；后到的 duplicate 不抢占在线表。
          const existing = entriesBySourceServerId.get(sourceServerId);
          if (!existing || existing.disposed || existing.state !== "online") {
            entriesBySourceServerId.set(sourceServerId, entry);
          }
        }
        entry.closeSubscription = handle.onDidClose?.((event) => {
          handleConnectionClosed(entry, event);
        });
        entry.reconnectSubscription = handle.onDidReconnect?.(() => {
          void handleConnectionReconnected(entry);
        });
        for (const remoteSessionId of entry.sessions) {
          const session = sessionsById.get(remoteSessionId);
          if (!session || session.cancelled) {
            continue;
          }
          session.state = "online";
          session.sourceAvailability = "online";
          if (entry.sourceServerId) session.sourceServerId = entry.sourceServerId;
        }
        return handle;
      })
      .catch((error) => {
        entry.state = "failed";
        removeEntryOwners(entry);
        for (const remoteSessionId of Array.from(entry.sessions)) {
          const session = sessionsById.get(remoteSessionId);
          if (!session) {
            continue;
          }
          session.state = "failed";
          session.sourceAvailability = "offline";
          sessionsById.delete(remoteSessionId);
          pendingSessionsByRequestId.delete(session.requestId);
        }
        entry.sessions.clear();
        throw error;
      });
    const previousOwner = entriesByKey.get(entry.key);
    entriesByKey.set(entry.key, entry);
    if (previousOwner && previousOwner !== entry) {
      previousOwner.abortController.abort();
      void disposeEntry(previousOwner);
    }
    return entry;
  }

  function resolveEntry(params: {
    key: string;
    target: WorkspaceConnectionTarget;
    remoteAssets: WindowRemoteAssetDirs;
    confirmSourceServerInstall?: boolean;
  }): { entry: ConnectionEntry<TServices, TCapabilities>; reused: boolean } {
    const existing = entriesByKey.get(params.key);
    if (
      existing &&
      !existing.disposed &&
      !existing.abortController.signal.aborted &&
      (existing.state === "connecting" || existing.state === "online")
    ) {
      clearIdleTimer(existing);
      // 同一 target 已有在线/在建 owner：本次 logical session 只是 join，descriptor 必须
      // 表达“复用”，不能回放首个 owner 的初次连接事实。
      return { entry: existing, reused: true };
    }
    return { entry: createEntry(params), reused: false };
  }

  async function connect(params: {
    requestId: string;
    target: WorkspaceConnectionTarget;
    remoteAssets: WindowRemoteAssetDirs;
    workspacePath?: string;
    workspaceIdentity?: string;
    confirmSourceServerInstall?: boolean;
  }): Promise<WindowHostRemoteWorkspaceDescriptor> {
    if (disposed) {
      throw new Error("窗口 Host 的远程连接 registry 已释放");
    }
    if (pendingSessionsByRequestId.has(params.requestId)) {
      throw new Error(`远程连接 requestId 重复，requestId=${params.requestId}`);
    }

    const remoteSessionId = options.createId();
    const key = buildConnectionKey(params.target, remoteSessionId);
    const { entry, reused: joinedExistingEntry } = resolveEntry({
      key,
      target: params.target,
      remoteAssets: params.remoteAssets,
      ...(params.confirmSourceServerInstall ? { confirmSourceServerInstall: true } : {}),
    });
    let rejectCancellation!: (error: WindowRemoteConnectCancelledError) => void;
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
    });
    const session: LogicalSession<TServices, TCapabilities> = {
      remoteSessionId,
      requestId: params.requestId,
      target: params.target,
      ...(params.workspacePath ? { workspacePath: params.workspacePath } : {}),
      ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
      generation: 1,
      state: entry.state === "online" ? "online" : "connecting",
      sourceAvailability: entry.state === "online" ? "online" : "offline",
      entry,
      workspaceReady: Promise.resolve(),
      workspaceReadyState: "pending",
      cancelled: false,
      rejectCancellation,
      cancellation,
    };
    entry.sessions.add(remoteSessionId);
    const initialWorkspaceKey = params.workspaceIdentity?.trim() || params.workspacePath;
    if (initialWorkspaceKey) {
      entry.workspaceKeys.add(initialWorkspaceKey);
      session.workspaceKey = initialWorkspaceKey;
    }
    sessionsById.set(remoteSessionId, session);
    pendingSessionsByRequestId.set(params.requestId, session);

    try {
      const handle = await Promise.race([entry.ready, cancellation]);
      if (
        params.target.kind === "server" &&
        handle.serverInfo &&
        isRemoteAgentTarget(params.target)
      ) {
        const selected = params.workspaceIdentity
          ? handle.serverInfo.workspaces.find(
              (workspace) => workspace.workspaceIdentity === params.workspaceIdentity,
            )
          : handle.serverInfo.workspaces[0];
        if (!selected) {
          throw new Error("请求的 workspace 不在远程 Agent Server allowlist 中");
        }
        if (selected.access !== "read-write") {
          throw new Error("当前 Desktop Agent 会话不支持只读 workspace");
        }
        if (params.workspacePath && params.workspacePath !== selected.path) {
          throw new Error("远程 Agent workspace path 与 Server catalog 不一致");
        }
        session.workspacePath = selected.path;
        session.workspaceIdentity = selected.workspaceIdentity;
        session.workspaceKey = selected.workspaceIdentity;
        entry.workspaceKeys.add(selected.workspaceIdentity);
      }
      if (
        params.target.kind === "server" &&
        entry.sourceServerId &&
        session.workspacePath &&
        !session.workspaceIdentity &&
        !isRemoteAgentTarget(params.target)
      ) {
        // 受管 Source 的稳定身份由握手 serverId + canonical path 构造。首次连接时
        // Main 只传 workspacePath；若不在这里补 identity，RemoteWorkspaceConnected
        // descriptor 就缺少 workspace scope，Renderer attachment 无法建立。
        session.workspaceIdentity = buildServerRemoteWorkspaceIdentity({
          serverId: entry.sourceServerId,
          workspacePath: session.workspacePath,
        });
        session.workspaceKey = session.workspaceIdentity;
        entry.workspaceKeys.add(session.workspaceIdentity);
      }
      await Promise.race([prepareWorkspaceRuntime(session), cancellation]);
      if (session.cancelled || !sessionsById.has(remoteSessionId)) {
        throw new WindowRemoteConnectCancelledError();
      }
      session.state = "online";
      session.sourceAvailability = "online";
      if (entry.sourceServerId) session.sourceServerId = entry.sourceServerId;
      const strippedTarget = stripWorkspaceConnectionTargetSecrets(params.target);
      // join 已存在的 online/connecting owner 属于复用；首个 owner 仍以 Manager 是否复用为准。
      // Remote Agent 目标没有稳定 Source 身份，不参与复用描述。
      const reusedConnectionTarget =
        joinedExistingEntry && !isRemoteAgentTarget(params.target)
          ? (strippedTarget as RemoteTarget)
          : entry.handle?.reusedConnectionTarget;
      return {
        remoteSessionId,
        target: strippedTarget,
        ...(reusedConnectionTarget ? { reusedConnectionTarget } : {}),
        ...(entry.sourceServerId ? { sourceServerId: entry.sourceServerId } : {}),
        ...(handle.serverInfo ? { serverInfo: handle.serverInfo } : {}),
        ...(session.workspacePath ? { workspacePath: session.workspacePath } : {}),
        ...(session.workspaceIdentity ? { workspaceIdentity: session.workspaceIdentity } : {}),
        generation: session.generation,
      };
    } catch (error) {
      if (sessionsById.get(remoteSessionId) === session) {
        sessionsById.delete(remoteSessionId);
        entry.sessions.delete(remoteSessionId);
        session.state = "failed";
        session.sourceAvailability = "offline";
        if (entry.sessions.size === 0 && entry.target.kind === "docker") {
          await disposeEntry(entry);
        }
      }
      throw error;
    } finally {
      if (pendingSessionsByRequestId.get(params.requestId) === session) {
        pendingSessionsByRequestId.delete(params.requestId);
      }
    }
  }

  function cancelConnect(requestId: string): void {
    const session = pendingSessionsByRequestId.get(requestId);
    if (!session || session.cancelled) {
      return;
    }
    session.cancelled = true;
    pendingSessionsByRequestId.delete(requestId);
    sessionsById.delete(session.remoteSessionId);
    session.entry.sessions.delete(session.remoteSessionId);
    const workspaceRelease = requestWorkspaceRelease({
      entry: session.entry,
      remoteSessionId: session.remoteSessionId,
      workspaceKey: session.workspaceKey,
      workspaceGeneration: session.workspaceGeneration,
    });
    void workspaceRelease?.catch(() => undefined);
    session.rejectCancellation(new WindowRemoteConnectCancelledError());
    if (session.entry.sessions.size === 0) {
      if (
        (session.entry.target.kind === "ssh" || session.entry.target.kind === "server") &&
        session.entry.state === "connecting"
      ) {
        // 最后一个 waiter 取消后，旧 entry 仍以 connecting 留在复用表；立即重连会
        // 继续等待已经 aborted 的 readiness，并沿用上一次凭据。先按对象身份退休旧 entry，
        // 再触发底层取消；迟到的旧 completion 不能删除或复活同 key 的新连接。
        if (entriesByKey.get(session.entry.key) === session.entry) {
          entriesByKey.delete(session.entry.key);
        }
        session.entry.state = "closing";
        session.entry.abortController.abort();
      } else if (session.entry.target.kind === "wsl" && session.entry.state === "online") {
        scheduleWslIdleDispose(session.entry, "cancelled-logical-connect");
      } else if (session.entry.target.kind === "ssh" && session.entry.state === "online") {
        // ready SSH connection 是窗口 cache；取消一次 logical attach 不应把后续 workspace 的
        // 复用连接一并销毁，真实窗口 Host shutdown 时统一释放。
        clearIdleTimer(session.entry);
      } else if (session.entry.handle) {
        void disposeEntry(session.entry);
      }
    }
  }

  function bindWorkspaceContext(params: {
    remoteSessionId: string;
    workspacePath: string;
    workspaceIdentity: string;
  }): Promise<void> {
    const session = sessionsById.get(params.remoteSessionId);
    if (!session) {
      throw new Error(`未找到远程 logical session，remoteSessionId=${params.remoteSessionId}`);
    }
    if (session.entry.target.kind === "server" && isRemoteAgentTarget(session.entry.target)) {
      const selected = session.entry.handle?.serverInfo?.workspaces.find(
        (workspace) => workspace.workspaceIdentity === params.workspaceIdentity,
      );
      if (!selected || selected.path !== params.workspacePath) {
        throw new Error("远程 Agent workspace 与 Server catalog 不一致");
      }
      if (selected.access !== "read-write") {
        throw new Error("当前 Desktop Agent 会话不支持只读 workspace");
      }
    }
    const previousOwnership = {
      entry: session.entry,
      remoteSessionId: session.remoteSessionId,
      workspaceKey: session.workspaceKey,
      workspaceGeneration: session.workspaceGeneration,
    };
    session.workspacePath = params.workspacePath;
    session.workspaceIdentity = params.workspaceIdentity;
    session.generation += 1;
    session.workspaceKey = params.workspaceIdentity.trim() || params.workspacePath;
    session.entry.workspaceKeys.add(session.workspaceKey);
    const ready = prepareWorkspaceRuntime(session);
    if (previousOwnership.workspaceKey !== session.workspaceKey) {
      const release = requestWorkspaceRelease(previousOwnership);
      void release?.catch(() => undefined);
    }
    return ready;
  }

  function resolveScopedHandle(
    scope: WindowHostAttachmentScope,
  ): WindowRemoteConnectionHandle<TServices, TCapabilities> {
    if (scope.kind !== "remote") {
      throw new Error("远程连接 registry 不能解析 local attachment scope");
    }
    const session = sessionsById.get(scope.remoteSessionId);
    if (!session) {
      throw new WindowRemoteConnectionUnavailableError(scope.remoteSessionId);
    }
    if (
      session.workspacePath !== scope.workspacePath ||
      session.workspaceIdentity !== scope.workspaceIdentity
    ) {
      throw new Error(
        `远程 attachment scope 与 logical session 不匹配，remoteSessionId=${scope.remoteSessionId}`,
      );
    }
    if (
      session.state !== "online" ||
      session.sourceAvailability !== "online" ||
      session.workspaceReadyState !== "ready" ||
      !session.entry.handle
    ) {
      throw new WindowRemoteConnectionUnavailableError(scope.remoteSessionId);
    }
    return session.entry.handle;
  }

  function resolveScopedServices(scope: WindowHostAttachmentScope): TServices {
    return resolveScopedHandle(scope).services;
  }

  function resolveScopedCapabilities(scope: WindowHostAttachmentScope): TCapabilities | undefined {
    return resolveScopedHandle(scope).capabilities;
  }

  async function disposeSession(remoteSessionId: string): Promise<void> {
    const session = sessionsById.get(remoteSessionId);
    if (!session) {
      return;
    }
    sessionsById.delete(remoteSessionId);
    pendingSessionsByRequestId.delete(session.requestId);
    session.entry.sessions.delete(remoteSessionId);
    const workspaceRelease = requestWorkspaceRelease({
      entry: session.entry,
      remoteSessionId,
      workspaceKey: session.workspaceKey,
      workspaceGeneration: session.workspaceGeneration,
    });
    if (session.entry.sessions.size === 0) {
      if (shouldKeepConnectionAlive(session.entry)) {
        // 物理 Source 由 Manager 常驻，registry 只持有 logical lease；关掉最后一个 attachment
        // 必须释放 close/reconnect 订阅，但不能顺手断开 Manager 的在线连接。
        await disposeEntry(session.entry);
      } else if (session.entry.target.kind === "wsl" && session.entry.state === "online") {
        scheduleWslIdleDispose(session.entry, "last-logical-session-disposed");
      } else if (session.entry.target.kind === "ssh" && session.entry.state === "online") {
        // 只迁移 SSH pool 的 owner：ready connection 继续保持 window-scoped cache，
        // logical session 清空不等于连接退出；真实窗口 Host shutdown 时统一释放。
        clearIdleTimer(session.entry);
      } else {
        await disposeEntry(session.entry);
      }
    }
    await workspaceRelease?.catch(() => undefined);
  }

  /**
   * 当前在线的 Source 代际（只读）。source-settings / bots 用它按握手 serverId 定位连接，
   * 不再依赖 `target.serverId` 是否被回填；离线或已换代时返回 undefined（调用方 fail-closed）。
   */
  function getOnlineSource(
    sourceServerId: string,
  ): WindowRemoteOnlineSource<TServices, TCapabilities> | undefined {
    const entry = entriesBySourceServerId.get(sourceServerId);
    if (!entry || entry.disposed || entry.state !== "online" || !entry.handle) {
      return undefined;
    }
    return {
      sourceServerId,
      services: entry.handle.services,
      ...(entry.handle.capabilities ? { capabilities: entry.handle.capabilities } : {}),
      ...(entry.handle.serverInfo ? { serverInfo: entry.handle.serverInfo } : {}),
      generation: entry.generation,
    };
  }

  /**
   * 只建立/复用 Source 物理连接，不创建 logical session。远端项目列表的重连入口使用它：
   * 连接成功即登记 sourceServerId，后续 attachment 仍按 workspace 另开 session。
   */
  async function connectSource(params: {
    target: WorkspaceConnectionTarget;
    remoteAssets: WindowRemoteAssetDirs;
    membershipIntent?: "add" | "retain";
    existingSourceServerId?: string;
  }): Promise<WindowRemoteOnlineSource<TServices, TCapabilities>> {
    if (disposed) throw new WindowRemoteConnectCancelledError();
    if (params.existingSourceServerId) {
      const current = getOnlineSource(params.existingSourceServerId);
      if (current) return current;
    }
    const entry = resolveEntry({
      key: buildConnectionKey(params.target, ""),
      target: params.target,
      remoteAssets: params.remoteAssets,
    }).entry;
    await entry.ready;
    const owner = entry.sourceServerId ? entriesBySourceServerId.get(entry.sourceServerId) : entry;
    if (
      !owner ||
      owner.disposed ||
      owner.state !== "online" ||
      !owner.sourceServerId ||
      !owner.handle
    )
      throw new WindowRemoteConnectionUnavailableError("host-connection");
    return {
      sourceServerId: owner.sourceServerId,
      services: owner.handle.services,
      ...(owner.handle.capabilities ? { capabilities: owner.handle.capabilities } : {}),
      ...(owner.handle.serverInfo ? { serverInfo: owner.handle.serverInfo } : {}),
      generation: owner.generation,
    };
  }

  /** 只读连接快照；项目目录据此把 hostId 映射为在线/连接中/离线。 */
  function listConnections(): Array<{
    sourceServerId?: string;
    target: WorkspaceConnectionTarget;
    state: WindowRemoteConnectionState;
  }> {
    return Array.from(new Set(entriesByKey.values()), (entry) => ({
      ...(entry.sourceServerId ? { sourceServerId: entry.sourceServerId } : {}),
      target: stripWorkspaceConnectionTargetSecrets(entry.target),
      state: entry.state,
    }));
  }

  return {
    connect,
    connectSource,
    listConnections,
    cancelConnect,
    bindWorkspaceContext,
    resolveScopedServices,
    resolveScopedCapabilities,
    getOnlineSource,
    getSession(remoteSessionId: string): WindowRemoteLogicalSessionSnapshot | null {
      const session = sessionsById.get(remoteSessionId);
      return session ? toSessionSnapshot(session) : null;
    },
    listSessions(): WindowRemoteLogicalSessionSnapshot[] {
      return Array.from(sessionsById.values(), toSessionSnapshot);
    },
    findSessionForWorkspace(params: {
      workspacePath: string;
      workspaceIdentity?: string;
    }): WindowRemoteLogicalSessionSnapshot | null {
      const matches = Array.from(sessionsById.values()).filter(
        (session) =>
          session.workspacePath === params.workspacePath &&
          session.workspaceIdentity === params.workspaceIdentity,
      );
      const onlineMatches = matches.filter(
        (session) => session.state === "online" && session.sourceAvailability === "online",
      );
      if (onlineMatches.length > 1 || (onlineMatches.length === 0 && matches.length > 1)) {
        throw new Error(
          `远程 workspace scope 匹配到多个 logical session，workspacePath=${params.workspacePath}`,
        );
      }
      const match = onlineMatches[0] ?? matches[0];
      return match ? toSessionSnapshot(match) : null;
    },
    getStats(): { connectionCount: number; logicalSessionCount: number } {
      return {
        connectionCount: entriesByKey.size,
        logicalSessionCount: sessionsById.size,
      };
    },
    setWorkspaceRunningTaskCount(params: {
      workspacePath: string;
      workspaceIdentity?: string;
      runningTaskCount: number;
    }): void {
      const workspaceKey = params.workspaceIdentity?.trim() || params.workspacePath;
      for (const entry of entriesByKey.values()) {
        if (entry.target.kind !== "wsl" || !entry.workspaceKeys.has(workspaceKey)) {
          continue;
        }
        if (params.runningTaskCount > 0) {
          entry.runningTaskCountByWorkspaceKey.set(workspaceKey, params.runningTaskCount);
          clearIdleTimer(entry);
        } else {
          entry.runningTaskCountByWorkspaceKey.delete(workspaceKey);
          const state = entry.workspaceRuntimeByKey.get(workspaceKey);
          if (state?.pendingReleaseGeneration) {
            void startWorkspaceRelease(
              entry,
              workspaceKey,
              state,
              state.pendingReleaseGeneration,
            )?.catch(() => undefined);
          }
          scheduleWslIdleDispose(entry, entry.idleReason);
        }
      }
    },
    async waitForScopedServices(scope: WindowHostAttachmentScope): Promise<TServices> {
      if (scope.kind !== "remote") {
        throw new Error("远程连接 registry 不能解析 local attachment scope");
      }
      const session = sessionsById.get(scope.remoteSessionId);
      if (!session) {
        throw new WindowRemoteConnectionUnavailableError(scope.remoteSessionId);
      }
      await session.workspaceReady;
      return resolveScopedServices(scope);
    },
    disposeSession,
    async dispose(): Promise<void> {
      if (disposePromise) {
        return disposePromise;
      }
      disposed = true;
      for (const requestId of Array.from(pendingSessionsByRequestId.keys())) {
        cancelConnect(requestId);
      }
      const entries = new Set(Array.from(sessionsById.values(), (session) => session.entry));
      for (const entry of entriesByKey.values()) {
        entries.add(entry);
      }
      for (const entry of entriesBySourceServerId.values()) {
        entries.add(entry);
      }
      sessionsById.clear();
      pendingSessionsByRequestId.clear();
      disposePromise = Promise.all(Array.from(entries, disposeEntry)).then(() => undefined);
      return disposePromise;
    },
  };
}
