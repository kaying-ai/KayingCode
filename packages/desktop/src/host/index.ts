/* eslint-disable max-lines -- Host 入口集中编排 local/remote service wiring，本次退出保护需要在同一处桥接 host 上报。 */
/* eslint-disable max-lines -- host process 入口集中维护 local/remote 初始化和资源回收，realtime bridge 接入后先保持同文件收口。 */
/**
 * Host Process 入口 —— 每个窗口对应一个独立的 host process
 *
 * 同一窗口的 Renderer 和手机 都 attachment 到这个 Host：
 *   Renderer / Mobile ←MessagePort→ Window Host
 *                                      ├─ local services
 *                                      └─ remote connection registry
 *
 * 启动流程：
 * 1. main 进程通过 Electron `utilityProcess.fork()` 创建本进程
 * 2. main 进程只发送一次 init-local 初始化窗口 Host
 * 3. 后续远端 connect / scoped attachment 都由同一 Host 处理
 */
import { createHostDatabaseStartup } from "./database-startup/hostDatabaseStartup.js";
import { randomUUID } from "node:crypto";
import {
  MessagePortProtocol,
  ChannelServer,
  type IDisposable,
  type IChannelServer,
  LoggingChannelServer,
  NetworkTelemetryChannelServer,
} from "@zcode/rpc";
import { registerHostNetworkTelemetry, stopHostNetworkTelemetry } from "./hostNetworkTelemetry.js";
import { registerHostServiceResourceTelemetry } from "./hostServiceResourceTelemetry.js";
import { resolveResourceTelemetryEnvironmentKey } from "./hostResourceTelemetryEnvironment.js";
import { reportHostSessionCreate } from "./hostSessionCreateTelemetry.js";
import { createBrowserControlMainBridge } from "./browserControlMainBridge.js";
import { materializeBrowserRecordingArtifact } from "./browserRecordingArtifactMaterializer.js";
import {
  ServiceCollection,
  IFileService,
  IClientConfigService,
  IMediaPreviewService,
  IOffPeakTaskService,
  IModelSelectionService,
  IProjectService,
  ISettingService,
  IWindowControllerService,
  IConversationShareService,
  IKayingCodeAgentService,
  IKayingCodeTaskService,
  IKayingCodeSessionService,
  ITerminalService,
  IBroadcastService,
  IBotsService,
  ICredentialService,
  IRemoteProjectService,
  ISourceServerManagementService,
  ISourceServerWorkspaceService,
  createKayingCodeAgentConnectionScope,
  createWebRemoteProjectTreeActivityBridge,
  type BotProjectConnection,
  type IServiceAccessor,
  type KayingCodeAgentV4ClientMode,
  type RemoteProjectHost,
  collectServiceMemoryDiagnostics,
} from "@zcode/services";
import {
  createLocalServices,
  getOffPeakRequestAuthBuilder,
  disposeServiceResources,
  disposeServiceResourcesAndWait,
  createRemoteProjectConnectionAdmission,
  createRemoteIdentityRegistrationCache,
  bindRemoteProjectIdentities,
  prepareRemoteServerConnection,
  remoteProjectHostIdForProfile,
  remoteProjectHostIdForTarget,
  AutomationRepo,
  OffPeakTaskRepo,
  OffPeakTaskService,
  createServiceLogger,
  buildTaskChangeSummary,
  createHostApiNetworkTransport,
  createSettingServiceWithMigrations,
  OffPeakModelUnavailableError,
  OffPeakPermanentDispatchError,
  type HostApiNetworkTransport,
  type OffPeakRequestAuthBuilder,
} from "@zcode/services/node";
import { createHostResourceUsageResponder } from "./hostResourceUsage.js";
import { scopeConversationShareServiceForAttachment } from "./conversationShareAttachmentService.js";
import {
  assertBoundSessionDispatchable,
  resolveOffPeakDispatchKind,
} from "./offPeakDispatchPlan.js";
import {
  HostMessageTypes,
  HostResponseTypes,
  formatLogPrefix,
  formatKayingCodeHostProcessName,
  formatZodError,
  buildRemoteWorkspaceIdentity,
  buildRemoteEnvironmentKey,
  buildRemoteHostWorkspaceIdentity,
  buildServerRemoteWorkspaceIdentity,
  parseRemoteAgentWorkspaceIdentity,
  parseRemoteWorkspaceIdentity,
  remoteHostIdFromWorkspaceIdentity,
  isOffPeakTicketExpiredError,
  isRemoteWorkspaceIdentity,
  resolveWorkspaceKey,
  formatModelPickerValue,
  type KayingCodePromptAttachment,
  type KayingCodeStreamEvent,
  type KayingCodeTaskMeta,
  type TaskStreamMirrorableEvent,
  type TraceId,
  type KayingCodeTaskMode,
  type WindowHostAttachmentScope,
  type KayingCodeAutomation,
  type KayingCodeAutomationRun,
  type KayingCodeAutomationRunOutcome,
  type ModelSelection,
  type SourceServerArtifactPolicy,
  type WorkspaceConnectionTarget,
  REMOTE_BIND_CANCELED_ERROR_CODE,
  REMOTE_WORKSPACE_BIND_SESSION_MISSING_ERROR_CODE,
} from "@zcode/shared";
import {
  parseHostIncomingMessageEvent,
  rejectUnavailableAttachedServicePort,
} from "./hostMessagePortGuard.js";
// remote backend 相关模块延迟加载：ssh2 的 CJS 依赖链（asn1 等）在 asar 打包后路径断裂，
// 静态 import 会导致 local 模式的 host process 也崩溃。
// 改为动态 import，仅 remote 模式时才加载。
import type { IRemoteBackend } from "@zcode/server/remote";
import { wrapElectronPort } from "./electronPort.js";
import { createTaskRealtimeBridgeForHostInit } from "./taskRealtimeBridge.js";
import { resolveRpcLogLevel } from "./rpcLogLevel.js";
import { createHostWorkspaceTaskTracker } from "./hostWorkspaceTaskTracker.js";
import {
  createRemoteMediaPreviewProxy,
  type RemoteMediaPreviewProxy,
} from "./remoteMediaPreviewProxy.js";
import { createHostRemoteWorkspaceProxyState } from "./hostRemoteWorkspaceProxyState.js";
import {
  createServerRemoteWorkspaceServiceCollection,
  resolveServerProjectService,
} from "./remoteWorkspaceServiceCollection.js";
import { createRemoteAgentServiceCollection } from "./remoteAgentServiceCollection.js";
import { connectRemoteAgent } from "./remoteAgentConnection.js";
import { connectDesktopSourceServer } from "./connectDesktopSourceServer.js";
import { connectServerRemote } from "./serverRemoteConnection.js";
import { connectSourceServerTarget } from "./connectSourceServerTarget.js";
import { SourceServerDirectory } from "./sourceServerDirectory.js";
import { SourceServerConnectionManager } from "./sourceServerConnectionManager.js";
import {
  createSourceServerManagementService,
  type SourceServerManagementService,
} from "./sourceServerManagementService.js";
import { resolveSourceServerReleaseAsset } from "./sourceServerReleaseResolver.js";
import { createSourceServerRecoveryCloseEvent } from "./sourceServerRecoveryPolicy.js";
import { runStartupReconnectBatch } from "./sourceServerStartupReconnect.js";
import { buildRemoteConnectFailurePayload } from "./remoteConnectFailurePayload.js";
import { createWindowTopicResourceRelay } from "./windowTopicResourceRelay.js";
import {
  createSourceSettingsServiceCollection,
  shouldDetachSourceSettingsAttachment,
} from "./sourceSettingsServiceCollection.js";
import { createPluginSandboxRegistrationBridge } from "./pluginSandbox/index.js";
import { createHostNetworkCapture } from "./hostNetworkCapture.js";
import {
  createTerminalScope,
  createWindowHostTerminalOwners,
  exposeWindowHostAttachmentServices,
  registerWebRemoteProjectChannels,
} from "./windowHostAttachmentRpcPolicy.js";
import { createHostProjectWorkspaceNavigation } from "./hostProjectWorkspaceNavigation.js";
import { getRemoteProviderProvisioningExecutor } from "./remoteProviderProvisioningService.js";
import { shouldReportHostConsoleError, stringifyHostLogArg } from "./hostLog.js";
import { flushHostE2ECoverage } from "./e2eCoverage.js";
import { runHostShutdownPhases, type HostShutdownResult } from "./hostShutdownPhases.js";
import { initializeHostApiNetworkTransportOwner } from "./hostInitialization.js";
import { createHostUncaughtExceptionHandler } from "./hostUncaughtExceptionGuard.js";
import {
  recordCronRunOutcomeBestEffort,
  startManualClaimHeartbeat,
  settleCronRunTerminalOutcome,
  settleManualDispatchFailureBestEffort,
} from "./cronRunLifecycle.js";
import { createWindowHostAttachmentRegistry } from "./windowHostAttachmentRegistry.js";
import {
  createWindowRemoteConnectionRegistry,
  type WindowRemoteAssetDirs,
  type WindowRemoteConnectionCloseEvent,
  type WindowRemoteConnectionHandle,
} from "./windowRemoteConnectionRegistry.js";
import { createWindowHostControllerRuntime } from "./windowHostControllerService.js";
import { resolveBotRemoteWorkspace } from "./botRemoteWorkspaceResolver.js";
import { resolveAutomationSubmissionModelSelection } from "./automationModelSelection.js";
import { createRemoteConnectionProgressContext } from "@zcode/server/remote/remoteConnectionProgressContext.js";
import { startHostSelfResourceTelemetry } from "./hostSelfResourceTelemetry.js";
interface HostRemoteConnectionCapabilities {
  /** 握手确认的稳定 Source 身份；Remote Agent 由握手 serverInfo 回填。 */
  sourceServerId?: string;
  /**
   * 底层连接访问面；项目 legacy 单 root 面与远端 workspaceIdentity 登记复用它。
   * 受管 Source 重连后 accessor 会换代，必须按调用时读取，不能缓存对象。
   */
  sourceAccessor?: () => IServiceAccessor;
  /** Source 物理连接由 SourceServerConnectionManager 常驻，关闭 logical session 不得断开。 */
  persistentSourceConnection?: boolean;
  /** 受管 Source 的 Connection Profile；仅诊断与后续更新入口使用。 */
  profileId?: string;
  browserRecordingUploader?: Pick<IRemoteBackend, "upload">;
  remoteMediaPreviewFactory?: (
    scope: Extract<WindowHostAttachmentScope, { kind: "remote" }>,
  ) => RemoteMediaPreviewProxy;
}

let activeRemoteMediaRequests = 0;
const hostRemoteMediaRequestLimiter = {
  tryAcquire: () => {
    if (activeRemoteMediaRequests >= 4) return false;
    activeRemoteMediaRequests += 1;
    return true;
  },
  release: () => {
    activeRemoteMediaRequests = Math.max(0, activeRemoteMediaRequests - 1);
  },
  getState: () => ({ active: activeRemoteMediaRequests, limit: 4 }),
};
const remoteMediaRangePreviewEnabled =
  process.env["KAYINGCODE_REMOTE_MEDIA_RANGE_PREVIEW_ENABLED"] !== "0";

const { parentPort } = process;

/** 插件 UI 沙箱登记：Host 只持有 pending 关联，真实沙箱由 main 的 WebContentsView 创建。 */
const pluginSandboxRegistrationBridge = createPluginSandboxRegistrationBridge({
  send: (message) => {
    parentPort?.postMessage(message);
  },
});
/** 资源管理器的网络采集开关；Host 只转发，不保存历史。 */
const hostNetworkCapture = createHostNetworkCapture(parentPort);

/**
 * Source Server 连接目录与物理连接唯一所有者。
 * URL Server 直接走 registry（连接即整个 Host）；SSH/WSL/Docker 由 Manager 部署并复用物理连接。
 */
let sourceServerDirectory: SourceServerDirectory | null = null;
let sourceServerConnectionManager: SourceServerConnectionManager | null = null;
let sourceServerManagementService: SourceServerManagementService | null = null;
let sourceServerArtifactPolicy: SourceServerArtifactPolicy = "release-versioned";
/** 控制器 workspace fact 的展示名；只从 Source 目录快照更新，不参与身份判定。 */
const sourceServerDisplayNameById = new Map<string, string>();
let sourceSettingsStateSubscription: IDisposable | null = null;
interface SourceServerRuntimeDeps {
  services: ServiceCollection;
  remoteAssets: WindowRemoteAssetDirs;
  fetch: typeof fetch;
}
let sourceServerRuntimeDeps: SourceServerRuntimeDeps | null = null;
let sourceServerRuntimeInitializeFlight: Promise<SourceServerConnectionManager> | null = null;
/**
 * Workspace bind 的 request 生命周期。Main 对每个 requestId 只等待一次 ACK；
 * 取消与超时都必须走 `RemoteWorkspaceContextBindFailed`，不能静默丢弃。
 */
const activeWorkspaceBindRequestIds = new Set<string>();
const cancelledWorkspaceBindRequestIds = new Set<string>();
/** 手机 project 导航的 request 生命周期；Host 退出或 Main 取消时中止准备。 */
const projectNavigationAbortControllers = new Map<string, AbortController>();

/** Bot 只取得当前 Source 代际，不拥有连接，也不创建 logical tab。 */
function resolveBotProjectConnection(hostId: string): BotProjectConnection | undefined {
  const serverId = parseRemoteWorkspaceIdentity(
    buildRemoteHostWorkspaceIdentity(hostId, "/"),
  )?.sourceServerId;
  if (!serverId) return undefined;
  const registered = windowRemoteConnectionRegistry.getOnlineSource(serverId);
  if (registered) {
    const services = registered.services;
    const taskService = services.getOptional(IKayingCodeTaskService);
    const modelSelectionService = services.getOptional(IModelSelectionService);
    const agentService = services.getOptional(IKayingCodeAgentService);
    if (!taskService || !modelSelectionService || !agentService) return undefined;
    return {
      owner: services,
      taskService,
      modelSelectionService,
      agentService,
      bindWorkspace: async (target) => {
        await services.getOptional(ISourceServerWorkspaceService)?.resolveWorkspace({
          workspacePath: target.workspacePath,
          legacyRouteHint: target.workspaceIdentity,
        });
      },
    };
  }
  const connection = sourceServerConnectionManager?.getOnlineConnection(serverId);
  if (!connection) return undefined;
  const services = connection.services;
  if (
    !services.kayingcodeTaskService ||
    !services.modelSelectionService ||
    !services.kayingcodeAgentService
  ) {
    return undefined;
  }
  return {
    owner: services,
    taskService: services.kayingcodeTaskService,
    modelSelectionService: services.modelSelectionService,
    agentService: services.kayingcodeAgentService,
    bindWorkspace: async (target) => {
      await services.sourceServerWorkspaceService?.resolveWorkspace({
        workspacePath: target.workspacePath,
        legacyRouteHint: target.workspaceIdentity,
      });
    },
  };
}

const remoteProjectIdentityRegistrations = createRemoteIdentityRegistrationCache();

/** hostId 同时覆盖 Source（remote:server:…）与 Remote Agent（remote-agent:…）两种身份。 */
function resolveProjectHostSourceServerId(hostId: string): string | undefined {
  const identity = buildRemoteHostWorkspaceIdentity(hostId, "/");
  return (
    parseRemoteAgentWorkspaceIdentity(identity)?.serverId ??
    parseRemoteWorkspaceIdentity(identity)?.sourceServerId
  );
}

/**
 * 官方 Web 的窗口目录会对每个 hostId 直接读项目树。本地 ProjectService 只持有本 Host 数据，
 * 远端必须按 hostId 找回当前在线连接；找不到时保持 project.host-offline，不回退本地库。
 */
async function resolveProjectHostService(hostId: string): Promise<IProjectService> {
  const sourceServerId = resolveProjectHostSourceServerId(hostId);
  if (!sourceServerId) throw new Error("project.host-offline");
  const registered = windowRemoteConnectionRegistry.getOnlineSource(sourceServerId);
  if (registered) {
    const accessor = registered.capabilities?.sourceAccessor?.();
    const service =
      registered.services.getOptional(IProjectService) ??
      (accessor
        ? resolveServerProjectService({
            connectionServices: accessor,
            serverId: sourceServerId,
            sourceServices: activeServices ?? undefined,
          })
        : undefined);
    if (!service) throw new Error("project.host-offline");
    return bindRemoteProjectIdentities(service, (workspacePath) =>
      remoteProjectIdentityRegistrations(
        accessor ?? registered.services,
        workspacePath,
        async () => {
          const workspaceIdentity = buildServerRemoteWorkspaceIdentity({
            serverId: sourceServerId,
            workspacePath,
          });
          await accessor?.sourceServerWorkspaceService?.resolveWorkspace({ workspacePath });
          return workspaceIdentity;
        },
      ),
    );
  }
  const connection = sourceServerConnectionManager?.getOnlineConnection(sourceServerId);
  if (!connection) throw new Error("project.host-offline");
  const service =
    connection.services.projectService ??
    resolveServerProjectService({
      connectionServices: connection.services,
      serverId: sourceServerId,
      sourceServices: activeServices ?? undefined,
    });
  return bindRemoteProjectIdentities(service, (workspacePath) =>
    remoteProjectIdentityRegistrations(connection.services, workspacePath, async () => {
      const workspaceIdentity = buildServerRemoteWorkspaceIdentity({
        serverId: sourceServerId,
        workspacePath,
      });
      await connection.services.sourceServerWorkspaceService?.resolveWorkspace({ workspacePath });
      return workspaceIdentity;
    }),
  );
}

/** 远端项目列表的重连入口：只恢复 Source 连接，不创建 workspace logical session。 */
async function connectRemoteProjectHost(host: RemoteProjectHost): Promise<string> {
  if (host.target?.kind === "server") {
    // URL Server 的 token 只在安全存储里；沿用同一准入流程解析凭据并确认成员关系。
    if (!("url" in host.target) || !activeServices)
      throw new Error("remote-project.connector-unavailable");
    const admission = await prepareRemoteServerConnection({
      service: activeServices.get(IRemoteProjectService),
      credentials: activeServices.get(ICredentialService),
      target: {
        kind: "server",
        url: host.target.url,
        ...(host.target.name ? { name: host.target.name } : {}),
        ...(host.target.serverId ? { serverId: host.target.serverId } : {}),
        ...(host.target.workspacePath ? { workspacePath: host.target.workspacePath } : {}),
      },
      intent: "retain",
    });
    const connected = await windowRemoteConnectionRegistry.connectSource({
      target: admission.target,
      remoteAssets: sourceServerRuntimeDeps?.remoteAssets ?? {},
      membershipIntent: "retain",
    });
    await admission.commit(connected.sourceServerId);
    return remoteProjectHostIdForTarget(admission.target, connected.sourceServerId);
  }
  if (!sourceServerManagementService) throw new Error("remote-project.connector-unavailable");
  const management = sourceServerManagementService;
  const snapshot = await management.getSnapshot();
  const profiles = snapshot.profiles.filter(
    (profile) =>
      profile.lifecycleState !== "retired" && remoteProjectHostIdForProfile(profile) === host.id,
  );
  const preferred = new Set(snapshot.servers.map((server) => server.preferredProfileId));
  const profile = profiles.find((item) => preferred.has(item.profileId)) ?? profiles[0];
  if (!profile) throw new Error("remote-project.profile-not-found");
  const connected = await management.connectProfile(profile.profileId, { retainedOnly: true });
  const resolved = connected.profiles.find((item) => item.profileId === profile.profileId);
  if (
    !resolved ||
    !connected.states.some(
      (state) => state.profileId === resolved.profileId && state.state === "online",
    )
  )
    throw new Error("project.host-offline");
  return remoteProjectHostIdForProfile(resolved);
}

/** 目录的实时连接状态；registry 覆盖直连 Source，Manager 覆盖受管 SSH/WSL/Docker。 */
async function readRemoteProjectConnectionStates(): Promise<
  Map<
    string,
    Pick<
      RemoteProjectHost,
      "connectionStatus" | "lastConnectionError" | "lastConnectionStatus" | "upgradeTarget"
    >
  >
> {
  const result = new Map<
    string,
    Pick<
      RemoteProjectHost,
      "connectionStatus" | "lastConnectionError" | "lastConnectionStatus" | "upgradeTarget"
    >
  >();
  for (const state of windowRemoteConnectionRegistry.listConnections()) {
    // Remote Agent（server + ssh-tunnel）没有 URL 形态的稳定 hostId，由 session 目录另算；
    // 这里只映射直连 URL Source，受管 SSH/WSL/Docker 由下方 Manager 状态覆盖。
    if (state.target.kind !== "server" || !("url" in state.target)) continue;
    result.set(remoteProjectHostIdForTarget(state.target, state.sourceServerId), {
      connectionStatus:
        state.state === "online"
          ? "online"
          : state.state === "connecting"
            ? "connecting"
            : "offline",
    });
  }
  if (!sourceServerDirectory || !sourceServerConnectionManager) return result;
  const snapshot = await sourceServerDirectory.snapshot();
  for (const server of snapshot.servers)
    sourceServerDisplayNameById.set(server.sourceServerId, server.displayName);
  for (const state of sourceServerConnectionManager.listStates()) {
    const profile = snapshot.profiles.find((item) => item.profileId === state.profileId);
    if (!profile) continue;
    const id = remoteProjectHostIdForProfile(profile);
    const value =
      state.state === "online"
        ? "online"
        : ["bootstrapping", "retrying", "updating"].includes(state.state)
          ? "connecting"
          : "offline";
    // 同一 host 可能同时有 registry 与 Manager 事实；在线优先，其次保留更靠前的 connecting。
    if (
      result.get(id)?.connectionStatus !== "online" &&
      (result.get(id)?.connectionStatus !== "connecting" || value === "online")
    )
      result.set(id, {
        connectionStatus: value,
        lastConnectionError: state.error,
        lastConnectionStatus: state.state,
        upgradeTarget: state.upgradeTarget,
      });
  }
  return result;
}

// 进程检索体验优化：host 由 utilityProcess 拉起时外壳仍是 Electron Helper，
// 这里根据 main 传入的 window label 补一层稳定的 kayingcode-* title，方便系统进程列表过滤。
process.title = formatKayingCodeHostProcessName(process.env["KAYINGCODE_PROCESS_LABEL"]);

type HostLogLevel = "info" | "warn" | "error";

interface PendingFeedbackLogArchiveRequest {
  resolve: (archive: { path: string; size: number }) => void;
  reject: (error: Error) => void;
  onProgress?: (event: { processedBytes: number; totalBytes: number }) => void;
}

interface PendingLocalMediaPreviewPathAuthorization {
  resolve: (path: string) => void;
  reject: (error: Error) => void;
}

const pendingFeedbackLogArchiveRequests = new Map<string, PendingFeedbackLogArchiveRequest>();
let nextFeedbackLogArchiveRequestSeq = 0;
const pendingLocalMediaPreviewPathAuthorizations = new Map<
  string,
  PendingLocalMediaPreviewPathAuthorization
>();

function authorizeLocalMediaPreviewPath(path: string): Promise<string> {
  if (!parentPort) {
    return Promise.reject(new Error("parentPort unavailable"));
  }
  const requestId = randomUUID();
  return new Promise<string>((resolve, reject) => {
    pendingLocalMediaPreviewPathAuthorizations.set(requestId, { resolve, reject });
    try {
      parentPort.postMessage({
        type: HostResponseTypes.LocalMediaPreviewPathAuthorizeRequest,
        requestId,
        path,
      });
    } catch (error) {
      pendingLocalMediaPreviewPathAuthorizations.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

// browser-use host↔main 桥：把 agent 的 browser 命令经 parentPort 转给 main（WebContentsView+CDP）。
// parentPort 为空（不应发生于 host 进程）时 postToMain 抛错，bridge 自身返回 backend_unavailable。
const browserControlMainBridge = createBrowserControlMainBridge({
  postToMain: (message) => {
    if (!parentPort) {
      throw new Error("parentPort unavailable");
    }
    parentPort.postMessage(message);
  },
  materializeRecording: (input) => {
    let remoteBackend: Pick<IRemoteBackend, "upload"> | undefined;
    if (input.remoteSessionId) {
      const workspaceIdentity = input.workspaceIdentity;
      if (!workspaceIdentity?.trim()) {
        throw new Error("remote Browser recording materialization requires workspaceIdentity");
      }
      // Window Host 重构后同一进程可同时持有多个远端连接，旧的进程级
      // remoteConnection 会串 session。必须用完整 scope 从 registry 的权威 entry 取 uploader。
      remoteBackend = windowRemoteConnectionRegistry.resolveScopedCapabilities({
        kind: "remote",
        remoteSessionId: input.remoteSessionId,
        workspacePath: input.workspacePath,
        workspaceIdentity,
      })?.browserRecordingUploader;
    }
    return materializeBrowserRecordingArtifact({
      ...input,
      ...(remoteBackend ? { remoteBackend } : {}),
    });
  },
});

function reportHostLog(level: HostLogLevel, args: unknown[]): void {
  if (!parentPort) {
    return;
  }

  try {
    parentPort.postMessage({
      type: HostResponseTypes.Log,
      level,
      source: "host",
      message: args.map((arg) => stringifyHostLogArg(arg)).join(" "),
    });
  } catch {
    // 日志上报失败不应影响 host 主流程。
  }
}

const rawConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const remoteConnectionProgressContext = createRemoteConnectionProgressContext({
  emit: ({ requestId, level, args }) => {
    if (!parentPort) {
      return;
    }
    try {
      parentPort.postMessage({
        type: HostResponseTypes.RemoteWorkspaceConnectionLog,
        requestId,
        level,
        message: args.map((arg) => stringifyHostLogArg(arg)).join(" "),
      });
    } catch {
      // 连接进度上报失败不应中断 SSH/WSL/Docker 的真实连接流程。
    }
  },
});

function writeHostLog(level: HostLogLevel, ...args: unknown[]): void {
  const prefix = formatLogPrefix("kayingcode-host", process.pid);
  const consoleFn =
    level === "error" ? rawConsole.error : level === "warn" ? rawConsole.warn : rawConsole.log;
  consoleFn(prefix, ...args);
  reportHostLog(level, [prefix, ...args]);
}

function createFullFeedbackLogArchiveViaMain(
  sourceDir: string,
  options?: {
    onProgress?: (event: { processedBytes: number; totalBytes: number }) => void;
  },
): Promise<{ path: string; size: number }> {
  const requestId = `feedback-log-archive-${Date.now()}-${nextFeedbackLogArchiveRequestSeq++}`;
  options?.onProgress?.({ processedBytes: 0, totalBytes: 0 });

  return new Promise((resolve, reject) => {
    pendingFeedbackLogArchiveRequests.set(requestId, {
      resolve,
      reject,
      onProgress: options?.onProgress,
    });
    // 问题反馈以前在 host service 内走 compactLogArchive 的 full fallback，
    // 收集范围和“导出日志”不一致，缺少 kayingcode-cli 日志、rollout/debug 以及导出链路脱敏。
    // 这里把完整日志打包委托给 main process 的导出日志同源逻辑，host 只拿 zip 路径继续上传。
    try {
      parentPort.postMessage({
        type: HostResponseTypes.FeedbackLogArchiveRequest,
        requestId,
        sourceDir,
      });
    } catch (error) {
      pendingFeedbackLogArchiveRequests.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

const logger = {
  info: (...args: unknown[]) => writeHostLog("info", ...args),
  warn: (...args: unknown[]) => writeHostLog("warn", ...args),
  error: (...args: unknown[]) => writeHostLog("error", ...args),
};

const cronAutomationRepo = new AutomationRepo();
const cronRunSubscriptions = new Map<string, { dispose(): void }>();

// ---- 闲时任务（off-peak）派发：与 cron 并行的独立链路（表/消息/常量互不复用）----
const offPeakTaskRepo = new OffPeakTaskRepo();
const offPeakRunSubscriptions = new Map<string, { dispose(): void }>();
/**
 * 续跑提示词（"实现时定"的落地）：3h 时间盒到期 / app 重启恢复后 resume 同一
 * session 续发。不重发原始 prompt（会让模型从头再做一遍），而是指示接续未完成的工作。
 */
const OFF_PEAK_RESUME_PROMPT =
  "Continue the previous task from where it left off. The run was interrupted " +
  "(app restart or execution window expired). Do not start over; review what has " +
  "already been done and complete the remaining work.";

// ---- off-peak 运行时装配（server client + 进程内 mock 网关 + 编排服务，host 域属主）----
// ⚠ 多窗口=多 host 会各自跑一份 sync 轮询（批量接口幂等、写入同库同数据，重复仅多耗请求）；
// mock 网关用固定端口单实例共享票据状态。若多窗口轮询放大成本，再加跨 host 选主。
interface OffPeakRuntime {
  service: OffPeakTaskService;
  /** 派发时按本段票据构造逐请求鉴权；静态模型事实由 CLI Built-in Config 提供。 */
  buildRequestAuth: OffPeakRequestAuthBuilder;
  validateSelection: (selection: {
    providerId: string;
    modelId: string;
    options?: { reasoningLevel?: string };
  }) => Promise<boolean>;
}
let offPeakRuntime: OffPeakRuntime | null = null;

async function ensureOffPeakRuntime(): Promise<OffPeakRuntime | null> {
  if (offPeakRuntime) return offPeakRuntime;
  const services = activeServices;
  if (!services) return null;
  const service = services.getOptional(IOffPeakTaskService);
  const buildRequestAuth = getOffPeakRequestAuthBuilder(services);
  if (!service || !buildRequestAuth) {
    logger.warn("off-peak runtime unavailable: missing host services");
    return null;
  }
  offPeakRuntime = {
    service: service as OffPeakTaskService,
    buildRequestAuth,
    validateSelection: (selection) =>
      (service as OffPeakTaskService).validateDispatchModelSelection(selection),
  };
  logger.info("off-peak runtime ready (service from local collection)");
  return offPeakRuntime;
}

function disposeOffPeakRuntime(): void {
  if (!offPeakRuntime) return;
  offPeakRuntime = null;
}

interface OffPeakRunDispatchRequest {
  offPeakTaskId: string;
  prompt: string;
  permissionMode: string;
  modelSelection: ModelSelection;
  conversationId?: string;
  sessionId?: string;
  serverTicketId?: string;
  workspacePath: string;
  workspaceIdentity?: string;
}

function offPeakRunSubscriptionKey(taskId: string, traceId: TraceId): string {
  return `${taskId}\u0000${traceId}`;
}

function disposeOffPeakRunSubscription(key: string): void {
  const disposable = offPeakRunSubscriptions.get(key);
  if (!disposable) return;
  offPeakRunSubscriptions.delete(key);
  disposable.dispose();
}

/** 终态回填 files_changed：复用现有 task diff 汇总（工具写盘型统计，Bash 改动不计入，接受）。 */
async function resolveOffPeakFilesChanged(params: {
  kayingcodeTaskService: IKayingCodeTaskService;
  taskId: string;
  workspacePath: string;
  workspaceIdentity?: string;
}): Promise<number | undefined> {
  try {
    const snapshot = await params.kayingcodeTaskService.getTaskSnapshot({
      taskId: params.taskId,
      workspacePath: params.workspacePath,
      ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
    });
    const fileChanges = snapshot?.fileChanges;
    if (!fileChanges) return undefined;
    // 汇总为空（无文件改动）按 0 计——"改了 0 个文件"对完成通知是真实信息。
    return buildTaskChangeSummary(fileChanges)?.fileCount ?? 0;
  } catch (error) {
    logger.warn("off-peak files_changed 汇总失败（不阻塞终态落库）:", error);
    return undefined;
  }
}

/** loop 终态 → off_peak_tasks 终态：succeeded→completed、stopped→cancelled（用户手动停止）、其余→failed。 */
async function finalizeOffPeakRun(params: {
  kayingcodeTaskService: IKayingCodeTaskService;
  offPeakTaskId: string;
  taskId: string;
  workspacePath: string;
  workspaceIdentity?: string;
  outcome: KayingCodeAutomationRunOutcome;
  error?: string;
}): Promise<void> {
  // 自动续跑：票据过期（active 3h 到期 / ready 废票）不是失败——
  // 同 task_id 重取号回 queued，等下一个 ready 再 resume 同 session 续跑。
  if (params.outcome === "failed" && isOffPeakTicketExpiredError(params.error)) {
    const runtime = await ensureOffPeakRuntime();
    if (runtime) {
      await runtime.service.handleTicketExpiredDuringRun(params.offPeakTaskId);
      logger.info(
        `off-peak segment expired, requeued for continuation task=${params.offPeakTaskId}`,
      );
      return;
    }
    // 运行时不可用（服务缺失）时按普通失败落库，避免任务卡在 running。
  }
  const status =
    params.outcome === "succeeded"
      ? ("completed" as const)
      : params.outcome === "stopped"
        ? ("cancelled" as const)
        : ("failed" as const);
  const filesChanged = await resolveOffPeakFilesChanged(params);
  const updated = await offPeakTaskRepo.markTerminal(params.offPeakTaskId, {
    status,
    endedAt: Date.now(),
    ...(params.error ? { failureReason: params.error } : {}),
    ...(filesChanged !== undefined ? { filesChanged } : {}),
  });
  if (!updated) {
    // 终态不可逆出：任务已被用户先一步取消/删除等，丢弃迟到回写（幂等兜底）。
    logger.info(
      `off-peak terminal writeback dropped (already terminal) task=${params.offPeakTaskId}`,
    );
    return;
  }
  logger.info(
    `off-peak run finished task=${params.offPeakTaskId} status=${status} filesChanged=${filesChanged ?? "n/a"}`,
  );
  // 后台完成统一置未读，打开 task 时由导航链路清除（与 cron 同款）。
  void params.kayingcodeTaskService.setTaskUnread({
    taskId: params.taskId,
    workspacePath: params.workspacePath,
    ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
    unread: true,
  });
}

function trackOffPeakRunOutcome(params: {
  kayingcodeTaskService: IKayingCodeTaskService;
  offPeakTaskId: string;
  taskId: string;
  traceId: TraceId;
  workspacePath: string;
  workspaceIdentity?: string;
}): void {
  const key = offPeakRunSubscriptionKey(params.taskId, params.traceId);
  disposeOffPeakRunSubscription(key);
  const disposable = params.kayingcodeTaskService.onDynamicTaskTerminalOutcome(params.taskId)(
    (result) => {
      if (result.inputId !== params.traceId) return;
      disposeOffPeakRunSubscription(key);
      void finalizeOffPeakRun({
        kayingcodeTaskService: params.kayingcodeTaskService,
        offPeakTaskId: params.offPeakTaskId,
        taskId: params.taskId,
        workspacePath: params.workspacePath,
        ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
        outcome: result.outcome,
        ...(result.error ? { error: result.error } : {}),
      }).catch((error) => logger.warn("off-peak 终态回写失败:", error));
    },
  );
  offPeakRunSubscriptions.set(key, disposable);
}

/**
 * 把一次闲时任务派发提交给当前 host 的 V4 task service。
 * 首跑（无 conversationId）createTask 新建专属 session；续跑/中断恢复 resume
 * 同一会话并以续跑提示词继续。闲时完整 Selection/鉴权仅注入本次执行。
 */
async function dispatchOffPeakRun(request: OffPeakRunDispatchRequest): Promise<{
  conversationId: string;
  sessionId: string;
}> {
  const kayingcodeTaskService = activeServices?.getOptional(IKayingCodeTaskService);
  if (!kayingcodeTaskService) {
    throw new Error("KayingCode task service is not initialized.");
  }
  const runtime = await ensureOffPeakRuntime();
  if (!runtime) {
    throw new Error("off-peak runtime is not available");
  }
  if (!request.serverTicketId) {
    // schedulable 必然已取号；无票派发说明快照失序，按 transient 回执等下轮（轮询会补票）。
    throw new Error("off-peak dispatch without server ticket");
  }
  // idle plan 使用普通 Selection；单次执行约束保证它不写入 Session Selection。
  const idleSelection = request.modelSelection;
  if (!(await runtime.validateSelection(idleSelection))) {
    throw new OffPeakModelUnavailableError("idlePlan");
  }
  const requestAuth = await runtime.buildRequestAuth(request.serverTicketId);
  // 首次派发与复用会话的恢复派发需要在轮次事实中可区分；该字段只描述
  // 当前自动 turn 的调度阶段，不改变稳定 task ID、独立 message ID 或手动消息语义。
  const dispatchKind = resolveOffPeakDispatchKind(request);
  const offPeakRunType = dispatchKind === "resume" ? "resume" : "init";
  let trackedKey: string | null = null;
  try {
    let taskId: string;
    let traceId: TraceId;
    let promptContent = request.prompt;
    if (dispatchKind === "bound-first-run") {
      // 绑定首跑：会话内创建的任务在创建它的会话里执行（对齐 dispatchCronRun 的 targetTaskId 路径）。
      // 先探测再写配置：绑定的是用户的工作会话，忙碌时直接 transient 交给调度器退避，
      // 不能先 setMode 再被 session/send 以 -32010 拒绝（那会悄悄改掉用户会话的权限模式）。
      taskId = request.sessionId!;
      traceId = `${request.offPeakTaskId}:bound:${randomUUID()}` as TraceId;
      const workspaceScope = {
        workspacePath: request.workspacePath,
        workspaceIdentity: request.workspaceIdentity,
      };
      const [deletedIds, tasks] = await Promise.all([
        kayingcodeTaskService.listDeletedTaskIds(workspaceScope),
        kayingcodeTaskService.listTasks(workspaceScope),
      ]);
      assertBoundSessionDispatchable({
        sessionId: taskId,
        deleted: deletedIds.includes(taskId),
        running: tasks.find((task) => task.taskId === taskId)?.status === "running",
      });
      await kayingcodeTaskService.resumeTask({
        ...workspaceScope,
        taskId,
        // 绑定会话首次盖章归属标记，侧栏归入闲时分组（机制同 cron targetTaskId）。
        offPeakTaskId: request.offPeakTaskId,
      });
      await kayingcodeTaskService.setConfigOption({
        taskId,
        traceId,
        configId: "mode",
        value: request.permissionMode,
      });
    } else if (dispatchKind === "resume") {
      // 续跑段：resume 同一 session（冷恢复水合历史；send 前必须先 resume）。
      taskId = request.conversationId!;
      // 原因：offPeakTaskId 只用于跨 talk 关联；每次自动轮必须生成独立消息身份，
      // 不能复用 task ID，也不能依赖同毫秒时间戳避免碰撞。
      traceId = `${request.offPeakTaskId}:resume:${randomUUID()}` as TraceId;
      promptContent = OFF_PEAK_RESUME_PROMPT;
      await kayingcodeTaskService.resumeTask({
        taskId,
        workspacePath: request.workspacePath,
        workspaceIdentity: request.workspaceIdentity,
        // pre-打点会话续跑时补写归属标记（bootstrap 回填之外的双保险）。
        offPeakTaskId: request.offPeakTaskId,
      });
      // 权限模式随派发下发（resume 后显式设置，幂等）。
      await kayingcodeTaskService.setConfigOption({
        taskId,
        traceId,
        configId: "mode",
        value: request.permissionMode,
      });
      // 档位是 idle Selection 的一部分，只在 sendPrompt 注入；单独写档位会污染用户会话。
    } else {
      const task = await kayingcodeTaskService.createTask({
        workspacePath: request.workspacePath,
        workspaceIdentity: request.workspaceIdentity,
        // 空 Session 沿用普通初始化；idle Selection 只在下方执行中注入。
        // 在此写入会让闲时轮结束后的普通消息继续使用无票的隐藏 Provider。
        mode: request.permissionMode as KayingCodeTaskMode,
        // 闲时任务是无界面的 createTask + sendPrompt 连续派发；空 session 必须在首条
        // V4 admission 内先持久化，否则 session_input 外键会先于 session 主记录写入。
        deferPersistenceUntilFirstPrompt: true,
        // 创建时即盖章持久归属标记（月亮图标/后续系统分组只看该标记，不再反查 store）。
        offPeakTaskId: request.offPeakTaskId,
      });
      taskId = task.taskId;
      traceId = task.traceId;
    }
    trackedKey = offPeakRunSubscriptionKey(taskId, traceId);
    trackOffPeakRunOutcome({
      kayingcodeTaskService,
      offPeakTaskId: request.offPeakTaskId,
      taskId,
      traceId,
      workspacePath: request.workspacePath,
      ...(request.workspaceIdentity ? { workspaceIdentity: request.workspaceIdentity } : {}),
    });
    await kayingcodeTaskService.sendPrompt({
      taskId,
      traceId,
      content: promptContent,
      clientMode: "desktop-continuous",
      // Bug 原因：闲时自动 turn 以前只注入 idle plan，没有限制工具面，模型可在后台创建
      // 持久化定时任务。首跑与续跑在此收敛，显式隐藏 CronCreate 且不伪造 cron automation 归属。
      // 闲时轮同时隐藏 OffPeakCreate，OffPeakList 只读保留。
      toolDenylist: ["CronCreate", "OffPeakCreate"],
      modelSelection: idleSelection,
      modelExecution: {
        // 闲时执行凭据只服务主 Turn；完成后不再派生自动 Memory 请求。
        memoryExtraction: "skip",
        selectionScope: "execution",
        requestAuth,
        subagents: {
          foregroundModel: "submission",
          background: "deny",
        },
      },
      offPeakTaskId: request.offPeakTaskId,
      offPeakRunType,
    });
    // 只有 init 实际新建；绑定首跑和跨票续跑只是原 Session 的后续输入。
    if (dispatchKind === "init") {
      reportHostSessionCreate(parentPort, {
        sessionId: taskId,
        messageId: traceId,
        source: "automation_idle",
        workspaceIdentity: request.workspaceIdentity,
      });
    }
    return { conversationId: taskId, sessionId: taskId };
  } catch (error) {
    if (trackedKey) disposeOffPeakRunSubscription(trackedKey);
    throw error;
  }
}

interface CronRunDispatchRequest {
  automationId: string;
  runId: string;
  prompt: string;
  targetTaskId?: string;
  modelSelection?: ModelSelection;
  mode?: KayingCodeTaskMode;
  workspacePath: string;
  workspaceIdentity?: string;
}

function resolveAutomationTargetServices(request: {
  workspacePath: string;
  workspaceIdentity?: string;
}): ServiceCollection {
  const remoteSession = windowRemoteConnectionRegistry.findSessionForWorkspace(request);
  if (remoteSession) {
    if (!remoteSession.workspaceIdentity) {
      throw new Error("Automation 目标 Remote Host 缺少 workspaceIdentity");
    }
    if (remoteSession.target.kind === "server") {
      // Remote Agent Server 当前声明 automationScheduler=false；调度权威未迁移到
      // Server 前，Desktop 不能代替远端接纳或定时派发任务。
      throw new Error("远程 Agent Server 当前不支持自动化调度");
    }
    return windowRemoteConnectionRegistry.resolveScopedServices({
      kind: "remote",
      remoteSessionId: remoteSession.remoteSessionId,
      workspacePath: request.workspacePath,
      workspaceIdentity: remoteSession.workspaceIdentity,
    });
  }
  // 远程 Automation 找不到目标 logical session 时，旧派发会静默落到 Local Host，
  // 从而使用本地模型首选与 Registry。远程身份只能失败，不能跨 Environment fallback。
  if (request.workspaceIdentity && isRemoteWorkspaceIdentity(request.workspaceIdentity)) {
    throw new Error("Automation 目标 Remote Host 当前不可用");
  }
  if (!activeServices) {
    throw new Error("Local Host services are not initialized.");
  }
  return activeServices;
}

function cronRunSubscriptionKey(taskId: string, traceId: TraceId): string {
  return `${taskId}\u0000${traceId}`;
}

function parseCronRunScheduledAt(runId: string, automationId: string): number | null {
  const prefix = `${automationId}:`;
  if (!runId.startsWith(prefix)) return null;
  const value = Number(runId.slice(prefix.length).split(":")[0]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function markCronRunOutcome(params: {
  runId: string;
  automationId: string;
  workspaceKey: string;
  scheduledAt: number | null;
  trigger: "schedule" | "manual";
  outcome: KayingCodeAutomationRunOutcome;
  error?: string;
}): void {
  void recordCronRunOutcomeBestEffort({
    ...params,
    repo: cronAutomationRepo,
    logWarn: (message, error) => logger.warn(message, error),
  });
}

function disposeCronRunSubscription(key: string): void {
  const disposable = cronRunSubscriptions.get(key);
  if (!disposable) return;
  cronRunSubscriptions.delete(key);
  disposable.dispose();
}

async function applyCronRunConfigToExistingTask(params: {
  kayingcodeTaskService: IKayingCodeTaskService;
  taskId: string;
  traceId: TraceId;
  modelSelection?: ModelSelection;
  mode?: string;
}): Promise<void> {
  let thoughtAppliedWithModel = false;
  let modeAppliedWithModel = false;
  if (params.modelSelection) {
    await params.kayingcodeTaskService.setAutomationSessionConfig({
      taskId: params.taskId,
      traceId: params.traceId,
      modelSelection: params.modelSelection,
      thoughtLevel: params.modelSelection.options?.reasoningLevel,
      mode: params.mode?.trim() as KayingCodeTaskMode | undefined,
    });
    thoughtAppliedWithModel = true;
    modeAppliedWithModel = true;
  }
  if (!modeAppliedWithModel && params.mode?.trim()) {
    await params.kayingcodeTaskService.setConfigOption({
      taskId: params.taskId,
      traceId: params.traceId,
      configId: "mode",
      value: params.mode.trim(),
    });
  }
  if (!thoughtAppliedWithModel && params.modelSelection?.options?.reasoningLevel) {
    await params.kayingcodeTaskService.setConfigOption({
      taskId: params.taskId,
      traceId: params.traceId,
      configId: "thought_level",
      value: params.modelSelection.options.reasoningLevel,
    });
  }
}

function trackCronRunOutcome(params: {
  kayingcodeTaskService: IKayingCodeTaskService;
  taskId: string;
  traceId: TraceId;
  workspacePath: string;
  workspaceIdentity?: string;
  runId: string;
  automationId: string;
  workspaceKey: string;
  scheduledAt: number | null;
  trigger: "schedule" | "manual";
}): void {
  const key = cronRunSubscriptionKey(params.taskId, params.traceId);
  disposeCronRunSubscription(key);
  markCronRunOutcome({ ...params, outcome: "running" });
  const disposable = params.kayingcodeTaskService.onDynamicTaskTerminalOutcome(params.taskId)(
    (result) => {
      if (result.inputId !== params.traceId) return;
      void settleCronRunTerminalOutcome({
        ...params,
        outcome: result.outcome,
        error: result.error,
        repo: cronAutomationRepo,
        logWarn: (message, error) => logger.warn(message, error),
      });
      // 定时任务在后台完成后统一置为未读，真正打开 task 时再由导航链路清除。
      void params.kayingcodeTaskService.setTaskUnread({
        taskId: params.taskId,
        workspacePath: params.workspacePath,
        ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
        unread: true,
      });
      disposeCronRunSubscription(key);
    },
  );
  const claimHeartbeat =
    params.trigger === "manual"
      ? startManualClaimHeartbeat({
          ...params,
          repo: cronAutomationRepo,
          logWarn: (message, error) => logger.warn(message, error),
        })
      : null;
  cronRunSubscriptions.set(key, {
    dispose() {
      claimHeartbeat?.dispose();
      disposable.dispose();
    },
  });
}

/**
 * 把一次 cron/manual run 直接提交给当前 host 的 V4 task service。
 * 会话内 automation 可能绑定到未激活 session，必须先恢复再应用保存的运行参数。
 */
async function dispatchCronRun(request: CronRunDispatchRequest): Promise<{
  taskId: string;
  sessionId: string;
}> {
  const targetServices = resolveAutomationTargetServices(request);
  const kayingcodeTaskService = targetServices.getOptional(IKayingCodeTaskService);
  if (!kayingcodeTaskService) {
    throw new Error("KayingCode task service is not initialized.");
  }
  const modelSelectionService = targetServices.getOptional(IModelSelectionService);
  if (!modelSelectionService) {
    throw new Error("目标 Host Model Selection service is not initialized.");
  }
  // 长期配置是原意图；首次派发在目标 Host 解析后固定。已有 run 必须直接复用，
  // 不能因账号变化或本次 Registry 读取失败重新解释历史执行选择。
  const existingRun = await cronAutomationRepo.getRun(request.runId);
  const resolvedSubmissionModelSelection = await resolveAutomationSubmissionModelSelection({
    selection: request.modelSelection,
    fixedSelection: existingRun?.modelSelection,
    modelSelectionService,
    // Repo 已在读取前完成离线导入；不再为迁移绕行 Agent/账号服务。
    // 未迁入或损坏的新值仍由此入口明确拒绝，不能当成跟随 Workspace。
    readSelection: () =>
      cronAutomationRepo.getModelSelectionForDispatch(
        request.automationId,
        resolveWorkspaceKey(request),
      ),
  });
  const submissionModelSelection = await cronAutomationRepo.fixRunModelSelection(
    request.runId,
    resolvedSubmissionModelSelection,
  );
  let trackedKey: string | null = null;
  const workspaceKey = resolveWorkspaceKey(request);
  const trigger = request.runId.includes(":manual:") ? "manual" : "schedule";
  const scheduledAt = parseCronRunScheduledAt(request.runId, request.automationId);
  try {
    const task = request.targetTaskId
      ? { taskId: request.targetTaskId }
      : await kayingcodeTaskService.createTask({
          workspacePath: request.workspacePath,
          workspaceIdentity: request.workspaceIdentity,
          model: formatModelPickerValue(submissionModelSelection),
          mode: request.mode,
          thoughtLevel: submissionModelSelection.options?.reasoningLevel,
          automationId: request.automationId,
        });
    // 未绑定会话时不能沿用 createTask 的 session trace 作为首条 prompt trace：
    // CLI 无法从 inputId 还原 manual/schedule admission。
    // 建会话 trace 与执行 runId 是两种身份；两条派发路径的 prompt 都必须统一使用 runId。
    const promptTraceId = request.runId as TraceId;
    if (request.targetTaskId) {
      // 绑定会话在 app 重启或切换 workspace 后通常不处于 active；旧实现直接
      // setConfig/sendPrompt 会立即报 Session is not active，看起来像「立即运行」没有触发。
      await kayingcodeTaskService.resumeTask({
        taskId: task.taskId,
        workspacePath: request.workspacePath,
        workspaceIdentity: request.workspaceIdentity,
        model: formatModelPickerValue(submissionModelSelection),
        thoughtLevel: submissionModelSelection.options?.reasoningLevel,
        automationId: request.automationId,
      });
      await applyCronRunConfigToExistingTask({
        kayingcodeTaskService,
        taskId: task.taskId,
        traceId: promptTraceId,
        modelSelection: submissionModelSelection,
        mode: request.mode,
      });
    }
    trackedKey = cronRunSubscriptionKey(task.taskId, promptTraceId);
    trackCronRunOutcome({
      kayingcodeTaskService,
      taskId: task.taskId,
      traceId: promptTraceId,
      workspacePath: request.workspacePath,
      workspaceIdentity: request.workspaceIdentity,
      runId: request.runId,
      automationId: request.automationId,
      workspaceKey,
      scheduledAt,
      trigger,
    });
    await kayingcodeTaskService.sendPrompt({
      taskId: task.taskId,
      traceId: promptTraceId,
      content: request.prompt,
      clientMode: "desktop-continuous",
      automationId: request.automationId,
    });
    // prompt 创建的定时任务带 targetTaskId，追加原会话不能计成 session_create。
    if (!request.targetTaskId) {
      reportHostSessionCreate(parentPort, {
        sessionId: task.taskId,
        messageId: promptTraceId,
        source: "automation_scheduled",
        workspaceIdentity: request.workspaceIdentity,
      });
    }
    return { taskId: task.taskId, sessionId: task.taskId };
  } catch (error) {
    if (trackedKey) disposeCronRunSubscription(trackedKey);
    markCronRunOutcome({
      runId: request.runId,
      automationId: request.automationId,
      workspaceKey,
      scheduledAt,
      trigger,
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function dispatchManualAutomationRun(params: {
  automation: KayingCodeAutomation;
  run: KayingCodeAutomationRun;
}): Promise<void> {
  logger.info(
    `direct manual automation dispatch started automation=${params.automation.automationId} runId=${params.run.runId}`,
  );
  let result: Awaited<ReturnType<typeof dispatchCronRun>>;
  try {
    result = await dispatchCronRun({
      automationId: params.automation.automationId,
      runId: params.run.runId,
      prompt: params.automation.prompt,
      targetTaskId: params.automation.targetTaskId,
      modelSelection: params.run.modelSelection ?? params.automation.modelSelection,
      mode: params.automation.mode,
      workspacePath: params.automation.workspacePath,
      workspaceIdentity: params.automation.workspaceIdentity,
    });
  } catch (error) {
    logger.warn(
      `direct manual automation dispatch failed automation=${params.automation.automationId} runId=${params.run.runId}:`,
      error,
    );
    await settleManualDispatchFailureBestEffort({
      repo: cronAutomationRepo,
      automationId: params.automation.automationId,
      runId: params.run.runId,
      workspaceKey: params.automation.workspaceKey,
      scheduledAt: params.run.scheduledAt ?? null,
      trigger: "manual",
      dispatchError: error,
      logWarn: (message, releaseError) => logger.warn(message, releaseError),
    });
    throw error;
  }

  try {
    await cronAutomationRepo.markManualRunDispatched({
      runId: params.run.runId,
      sessionId: result.sessionId,
      dispatchedAt: Date.now(),
    });
  } catch (error) {
    // prompt 已经 accepted/queued，台账和累计次数回写失败不能伪装成派发失败并提前释放锁；
    // 真实终态仍由 trackCronRunOutcome 收口，避免同一 automation 重复排队。
    logger.warn(
      `回写 manual automation dispatched 状态与运行次数失败 automation=${params.automation.automationId} runId=${params.run.runId}`,
      error,
    );
  }
  // sendPrompt ACK 可能只表示进入 busy queue；manual claim 必须保留到对应 turn 终态。
  logger.info(
    `direct manual automation dispatch accepted automation=${params.automation.automationId} runId=${params.run.runId} taskId=${result.taskId}`,
  );
}

// Node warning 不是远端连接失败，改成结构化 warn，避免默认 stderr 被误染成 error。
process.on("warning", (warning) => logger.warn(`${warning.name}: ${warning.message}`));

registerHostNetworkTelemetry(parentPort);
// Host 进程自身的 60 秒采样：一次读数两个出口——门控后写本地
// `[memory]` 行，同一次读数换算成 HostResourceSample 经 parentPort 送 main 作 heap 来源。
// services 计数器由各 service 工厂自注册。
const hostSelfResourceTelemetry = startHostSelfResourceTelemetry({
  logger,
  collectCounters: collectServiceMemoryDiagnostics,
  postMessage: parentPort ? (message) => parentPort.postMessage(message) : undefined,
});

const runtimeProcessLifecycleReporter = {
  onSpawn(event) {
    if (!parentPort) {
      return;
    }

    parentPort.postMessage({
      type: HostResponseTypes.AgentProcessSpawned,
      ...event,
    });
  },
  onReady(event) {
    if (!parentPort) {
      return;
    }

    parentPort.postMessage({
      type: HostResponseTypes.AgentProcessReady,
      ...event,
    });
  },
  onExit(event) {
    if (!parentPort) {
      return;
    }

    parentPort.postMessage({
      type: HostResponseTypes.AgentProcessExited,
      ...event,
      signal: event.signal ?? null,
    });
  },
  onError(event) {
    if (!parentPort) {
      return;
    }

    parentPort.postMessage({
      type: HostResponseTypes.AgentProcessError,
      ...event,
    });
  },
  onException(event) {
    parentPort?.postMessage({ type: HostResponseTypes.AgentProcessException, ...event });
  },
} satisfies NonNullable<Parameters<typeof createLocalServices>[0]>["processLifecycleReporter"];

const runtimeTaskReporter = {
  onRunningTaskCountChanged(event) {
    if (!parentPort) {
      return;
    }

    parentPort.postMessage({
      type: HostResponseTypes.AgentRunningTaskCountChanged,
      runningTaskCount: event.runningTaskCount,
    });
  },
} satisfies NonNullable<Parameters<typeof createLocalServices>[0]>["taskRuntimeReporter"];

let untrackedPromptRpcCount = 0;
function reportHostRunningTaskCount(): void {
  runtimeTaskReporter.onRunningTaskCountChanged({
    runningTaskCount: workspaceTaskTracker.getTotalRunningTaskCount() + untrackedPromptRpcCount,
  });
}

const workspaceTaskTracker = createHostWorkspaceTaskTracker((event) => {
  parentPort?.postMessage({
    type: HostResponseTypes.WorkspaceRunningTaskCountChanged,
    ...event,
  });
  windowRemoteConnectionRegistry.setWorkspaceRunningTaskCount(event);
  reportHostRunningTaskCount();
});

function isKayingCodeTaskMeta(value: unknown): value is KayingCodeTaskMeta {
  return (
    typeof value === "object" &&
    value !== null &&
    "taskId" in value &&
    "workspacePath" in value &&
    "traceId" in value &&
    typeof (value as { taskId?: unknown }).taskId === "string" &&
    typeof (value as { workspacePath?: unknown }).workspacePath === "string" &&
    typeof (value as { traceId?: unknown }).traceId === "string"
  );
}

function isRemoteMirrorableStreamEvent(
  event: KayingCodeStreamEvent,
): event is TaskStreamMirrorableEvent {
  return event.type !== "task_stream_mirror_batch" && event.type !== "task_snapshot_updated";
}

function createReportingRemoteKayingCodeTaskService<T extends object>(
  service: T,
  options?: {
    reportRunningPromptCount?: boolean;
    taskRealtimePort?: ReturnType<typeof createTaskRealtimeBridgeForHostInit>;
    materializePromptAttachments?: (params: {
      taskId: string;
      traceId: TraceId;
      content: string;
      attachments?: KayingCodePromptAttachment[];
    }) => Promise<{ content: string; attachments?: KayingCodePromptAttachment[] }>;
  },
): T {
  const workspaceProxyState = createHostRemoteWorkspaceProxyState();

  function forwardSessionMessageRequest(request: unknown): void {
    parentPort?.postMessage({
      type: HostResponseTypes.SessionMessageSendRequested,
      request,
    });
  }

  function subscribeSessionMessageRequests(target: T, meta: KayingCodeTaskMeta): void {
    const onDynamicWorkspaceEvent = Reflect.get(target, "onDynamicWorkspaceEvent");
    if (typeof onDynamicWorkspaceEvent !== "function") {
      return;
    }
    const subscribe = onDynamicWorkspaceEvent.call(target, {
      workspacePath: meta.workspacePath,
      ...(meta.workspaceIdentity ? { workspaceIdentity: meta.workspaceIdentity } : {}),
    });
    if (typeof subscribe !== "function") {
      return;
    }
    workspaceProxyState.ensureWorkspaceSubscription(meta, () =>
      subscribe((event: unknown) => {
        if (
          typeof event === "object" &&
          event !== null &&
          (event as { type?: unknown }).type === "workspace_session_message_send_requested"
        ) {
          forwardSessionMessageRequest((event as { request?: unknown }).request);
        }
      }),
    );
  }

  function rememberTaskMeta(result: unknown): void {
    if (isKayingCodeTaskMeta(result)) {
      workspaceProxyState.rememberTaskMeta(result);
      subscribeSessionMessageRequests(service, result);
      parentPort?.postMessage({
        type: HostResponseTypes.SessionRouteAnnounce,
        route: {
          sessionId: result.taskId,
        },
      });
    }
  }

  function rememberTaskMetasFromResult(result: unknown): void {
    if (Array.isArray(result)) {
      for (const item of result) {
        rememberTaskMetasFromResult(item);
      }
      return;
    }
    rememberTaskMeta(result);
    if (typeof result !== "object" || result === null) {
      return;
    }
    const items = (result as { items?: unknown }).items;
    if (Array.isArray(items)) {
      for (const item of items) {
        rememberTaskMeta(item);
      }
    }
    const snapshot = (result as { snapshot?: unknown }).snapshot;
    if (typeof snapshot === "object" && snapshot !== null) {
      rememberTaskMeta((snapshot as { meta?: unknown }).meta);
    }
    rememberTaskMeta((result as { meta?: unknown }).meta);
  }

  async function prepareRemotePromptParams(params: {
    taskId: string;
    traceId: TraceId;
    content: string;
    attachments?: KayingCodePromptAttachment[];
  }): Promise<{
    taskId: string;
    traceId: TraceId;
    content: string;
    attachments?: KayingCodePromptAttachment[];
  }> {
    if (!options?.materializePromptAttachments) {
      return params;
    }
    return {
      ...params,
      ...(await options.materializePromptAttachments(params)),
    };
  }

  async function mirrorRemotePrompt(
    target: T,
    sendPrompt: (...args: unknown[]) => Promise<unknown>,
    params: {
      taskId: string;
      traceId: TraceId;
      content: string;
      attachments?: KayingCodePromptAttachment[];
    },
  ): Promise<unknown> {
    const taskRealtimePort = options?.taskRealtimePort;
    const meta = workspaceProxyState.getTaskMeta(params.taskId);
    if (!taskRealtimePort || !meta) {
      return sendPrompt.call(target, params);
    }

    const mirrorTarget = {
      workspacePath: meta.workspacePath,
      workspaceIdentity: meta.workspaceIdentity,
      workspaceKey: resolveWorkspaceKey(meta),
      taskId: params.taskId,
      runId: params.traceId,
      traceId: params.traceId,
    };
    const leaseResult = await taskRealtimePort
      .acquireTaskRunLease(mirrorTarget)
      .catch((error: unknown) => {
        logger.warn("Remote runtime realtime lease failed:", error);
        return null;
      });
    if (!leaseResult?.acquired) {
      return sendPrompt.call(target, params);
    }

    taskRealtimePort.publishStreamOp(mirrorTarget, {
      kind: "user_message",
      messageId: `user-${params.traceId}`,
      content: params.content,
      attachments: params.attachments,
      timestamp: Date.now(),
    });

    // 写路径（send/stop/交互回执）已收敛 v4 命令面；本镜像属**读路径**——
    // taskRealtimePort → 手机 relay → 手机端
    // kayingcodeSessionStore 的整条消费链词表都是 KayingCodeStreamEvent。两个方案的评估结论：
    // a) relay 直接转发 v4 帧、手机端消费 v4 store（正解）：需要重做 relay stream-op
    //    协议 + 手机端 store；
    // b) 帧→KayingCodeStreamEvent 薄映射：等价复刻 adapter mapSessionEvent，
    //    否决。
    // 结论：本镜像保持 legacy 源不动。
    const dynamicStreamEvent = Reflect.get(target, "onDynamicStreamEvent");
    const streamDisposable =
      typeof dynamicStreamEvent === "function"
        ? dynamicStreamEvent.call(
            target,
            params.taskId,
          )((event: KayingCodeStreamEvent) => {
            if (isRemoteMirrorableStreamEvent(event)) {
              taskRealtimePort.publishStreamOp(mirrorTarget, {
                kind: "stream_event",
                event,
              });
            }
          })
        : null;

    try {
      return await sendPrompt.call(target, params);
    } finally {
      // 远端 kayingcode-server 没有 desktop realtime port；由窗口 Host 内的
      // remote facade 接管 lease 和 stream mirror，确保 UI 能持续收到远端会话流。
      streamDisposable?.dispose();
      taskRealtimePort.releaseTaskRunLease(mirrorTarget);
    }
  }

  function finishWorkspaceTask(taskId: string, meta: KayingCodeTaskMeta): void {
    workspaceProxyState.disposeTaskReadySubscription(taskId);
    workspaceTaskTracker.finish(taskId, meta);
  }

  function beginWorkspaceTask(target: T, taskId: string, meta: KayingCodeTaskMeta): boolean {
    const started = workspaceTaskTracker.begin(taskId, meta);
    if (!started) {
      return false;
    }
    const onDynamicTaskReady = Reflect.get(target, "onDynamicTaskReady");
    if (typeof onDynamicTaskReady !== "function") {
      workspaceTaskTracker.finish(taskId, meta);
      throw new Error("remote KayingCode task service does not expose onDynamicTaskReady");
    }
    const subscribe = onDynamicTaskReady.call(target, taskId);
    if (typeof subscribe !== "function") {
      workspaceTaskTracker.finish(taskId, meta);
      throw new Error("remote KayingCode task ready event is not subscribable");
    }
    workspaceProxyState.trackTaskReady(
      taskId,
      meta,
      (listener) => subscribe(listener),
      () => finishWorkspaceTask(taskId, meta),
    );
    return true;
  }

  // remote workspace 的 KayingCode Agent manager 跑在远端 server，desktop main 不能直接看到
  // `handles` 状态。sendPrompt Promise 只是远端 ACK，必须等待 task ready 才能允许回收 workspace。
  return new Proxy(service, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if ((property === "createTask" || property === "resumeTask") && typeof value === "function") {
        return async (...args: unknown[]) => {
          const result = await value.apply(target, args);
          rememberTaskMeta(result);
          return result;
        };
      }
      if (
        (property === "listTasks" ||
          property === "listPinnedTasks" ||
          property === "listTaskList" ||
          property === "listArchivedTasks" ||
          property === "getTaskMeta" ||
          property === "getTaskSnapshot" ||
          property === "getTaskSnapshotWithEtag") &&
        typeof value === "function"
      ) {
        return async (...args: unknown[]) => {
          const result = await value.apply(target, args);
          rememberTaskMetasFromResult(result);
          return result;
        };
      }
      if (property === "releaseWorkspacePreparation" && typeof value === "function") {
        return async (...args: unknown[]) => {
          const result = await value.apply(target, args);
          const context = args[0];
          if (
            typeof context === "object" &&
            context !== null &&
            typeof (context as { workspacePath?: unknown }).workspacePath === "string"
          ) {
            const workspaceContext = context as {
              workspacePath: string;
              workspaceIdentity?: string;
            };
            // pooled Host 不随 tab 退出；runtime 成功释放后必须同步解除 Host 代理层引用，
            // 否则 task meta 和动态事件 listener 会在整个应用生命周期内单调增长。
            workspaceProxyState.clearWorkspace(workspaceContext);
            workspaceTaskTracker.clearWorkspace(workspaceContext);
          }
          return result;
        };
      }
      const shouldWrapSendPrompt =
        options?.reportRunningPromptCount !== false ||
        Boolean(options?.taskRealtimePort) ||
        Boolean(options?.materializePromptAttachments);
      if (property !== "sendPrompt" || typeof value !== "function" || !shouldWrapSendPrompt) {
        return value;
      }

      return async (...args: unknown[]) => {
        let trackedTask: { taskId: string; meta: KayingCodeTaskMeta; started: boolean } | undefined;
        let tracksOnlyRpcLifetime = false;
        try {
          const params = args[0];
          if (
            typeof params === "object" &&
            params !== null &&
            typeof (params as { taskId?: unknown }).taskId === "string" &&
            typeof (params as { traceId?: unknown }).traceId === "string" &&
            typeof (params as { content?: unknown }).content === "string"
          ) {
            const promptParams = params as {
              taskId: string;
              traceId: TraceId;
              content: string;
              attachments?: KayingCodePromptAttachment[];
            };
            const taskMeta = workspaceProxyState.getTaskMeta(promptParams.taskId) as
              | KayingCodeTaskMeta
              | undefined;
            if (taskMeta) {
              trackedTask = {
                taskId: promptParams.taskId,
                meta: taskMeta,
                started: beginWorkspaceTask(target, promptParams.taskId, taskMeta),
              };
            } else if (options?.reportRunningPromptCount !== false) {
              // task meta 缺失时无法安全伪造 workspace identity；仅保留 ACK 期间的 Host 退出诊断，
              // 不让该 fallback 参与 workspace runtime 的释放裁决。
              tracksOnlyRpcLifetime = true;
              untrackedPromptRpcCount += 1;
              reportHostRunningTaskCount();
            }
            const preparedParams = await prepareRemotePromptParams(promptParams);
            return await mirrorRemotePrompt(
              target,
              value.bind(target) as (...promptArgs: unknown[]) => Promise<unknown>,
              preparedParams,
            );
          }
          if (options?.reportRunningPromptCount !== false) {
            tracksOnlyRpcLifetime = true;
            untrackedPromptRpcCount += 1;
            reportHostRunningTaskCount();
          }
          return await value.apply(target, args);
        } catch (error) {
          if (trackedTask?.started) {
            finishWorkspaceTask(trackedTask.taskId, trackedTask.meta);
          }
          throw error;
        } finally {
          if (tracksOnlyRpcLifetime) {
            untrackedPromptRpcCount = Math.max(0, untrackedPromptRpcCount - 1);
            reportHostRunningTaskCount();
          }
        }
      };
    },
  });
}

function warmUpKayingCodeAgent(
  services: ServiceCollection,
  context: { workspacePath?: string; workspaceIdentity?: string },
  reason: string,
): void {
  if (!context.workspacePath) {
    return;
  }
  const workspacePath = context.workspacePath;
  const workspaceIdentity = context.workspaceIdentity;
  const kayingcodeSessionService = services.getOptional(IKayingCodeSessionService);
  if (!kayingcodeSessionService) {
    return;
  }
  void kayingcodeSessionService
    .initializeWorkspace({
      workspacePath,
      ...(workspaceIdentity ? { workspaceIdentity } : {}),
    })
    .then((result) => {
      if (!result.available) {
        if (result.reasonCode === "provider_not_ready") {
          logger.info(
            `KayingCode agent warmup waiting for provider/model (${reason}) workspace=${workspacePath}`,
          );
          return;
        }
        logger.warn(
          `KayingCode agent warmup unavailable (${reason}) workspace=${workspacePath} reason=${result.reason ?? "unknown"}`,
        );
        return;
      }
      // 模型候选和首选项已经由目标 Host ModelSelectionView 提供；workspace
      // presentation 只剩 mode 与 slash commands。预热不能为读取 presentation 额外创建
      // Agent App，否则其 MCP close 会占住协议通道并阻塞真正的 Session 初始化。
      logger.info(
        `KayingCode agent warmup ready (${reason}) workspace=${workspacePath} transport=${result.transportKind ?? "unknown"}`,
      );
    })
    .catch((error) => {
      logger.warn(`KayingCode agent warmup failed (${reason}) workspace=${workspacePath}:`, error);
    });
}

// 后台输出轮询仍需独立的 debug logger，不能随其他日志调用方移除而丢失工厂导入。
const rpcDebugLogger = createServiceLogger("rpc");

function logRpc(message: string, ...args: unknown[]): void {
  const level = resolveRpcLogLevel(message, ...args);
  if (level === "debug") {
    rpcDebugLogger.debug(undefined, message, ...args);
    return;
  }
  logger[level](message, ...args);
}

function formatRemoteTargetForLog(target: WorkspaceConnectionTarget): string {
  switch (target.kind) {
    case "ssh":
      return `ssh:${target.username}@${target.host}:${target.port ?? 22}`;
    case "wsl": {
      const user = target.user?.trim();
      const distro = target.distro ?? "default";
      return user ? `wsl:${distro}:${user}` : `wsl:${distro}`;
    }
    case "docker":
      return `docker:${target.container}`;
    case "server":
      return "ssh" in target
        ? `server:ssh-tunnel:${target.ssh.username}@${target.ssh.host}:${target.ssh.port ?? 22}`
        : `server:${target.serverId ?? target.url}`;
  }
}

console.log = (...args: unknown[]) => {
  rawConsole.log(...args);
  reportHostLog("info", args);
  remoteConnectionProgressContext.report("info", args);
};

console.warn = (...args: unknown[]) => {
  rawConsole.warn(...args);
  reportHostLog("warn", args);
  remoteConnectionProgressContext.report("warn", args);
};

console.error = (...args: unknown[]) => {
  rawConsole.error(...args);
  // Electron 会把 Node warning 先走 console.error，而 process warning listener 随后还会
  // 结构化记录 warn；若这里继续上报，就会为同一个 warning 留下一条 error 和一条 warn。
  if (!shouldReportHostConsoleError(args)) {
    return;
  }
  reportHostLog("error", args);
  remoteConnectionProgressContext.report("error", args);
};

/** 当前 host 已注册的服务集合，进程退出时用于统一回收本地资源 */
let databaseStartup: ReturnType<typeof createHostDatabaseStartup> | undefined;
const pendingStartupAttachments = new Map<string, () => void>();
let activeServices: ServiceCollection | null = null;
let activeHostApiNetworkTransport: HostApiNetworkTransport | null = null;
/** 本地 host services 的资源遥测订阅；远端连接的订阅由各自的 connection handle 持有。 */
let activeLocalResourceTelemetry: IDisposable | null = null;
// 资源管理器采样只在 main 请求时执行一次，Host 不维护任何周期定时器。
const hostResourceUsageResponder = createHostResourceUsageResponder({
  getAgentService: () => activeServices?.getOptional(IKayingCodeAgentService),
  postMessage: (message) => parentPort?.postMessage(message),
});
let activeSessionRealtimePort: ReturnType<typeof createTaskRealtimeBridgeForHostInit> = null;
let hasDisposedHostResources = false;
let disposeHostResourcesInFlight: Promise<HostShutdownResult> | null = null;

function requireActiveHostApiNetworkTransport(): HostApiNetworkTransport {
  if (!activeHostApiNetworkTransport) {
    // Bug 原因：remote asset 若在 Host 网络策略就绪前回退 global fetch，会绕过设置页显式代理。
    throw new Error("Window Host network transport is not initialized");
  }
  return activeHostApiNetworkTransport;
}

function notifyProjectChange(): void {
  void activeServices
    ?.getOptional(IBroadcastService)
    ?.send({ channel: "state:projects", payload: {} })
    .catch((error: unknown) => logger.warn("failed to notify project change", error));
}

/**
 * Lazy 初始化 Source Server 目录与连接管理器。
 * 目录持久化发生在首次 snapshot/connect 内；这里不在 Host 启动热路径读取 settings。
 */
async function ensureSourceServerConnectionManager(): Promise<SourceServerConnectionManager> {
  if (sourceServerConnectionManager) return sourceServerConnectionManager;
  const deps = sourceServerRuntimeDeps;
  if (!deps) throw new Error("Source Server runtime 尚未初始化");
  if (!activeServices) throw new Error("Host services 尚未初始化");
  sourceServerRuntimeInitializeFlight ??= (async () => {
    const directory = new SourceServerDirectory({
      settingService: deps.services.get(ISettingService),
      credentialService: deps.services.get(ICredentialService),
      // host 域没有 debug 通道；生产 no-op，避免目录诊断刷盘。
      logDebug: (message) => {
        if (process.env.NODE_ENV !== "production") logger.info(message);
      },
    });
    const resolveRelease = async (
      probe: Parameters<typeof resolveSourceServerReleaseAsset>[0],
      target: Parameters<typeof resolveSourceServerReleaseAsset>[2],
      options?: { metadataOnly?: boolean },
    ) =>
      await resolveSourceServerReleaseAsset(
        probe,
        deps.remoteAssets,
        target,
        { fetch: deps.fetch },
        options,
      );
    const manager = new SourceServerConnectionManager({
      directory,
      admitConnection: createRemoteProjectConnectionAdmission(
        deps.services.get(IRemoteProjectService),
      ),
      onProjectChange: notifyProjectChange,
      logWarn: (message, error) => logger.warn(message, error),
      sourceServerArtifactPolicy,
      resolveRelease,
      connectServer: (options) =>
        connectDesktopSourceServer(options, {
          resolveServices: (scope) => windowRemoteConnectionRegistry.resolveScopedServices(scope),
          getBots: () => activeServices?.getOptional(IBotsService),
          readDynamicWorkflowMode: async () =>
            (await activeServices?.get(ISettingService).get())?.dynamicWorkflowMode,
          onModeSyncError: (error) =>
            logger.warn("remote dynamic workflow user mode push failed", error),
        }),
    });
    sourceServerDirectory = directory;
    sourceServerConnectionManager = manager;
    return manager;
  })().finally(() => {
    sourceServerRuntimeInitializeFlight = null;
  });
  return await sourceServerRuntimeInitializeFlight;
}

/**
 * Source 换代/断开后，当前窗口的 source-settings attachment 不能继续命中旧 RPC generation。
 * 同一 Source 若已被新的在线 owner 接管（手动重连），旧代释放不能连带关掉新 attachment。
 */
function detachSourceSettingsForConnection(
  sourceServerId: string,
  services: ServiceCollection,
): void {
  const registered = windowRemoteConnectionRegistry.getOnlineSource(sourceServerId);
  if (registered && registered.services !== services) return;
  windowHostAttachmentRegistry.detachSourceSettingsAttachments(sourceServerId);
}

/** Source Settings attachment 只解析当前在线的 Source 代际。 */
function resolveOnlineSourceConnectionServices(sourceServerId: string): {
  services: IServiceAccessorLike;
  generation: number;
} | null {
  // URL 直连的稳定 serverId 由握手回填到 window registry；按身份定位在线代际，
  // 不再依赖 target.serverId 是否被 Renderer 提前填写。
  const registered = windowRemoteConnectionRegistry.getOnlineSource(sourceServerId);
  if (registered) {
    return { services: registered.services, generation: registered.generation };
  }
  // 受管 Source（SSH/WSL/Docker）即使没有窗口 logical session，Manager 也可能持有在线连接。
  const managed = sourceServerConnectionManager?.getOnlineConnection(sourceServerId);
  if (managed) {
    return {
      services: managed.services,
      generation:
        sourceServerConnectionManager
          ?.listStates()
          .find((state) => state.sourceServerId === sourceServerId)?.updatedAt ?? 1,
    };
  }
  // 离线 fail-closed：不伪造本地 settings 面。
  return null;
}

type IServiceAccessorLike = Parameters<typeof createSourceSettingsServiceCollection>[0];

/** Source Server 运行态必须在本地服务关闭前收口：Manager 会读取 setting 记录 lastOnline。 */
function disposeSourceServerRuntime(): void {
  sourceSettingsStateSubscription?.dispose();
  sourceSettingsStateSubscription = null;
  sourceServerManagementService?.dispose();
  sourceServerManagementService = null;
  sourceServerConnectionManager?.dispose();
  sourceServerConnectionManager = null;
  sourceServerDirectory = null;
  sourceServerRuntimeDeps = null;
  sourceServerRuntimeInitializeFlight = null;
}

async function createWindowRemoteConnectionHandle(params: {
  target: WorkspaceConnectionTarget;
  remoteAssets: WindowRemoteAssetDirs;
  signal: AbortSignal;
  confirmSourceServerInstall?: boolean;
}): Promise<WindowRemoteConnectionHandle<ServiceCollection, HostRemoteConnectionCapabilities>> {
  if (!activeServices) throw new Error("Local Host services are not initialized.");
  if (params.signal.aborted) {
    throw new Error("远程连接已取消");
  }
  const closeListeners = new Set<(event: WindowRemoteConnectionCloseEvent) => void>();
  let topicResourceRelay: ReturnType<typeof createWindowTopicResourceRelay> | undefined;
  const notifyClose = (event: WindowRemoteConnectionCloseEvent) => {
    topicResourceRelay?.dispose();
    for (const listener of closeListeners) {
      listener(event);
    }
  };
  if (params.target.kind === "server" && "url" in params.target) {
    // 已运行的 Source Server：直接连它的 Host RPC；成员关系与 token 由 RemoteProject 服务持久化。
    const clientConfigService = activeServices.get(IClientConfigService);
    const admission = await prepareRemoteServerConnection({
      service: activeServices.get(IRemoteProjectService),
      credentials: activeServices.get(ICredentialService),
      target: params.target,
      intent: "add",
    });
    params.signal.throwIfAborted();
    let connection: Awaited<ReturnType<typeof connectServerRemote>> | undefined;
    let sourceSettingsServices: ServiceCollection | undefined;
    topicResourceRelay = createWindowTopicResourceRelay({
      getPeerAgentService: () => connection?.services.kayingcodeAgentService,
      resolveServices: (scope) => windowRemoteConnectionRegistry.resolveScopedServices(scope),
      getBots: () => activeServices?.getOptional(IBotsService),
    });
    try {
      connection = await connectServerRemote(admission.target, {
        signal: params.signal,
        fetchImpl: requireActiveHostApiNetworkTransport().fetch,
        commitMembership: admission.commit,
        topicResourceChannel: topicResourceRelay.channel,
        onClose: ({ code, reason }) => {
          const closed = connection;
          if (closed && sourceSettingsServices) {
            detachSourceSettingsForConnection(closed.serverInfo.serverId, sourceSettingsServices);
          }
          notifyClose({ exitCode: code, signal: null, ...(reason ? { error: reason } : {}) });
        },
      });
    } catch (error) {
      topicResourceRelay.dispose();
      topicResourceRelay = undefined;
      throw error;
    }
    if (params.signal.aborted) {
      topicResourceRelay.dispose();
      topicResourceRelay = undefined;
      connection.dispose();
      throw new Error("Source Server 连接已取消");
    }
    const connected = connection;
    const services = createServerRemoteWorkspaceServiceCollection({
      clientConfigService,
      connectionServices: connected.services,
      ...(connected.serverInfo.capabilities.virtualProjects ? { virtualProjects: true } : {}),
      serverId: connected.serverInfo.serverId,
      targetKind: "server",
      sourceServices: activeServices,
    });
    sourceSettingsServices = services;
    let disposed = false;
    return {
      services,
      serverInfo: connected.serverInfo,
      capabilities: {
        sourceServerId: connected.serverInfo.serverId,
        sourceAccessor: () => connected.services,
      },
      onDidClose(listener) {
        closeListeners.add(listener);
        return { dispose: () => closeListeners.delete(listener) };
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        detachSourceSettingsForConnection(connected.serverInfo.serverId, services);
        topicResourceRelay?.dispose();
        topicResourceRelay = undefined;
        closeListeners.clear();
        // 窗口 collection 只是 Source RPC 的转发面；调用 disposeServiceResources 会把
        // disposeAll 转发到远端 Host，误杀 Source 上其他窗口/会话。物理连接由下面唯一释放。
        connected.dispose();
      },
    };
  }
  if (params.target.kind === "server" && "ssh" in params.target) {
    const connection = await connectRemoteAgent({
      target: params.target,
      signal: params.signal,
      request: requireActiveHostApiNetworkTransport().fetch,
    });
    if (params.signal.aborted) {
      await connection.dispose();
      throw new Error("远程 Agent 连接已取消");
    }
    const closeSubscription = connection.onDidClose(notifyClose);
    const services = createRemoteAgentServiceCollection({
      connectionServices: connection.services,
      createReportingRemoteKayingCodeTaskService: (service) =>
        createReportingRemoteKayingCodeTaskService(service, {
          taskRealtimePort: activeSessionRealtimePort ?? undefined,
        }),
    });
    let disposed = false;
    return {
      services,
      serverInfo: connection.serverInfo,
      // Remote Agent 的 serverId 来自握手；没有它窗口目录无法按 hostId 找回在线连接。
      capabilities: {
        sourceServerId: connection.serverInfo.serverId,
        sourceAccessor: () => connection.services,
      },
      onDidClose(listener) {
        closeListeners.add(listener);
        return { dispose: () => closeListeners.delete(listener) };
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        closeSubscription.dispose();
        closeListeners.clear();
        await disposeServiceResourcesAndWait(services);
        await connection.dispose();
      },
    };
  }
  // SSH/WSL/Docker：Source Server Manager 负责部署、握手与物理连接复用。窗口只持 logical lease，
  // 关闭最后一个 logical session / attachment 不会断开 Manager 的常驻 Source。
  // Remote Agent（server + ssh）已在上面单独处理并返回，不进入 Manager。
  const managedTarget = params.target;
  const manager = await ensureSourceServerConnectionManager();
  const directory = sourceServerDirectory;
  if (!directory) throw new Error("Source Server directory 尚未初始化");
  const { connection: managed } = await connectSourceServerTarget(directory, manager, {
    target: managedTarget,
    membershipIntent: "add",
    allowInstall: params.confirmSourceServerInstall === true,
    resolveRelease: async (probe, target, options) =>
      await resolveSourceServerReleaseAsset(
        probe,
        params.remoteAssets,
        target,
        { fetch: requireActiveHostApiNetworkTransport().fetch },
        options,
      ),
    context: {
      signal: params.signal,
      onLog: (event) => {
        const progress =
          event.progress == null
            ? ""
            : ` ${(Math.max(0, Math.min(1, event.progress)) * 100).toFixed(1)}%`;
        const message =
          event.progress == null || event.message.startsWith("upload progress:")
            ? `[source-server:${event.phase}] ${event.message}`
            : `[source-server:${event.phase}] upload progress (${event.message}):${progress}`;
        remoteConnectionProgressContext.report(event.level ?? "info", [message]);
      },
    },
  });
  params.signal.throwIfAborted();
  const sourceServerId = managed.sourceServerId;
  const profileId = managed.profileId;
  // 展示名只用于 workspace fact；异步读取失败不影响连接本身。
  void sourceServerDirectory
    ?.snapshot()
    .then((snapshot) => {
      for (const server of snapshot.servers)
        sourceServerDisplayNameById.set(server.sourceServerId, server.displayName);
    })
    .catch(() => undefined);
  const clientConfigService = activeServices.get(IClientConfigService);
  let currentConnection = { serverInfo: managed.serverInfo, services: managed.services };
  const buildServices = () =>
    createServerRemoteWorkspaceServiceCollection({
      clientConfigService,
      connectionServices: currentConnection.services,
      ...(currentConnection.serverInfo.capabilities.virtualProjects
        ? { virtualProjects: true }
        : {}),
      serverId: sourceServerId,
      targetKind: managedTarget.kind,
      sourceServices: activeServices ?? undefined,
    });
  let services = buildServices();
  // 远端 workspace 的 CLI 与 MCP 样本走与本地同一条路径：远端 Source Host → 本地 Host → main。
  // 订阅寿命等于当前 Source 代际；自动重连换代时必须先释放旧订阅再挂新代理。
  const registerTelemetry = () =>
    registerHostServiceResourceTelemetry({
      services,
      postMessage: (message) => parentPort?.postMessage(message),
      runtimeSurface: "remote",
      telemetrySupported:
        currentConnection.serverInfo.capabilities.processResourceTelemetry === true,
      environmentKey: resolveResourceTelemetryEnvironmentKey(managedTarget, sourceServerId),
      onError: (error) => logger.warn("remote resource telemetry subscription failed", error),
    });
  let resourceTelemetry = registerTelemetry();
  const refreshResourceTelemetry = () => {
    resourceTelemetry.dispose();
    resourceTelemetry = registerTelemetry();
  };
  // 桌面 attachment 对远端媒体走 Host loopback Range 数据面；services 随 Source 重连换代，
  // 工厂在调用时再取当前 file service。
  const remoteMediaPreviewFactory = !remoteMediaRangePreviewEnabled
    ? undefined
    : (scope: Extract<WindowHostAttachmentScope, { kind: "remote" }>) =>
        createRemoteMediaPreviewProxy({
          fileService: services.get(IFileService),
          logger: {
            debug: (message, metadata) => {
              if (process.env.NODE_ENV !== "production") logger.info(message, metadata);
            },
            warn: (message, metadata) => logger.warn(message, metadata),
          },
          scope,
          requestLimiter: hostRemoteMediaRequestLimiter,
        });
  let disposed = false;
  let lastNotifiedRecoveryAttempt = 0;
  const reconnectListeners = new Set<() => void>();
  const stateSubscription = manager.onDidChangeState((state) => {
    if (state.profileId !== profileId) return;
    if (state.state === "online") {
      lastNotifiedRecoveryAttempt = 0;
      return;
    }
    const closeEvent = createSourceServerRecoveryCloseEvent(state);
    if (!closeEvent) return;
    // Manager 会连续发布 retrying(1/3→3/3)；只按 attempt 去重，Renderer 才能看到进度。
    if (state.state === "retrying" && state.recoveryAttempt === lastNotifiedRecoveryAttempt) {
      return;
    }
    if (state.state === "retrying") {
      lastNotifiedRecoveryAttempt = state.recoveryAttempt ?? lastNotifiedRecoveryAttempt;
    }
    notifyClose(closeEvent);
  });
  const invalidatedSubscription = manager.onDidInvalidateConnection((event) => {
    if (event.sourceServerId !== sourceServerId || disposed) return;
    // 更新允许恢复；删除当前 Profile 属于用户显式断开，必须发布 terminal close。
    notifyClose({ exitCode: null, signal: null, recoverable: event.reason === "update" });
  });
  const reconnectSubscription = manager.onDidReconnect((reconnected) => {
    if (reconnected.sourceServerId !== sourceServerId || disposed) return;
    currentConnection = {
      serverInfo: reconnected.serverInfo,
      services: reconnected.services,
    };
    services = buildServices();
    refreshResourceTelemetry();
    lastNotifiedRecoveryAttempt = 0;
    for (const listener of reconnectListeners) listener();
  });
  return {
    get services() {
      return services;
    },
    get serverInfo() {
      return currentConnection.serverInfo;
    },
    // 复用事实来自 Manager，registry 用它填充 descriptor.reusedConnectionTarget。
    ...(managed.reusedConnectionTarget
      ? { reusedConnectionTarget: managed.reusedConnectionTarget }
      : {}),
    capabilities: {
      sourceServerId,
      profileId,
      persistentSourceConnection: true,
      // Manager 重连会换 currentConnection；accessor 必须延迟读取当前代际。
      sourceAccessor: () => currentConnection.services,
      browserRecordingUploader: {
        upload: async (localPath, remotePath, options) =>
          await manager.getFileTransfer(sourceServerId).upload(localPath, remotePath, options),
      },
      ...(remoteMediaPreviewFactory ? { remoteMediaPreviewFactory } : {}),
    },
    onDidClose(listener) {
      closeListeners.add(listener);
      return { dispose: () => closeListeners.delete(listener) };
    },
    onDidReconnect(listener) {
      reconnectListeners.add(listener);
      return { dispose: () => reconnectListeners.delete(listener) };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      closeListeners.clear();
      reconnectListeners.clear();
      stateSubscription.dispose();
      invalidatedSubscription.dispose();
      reconnectSubscription.dispose();
      resourceTelemetry.dispose();
      // logical lease 释放：既不 dispose 转发到远端 Host 的 services，也不断开 Manager 的物理 Source。
    },
  };
}

const windowRemoteConnectionRegistry = createWindowRemoteConnectionRegistry<
  ServiceCollection,
  HostRemoteConnectionCapabilities
>({
  connect: (request) => createWindowRemoteConnectionHandle(request),
  createId: randomUUID,
  // Source 身份来自握手后的 capabilities；Remote Agent 为 undefined，保持按 target 复用。
  resolveSourceServerId: (handle) => handle.capabilities?.sourceServerId,
  // 受管 Source 的物理连接归 Manager；registry 只持有订阅与 logical lease。
  shouldKeepConnectionAlive: (handle) => handle.capabilities?.persistentSourceConnection === true,
  releaseWorkspace: async (services, context) => {
    await services.get(IKayingCodeTaskService).releaseWorkspacePreparation({
      workspacePath: context.workspacePath,
      ...(context.workspaceIdentity ? { workspaceIdentity: context.workspaceIdentity } : {}),
      provider: "glm",
    });
    logger.info(
      `released WSL workspace runtime, workspaceKey=${context.workspaceIdentity?.trim() || context.workspacePath}`,
    );
  },
  onWorkspaceReleaseError: (context, error) => {
    logger.warn(
      `failed to release WSL workspace runtime, workspaceKey=${context.workspaceIdentity?.trim() || context.workspacePath}`,
      error,
    );
  },
  onSessionClosed: (event) => {
    // logical session 已离线时 attachment 仍持有旧 services/订阅；后续 sessionId
    // 换代只释放 transport，无法按旧 ID 找回这些端口。Host 在失效源头统一关闭所有 clientMode。
    windowHostAttachmentRegistry.detachRemoteSessionAttachments(event.remoteSessionId);
    const session = windowRemoteConnectionRegistry.getSession(event.remoteSessionId);
    if (session?.workspacePath && session.workspaceIdentity) {
      windowHostControllerRuntime.disconnectSource({
        kind: "remote",
        remoteSessionId: event.remoteSessionId,
        workspacePath: session.workspacePath,
        workspaceIdentity: session.workspaceIdentity,
      });
    }
    parentPort?.postMessage({
      type: HostResponseTypes.RemoteWorkspaceClosed,
      remoteSessionId: event.remoteSessionId,
      reason: "connection-closed",
      exitCode: event.exitCode,
      signal: event.signal,
      ...(event.recoverable !== undefined ? { recoverable: event.recoverable } : {}),
      ...(event.error ? { error: event.error } : {}),
      ...(event.recoveryAttempt ? { recoveryAttempt: event.recoveryAttempt } : {}),
      ...(event.recoveryLimit ? { recoveryLimit: event.recoveryLimit } : {}),
      ...(event.recoveryBudgetExhausted !== undefined
        ? { recoveryBudgetExhausted: event.recoveryBudgetExhausted }
        : {}),
      ...(event.reasonCode ? { reasonCode: event.reasonCode } : {}),
      ...(event.retryable !== undefined ? { retryable: event.retryable } : {}),
    });
    logWindowHostTopology("remote-connection-closed");
  },
  // Source 物理连接自动重连后，Registry 已生成新的 logical session；这里负责 Controller
  // 投影原子换代与 Main 的 route 重映射。提交失败由 Registry 回滚上一代离线 owner。
  onSessionReconnected: async ({
    previous,
    current,
    services: currentServices,
    isCurrent,
    commit,
  }) => {
    if (
      !previous.workspacePath ||
      !previous.workspaceIdentity ||
      !current.workspacePath ||
      !current.workspaceIdentity
    ) {
      throw new Error("Source 重连换代缺少 workspace scope");
    }
    const previousScope = {
      kind: "remote" as const,
      ...(previous.sourceServerId ? { sourceServerId: previous.sourceServerId } : {}),
      remoteSessionId: previous.remoteSessionId,
      workspacePath: previous.workspacePath,
      workspaceIdentity: previous.workspaceIdentity,
    };
    const currentScope = {
      kind: "remote" as const,
      ...(current.sourceServerId ? { sourceServerId: current.sourceServerId } : {}),
      ...(current.sourceServerId && sourceServerDisplayNameById.get(current.sourceServerId)
        ? { serverDisplayName: sourceServerDisplayNameById.get(current.sourceServerId) }
        : {}),
      remoteSessionId: current.remoteSessionId,
      workspacePath: current.workspacePath,
      workspaceIdentity: current.workspaceIdentity,
    };
    await windowHostControllerRuntime.replaceDisconnectedSource(
      previousScope,
      {
        scope: currentScope,
        taskService: currentServices.get(IKayingCodeTaskService),
        agentService: currentServices.getOptional(IKayingCodeAgentService),
        sourceAvailability: "online",
      },
      { canCommit: isCurrent, rollbackOnFailure: true },
    );
    if (!commit()) {
      throw new Error("Source 重连换代在 Controller 提交后失去 Registry owner");
    }
    try {
      parentPort?.postMessage({
        type: HostResponseTypes.RemoteWorkspaceReconnected,
        previousRemoteSessionId: previous.remoteSessionId,
        descriptor: {
          ...(current.sourceServerId ? { sourceServerId: current.sourceServerId } : {}),
          remoteSessionId: current.remoteSessionId,
          target: current.target,
          workspacePath: current.workspacePath,
          workspaceIdentity: current.workspaceIdentity,
          generation: current.generation,
        },
      });
    } catch (error) {
      // Controller 已提交新 generation 后不能再回滚；通道失效由 Host shutdown 统一收口。
      logger.error("failed to publish committed remote workspace replacement", error);
    }
    logWindowHostTopology("remote-connection-reconnected");
  },
  onSessionReconnectError: (error) => {
    logger.warn("failed to replace Source Server logical sessions after reconnect", error);
  },
});

const windowHostControllerRuntime = createWindowHostControllerRuntime({
  createId: randomUUID,
  // 命令中心/全局搜索的 host scope 直接读持久化 owner，不依赖已打开工作区。
  readHostTaskList: (query) => {
    if (!activeServices) throw new Error("Window Host services unavailable");
    return activeServices.get(IKayingCodeTaskService).listTaskList(query);
  },
  onSourceError: (scope, operation, error) => {
    logger.warn(
      `window Controller source ${operation} failed, scope=${scope.kind}, workspaceKey=${scope.workspaceIdentity?.trim() || scope.workspacePath}`,
      error,
    );
  },
  resolveSource: (scope) => {
    const remoteSession = windowRemoteConnectionRegistry.findSessionForWorkspace(scope);
    if (remoteSession?.workspacePath && remoteSession.workspaceIdentity) {
      const controllerScope = {
        kind: "remote" as const,
        ...(remoteSession.sourceServerId ? { sourceServerId: remoteSession.sourceServerId } : {}),
        ...(remoteSession.sourceServerId &&
        sourceServerDisplayNameById.get(remoteSession.sourceServerId)
          ? { serverDisplayName: sourceServerDisplayNameById.get(remoteSession.sourceServerId) }
          : {}),
        remoteSessionId: remoteSession.remoteSessionId,
        workspacePath: remoteSession.workspacePath,
        workspaceIdentity: remoteSession.workspaceIdentity,
      };
      if (remoteSession.sourceAvailability !== "online") {
        return { scope: controllerScope, sourceAvailability: "offline" as const };
      }
      const services = windowRemoteConnectionRegistry.resolveScopedServices(controllerScope);
      return {
        scope: controllerScope,
        taskService: services.get(IKayingCodeTaskService),
        agentService: services.getOptional(IKayingCodeAgentService),
        sourceAvailability: "online" as const,
      };
    }
    // 远程 history scope 未连接或已被移除时，绝不能落回本地 tasks-index。
    if (scope.workspaceIdentity && isRemoteWorkspaceIdentity(scope.workspaceIdentity)) {
      // 项目树与命令中心不要求打开 workspace tab；复用稳定 Source 的现有物理连接，
      // 不能伪造 logical session，也不能因为没开 tab 就把在线 Source 当成离线。
      const identity = parseRemoteWorkspaceIdentity(scope.workspaceIdentity);
      const sourceServerId =
        identity?.kind === "server" && identity.workspacePath === scope.workspacePath
          ? identity.sourceServerId
          : undefined;
      const connection = sourceServerId
        ? sourceServerConnectionManager?.getOnlineConnection(sourceServerId)
        : undefined;
      const registered = sourceServerId
        ? windowRemoteConnectionRegistry.getOnlineSource(sourceServerId)
        : undefined;
      if (sourceServerId && (connection || registered)) {
        return {
          scope: {
            kind: "remote" as const,
            sourceServerId,
            ...(sourceServerDisplayNameById.get(sourceServerId)
              ? { serverDisplayName: sourceServerDisplayNameById.get(sourceServerId) }
              : {}),
            workspacePath: scope.workspacePath,
            workspaceIdentity: scope.workspaceIdentity,
          },
          taskService:
            connection?.services.kayingcodeTaskService ??
            registered!.services.get(IKayingCodeTaskService),
          agentService:
            connection?.services.kayingcodeAgentService ??
            registered!.services.getOptional(IKayingCodeAgentService),
          sourceAvailability: "online" as const,
        };
      }
      return null;
    }
    const taskService = activeServices?.getOptional(IKayingCodeTaskService);
    if (!taskService) {
      return null;
    }
    return {
      scope: {
        kind: "local" as const,
        workspacePath: scope.workspacePath,
        ...(scope.workspaceIdentity ? { workspaceIdentity: scope.workspaceIdentity } : {}),
      },
      taskService,
      agentService: activeServices?.getOptional(IKayingCodeAgentService),
      sourceAvailability: "online" as const,
    };
  },
});

// 手机 project.readTree 叠加实时待处理交互；只有手机 attachment 存在时才监听投影并广播。
const webRemoteProjectTreeActivity = createWebRemoteProjectTreeActivityBridge({
  readRows: () => windowHostControllerRuntime.readTaskRows(),
  subscribeRows: (onChange) => windowHostControllerRuntime.subscribeTaskRows(onChange),
  notifyProjectChange,
});

function wireLocalResourceTelemetry(services: ServiceCollection): void {
  activeLocalResourceTelemetry?.dispose();
  activeLocalResourceTelemetry = registerHostServiceResourceTelemetry({
    services,
    postMessage: (message) => parentPort?.postMessage(message),
    runtimeSurface: "local",
    onError: (error) => logger.warn("local resource telemetry subscription failed", error),
  });
}

function disposeLocalResourceTelemetry(): void {
  try {
    activeLocalResourceTelemetry?.dispose();
  } catch {
    // 资源遥测释放失败不能阻塞 Host 的既有 shutdown barrier。
  } finally {
    activeLocalResourceTelemetry = null;
  }
}

type ExposedServicePortHandle = {
  server: IChannelServer & { ready(): void };
  dispose(): void;
};

function createControllerRoutedTaskService(
  base: IKayingCodeTaskService,
  attachmentScope: WindowHostAttachmentScope,
): IKayingCodeTaskService {
  const route = async (
    params: {
      taskId: string;
      workspacePath: string;
      workspaceIdentity?: string;
    },
    mutation:
      | { kind: "pin"; pinned: boolean }
      | { kind: "archive"; archived: boolean }
      | { kind: "delete" }
      | { kind: "mark-read"; expectedUnreadAt?: number }
      | { kind: "mark-unread" },
  ) =>
    windowHostControllerRuntime.service.mutateTask({
      address: await windowHostControllerRuntime.resolveTaskAddress({
        taskId: params.taskId,
        workspacePath: params.workspacePath,
        ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
        attachmentScope,
      }),
      mutation,
    });

  return new Proxy(base, {
    get(target, property, receiver) {
      if (property === "setTaskPinned") {
        return async (params: Parameters<IKayingCodeTaskService["setTaskPinned"]>[0]) => {
          const meta = await route(params, { kind: "pin", pinned: params.pinned });
          if (!meta) throw new Error("pin mutation 后 task 投影缺失");
          return meta;
        };
      }
      if (property === "archiveTask" || property === "unarchiveTask") {
        return async (
          params:
            | Parameters<IKayingCodeTaskService["archiveTask"]>[0]
            | Parameters<IKayingCodeTaskService["unarchiveTask"]>[0],
        ) => {
          const meta = await route(params, {
            kind: "archive",
            archived: property === "archiveTask",
          });
          if (!meta) throw new Error("archive mutation 后 task 投影缺失");
          return meta;
        };
      }
      if (property === "deleteTask") {
        return async (params: Parameters<IKayingCodeTaskService["deleteTask"]>[0]) => {
          await route(params, { kind: "delete" });
        };
      }
      if (property === "deleteArchivedTasks") {
        return async (params: Parameters<IKayingCodeTaskService["deleteArchivedTasks"]>[0]) => {
          if (params.taskIds.length === 0) {
            return { deletedTaskIds: [], skippedTaskIds: [], failedTaskIds: [] };
          }
          return windowHostControllerRuntime.service.deleteArchivedTasks({
            address: await windowHostControllerRuntime.resolveTaskAddress({
              workspacePath: params.workspacePath,
              workspaceIdentity: params.workspaceIdentity,
              taskId: params.taskIds[0]!,
              attachmentScope,
              allowMissingTask: true,
            }),
            taskIds: params.taskIds,
          });
        };
      }
      if (property === "deleteArchivedTask") {
        return async (params: Parameters<IKayingCodeTaskService["deleteArchivedTask"]>[0]) =>
          windowHostControllerRuntime.service.deleteArchivedTask({
            address: await windowHostControllerRuntime.resolveTaskAddress({
              ...params,
              attachmentScope,
              allowMissingTask: true,
            }),
          });
      }
      if (property === "setTaskUnread") {
        return async (params: Parameters<IKayingCodeTaskService["setTaskUnread"]>[0]) => {
          const meta = await route(
            params,
            params.unread
              ? { kind: "mark-unread" }
              : {
                  kind: "mark-read",
                  ...(params.expectedUnreadAt != null
                    ? { expectedUnreadAt: params.expectedUnreadAt }
                    : {}),
                },
          );
          if (!meta) throw new Error("unread mutation 后 task 投影缺失");
          return meta;
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

const terminalOwners = createWindowHostTerminalOwners((error) => {
  logger.warn("failed to dispose mobile terminal owner", error);
});

function exposeServicesOnMessagePort(
  port: Electron.MessagePortMain,
  services: ServiceCollection,
  deferInit: boolean,
  clientMode: KayingCodeAgentV4ClientMode = "desktop-continuous",
  attachmentScope: WindowHostAttachmentScope = { kind: "local" },
  capabilities?: HostRemoteConnectionCapabilities,
  terminalOwnerId?: string,
): ExposedServicePortHandle {
  const terminal = services.getOptional(ITerminalService);
  // 页面 owner 由 Main 维护；没有 owner 的旧客户端仍按 attachment 回收 PTY。
  const legacyTerminalScope =
    clientMode === "web-remote-replayable" && terminal && !terminalOwnerId
      ? createTerminalScope(terminal, (error) =>
          logger.warn("failed to dispose mobile attachment terminal", error),
        )
      : undefined;
  const scopedTerminal =
    clientMode === "web-remote-replayable" && terminal
      ? terminalOwnerId
        ? terminalOwners.bind(
            terminalOwnerId,
            attachmentScope.kind === "remote"
              ? `remote:${attachmentScope.remoteSessionId}`
              : "local",
            terminal,
          )
        : legacyTerminalScope!.service
      : undefined;
  const wrappedPort = wrapElectronPort(port);
  const protocol = new MessagePortProtocol(wrappedPort);
  // remote 模式延迟发送 Initialize：远程建连需要时间，如果构造时就发 Initialize，
  // renderer 会立即发请求但 channel 还没注册，导致 "Unknown channel" 超时错误。
  // attach 模式复用已就绪服务，必须立即初始化新的 RPC MessagePort。
  logger.info(`creating ChannelServer (deferInit=${deferInit})`);
  const rawServer = new ChannelServer(protocol, "host", 1000, deferInit);
  const loggedServer = new LoggingChannelServer(rawServer, logRpc);
  const server = new NetworkTelemetryChannelServer(loggedServer);
  const agentService = services.getOptional(IKayingCodeAgentService);
  const connectionContext = { connectionId: `host-rpc-${randomUUID()}`, clientMode };
  const connectionScope = agentService
    ? createKayingCodeAgentConnectionScope(agentService, connectionContext)
    : undefined;
  services.register(IWindowControllerService, windowHostControllerRuntime.service);
  const controllerAttachment = windowHostControllerRuntime.createAttachmentService(
    clientMode === "desktop-continuous" && attachmentScope.kind === "local",
  );
  const overrides = new Map<string, unknown>([
    [IWindowControllerService.channelName, controllerAttachment],
  ]);
  if (activeServices) {
    registerWebRemoteProjectChannels({
      services,
      windowServices: activeServices,
      clientMode,
      attachmentScope,
      overrides,
    });
  }
  const isWebRemoteAttachment = clientMode === "web-remote-replayable";
  if (isWebRemoteAttachment) {
    // 普通 project 频道也叠加待处理交互；窗口目录频道由 decorateWindowProjectService 覆盖。
    const baseProjectService =
      (overrides.get(IProjectService.channelName) as IProjectService | undefined) ??
      services.getOptional(IProjectService);
    if (baseProjectService) {
      overrides.set(
        IProjectService.channelName,
        webRemoteProjectTreeActivity.decorate(baseProjectService),
      );
    }
  }
  // 远端媒体必须按 attachment 的 clientMode 选择数据面：桌面使用 Host loopback Range，手机保持 inline。
  const remoteMediaPreviewProxy =
    attachmentScope.kind === "remote" && clientMode === "desktop-continuous"
      ? capabilities?.remoteMediaPreviewFactory?.(attachmentScope)
      : undefined;
  if (remoteMediaPreviewProxy) {
    overrides.set(IMediaPreviewService.channelName, remoteMediaPreviewProxy.service);
  }
  if (scopedTerminal) overrides.set(ITerminalService.channelName, scopedTerminal);
  const taskService = services.getOptional(IKayingCodeTaskService);
  if (taskService) {
    overrides.set(
      IKayingCodeTaskService.channelName,
      createControllerRoutedTaskService(taskService, attachmentScope),
    );
  }
  if (connectionScope) {
    overrides.set(IKayingCodeAgentService.channelName, connectionScope.service);
  }
  const conversationShareService = services.getOptional(IConversationShareService);
  if (conversationShareService) {
    // Share service 若继续持有 raw Agent，会绕过当前 MessagePort 已握手的 trusted carrier，
    // rowsRange 会以 connection untrusted 拒绝。必须复用同一 attachment connection scope。
    overrides.set(
      IConversationShareService.channelName,
      scopeConversationShareServiceForAttachment(
        conversationShareService,
        clientMode,
        connectionScope?.service,
        connectionContext,
      ),
    );
  }
  const webRemoteProjectTreeRetention = isWebRemoteAttachment
    ? webRemoteProjectTreeActivity.retain()
    : undefined;
  exposeWindowHostAttachmentServices({
    server,
    services,
    overrides,
    clientMode,
    attachmentScope,
    windowServices: activeServices ?? undefined,
    ...(isWebRemoteAttachment
      ? { decorateWindowProjectService: webRemoteProjectTreeActivity.decorate }
      : {}),
  });
  let disposed = false;
  let flowUpdateChain = Promise.resolve();
  const forwardFlowState = (state: "saturated" | "drained" | "closed") => {
    if (!connectionScope) return Promise.resolve();
    const update = flowUpdateChain.then(() => connectionScope.setTransportFlowState(state));
    flowUpdateChain = update.catch((error) => {
      logger.warn("failed to forward attachment connection flow state", {
        state,
        message: error instanceof Error ? error.message : String(error),
      });
    });
    return update;
  };
  const flowStateDisposable = protocol.onFlowState((state) => {
    if (disposed) return;
    // MessagePort sideband 已在 protocol 层与 Uint8Array 分流；这里只把 owning scope
    // 的 edge 串行送往 CLI，不能由 control object 指定 connectionId。
    void forwardFlowState(state).catch(() => {});
  });
  const handle: ExposedServicePortHandle = {
    server,
    dispose() {
      if (disposed) return;
      disposed = true;
      flowStateDisposable.dispose();
      webRemoteProjectTreeRetention?.dispose();
      legacyTerminalScope?.dispose();
      controllerAttachment.dispose();
      void remoteMediaPreviewProxy?.dispose().catch((error: unknown) => {
        logger.warn("failed to dispose remote media preview proxy", error);
      });
      // close 排在所有已接收 SAT/DRN 之后；scope.dispose 自身会再次幂等确保 closed，
      // 但绝不让迟到 saturated 在 close 后复活 CLI pause state。
      void forwardFlowState("closed")
        .catch(() => {})
        .then(() => connectionScope?.dispose());
      rawServer.dispose();
      protocol.disconnect();
    },
  };
  port.once("close", () => handle.dispose());
  logger.info(`service connection ready mode=${clientMode}`);
  return handle;
}

const windowHostAttachmentRegistry = createWindowHostAttachmentRegistry<
  ServiceCollection,
  Electron.MessagePortMain,
  HostRemoteConnectionCapabilities
>({
  resolveScope: (scope: WindowHostAttachmentScope) => {
    if (scope.kind === "local") {
      if (!activeServices) {
        throw new Error("local services 尚未初始化");
      }
      return { services: activeServices, generation: 1 };
    }
    if (scope.kind !== "remote") {
      // source-settings attachment 只暴露当前在线 Source 的配置面；离线必须 fail-closed，
      // 不能回退本地 Settings，否则用户会改到错误 Environment。
      const source = resolveOnlineSourceConnectionServices(scope.sourceServerId);
      if (!source) {
        throw new Error(`Source Server is offline: ${scope.sourceServerId}`);
      }
      return {
        services: createSourceSettingsServiceCollection(source.services),
        generation: source.generation,
      };
    }
    const session = windowRemoteConnectionRegistry.getSession(scope.remoteSessionId);
    if (!session) {
      throw new Error(`未找到远程 logical session，remoteSessionId=${scope.remoteSessionId}`);
    }
    return {
      services: windowRemoteConnectionRegistry.resolveScopedServices(scope),
      generation: session.generation,
      capabilities: windowRemoteConnectionRegistry.resolveScopedCapabilities(scope),
    };
  },
  expose: ({ port, services, clientMode, scope, capabilities, terminalOwnerId }) =>
    exposeServicesOnMessagePort(
      port,
      services,
      false,
      clientMode,
      scope,
      capabilities,
      terminalOwnerId,
    ),
});

function logWindowHostTopology(reason: string): void {
  const stats = windowRemoteConnectionRegistry.getStats();
  logger.info(
    `window Host topology, reason=${reason}, pid=${process.pid}, connections=${stats.connectionCount}, logicalSessions=${stats.logicalSessionCount}, attachments=${windowHostAttachmentRegistry.size()}`,
  );
}

function disposeAttachedServicePorts(): void {
  terminalOwners.setOwner(null);
  windowHostAttachmentRegistry.dispose();
}

async function disposeHostResources(reason: string): Promise<HostShutdownResult> {
  databaseStartup?.dispose();
  pendingStartupAttachments.clear();
  for (const controller of projectNavigationAbortControllers.values()) controller.abort();
  projectNavigationAbortControllers.clear();
  if (hasDisposedHostResources) {
    return (
      (await disposeHostResourcesInFlight) ?? {
        exitCode: 0,
        failedPhases: [],
        timedOutPhases: [],
      }
    );
  }
  hasDisposedHostResources = true;

  disposeHostResourcesInFlight = (async () => {
    logger.info(`disposing host resources, reason=${reason}`);

    pluginSandboxRegistrationBridge.dispose();
    stopHostNetworkTelemetry();
    hostNetworkCapture.setCaptureId(null);
    disposeSourceServerRuntime();
    hostSelfResourceTelemetry.stop();
    disposeLocalResourceTelemetry();
    disposeAttachedServicePorts();
    windowHostControllerRuntime.dispose();
    for (const key of Array.from(cronRunSubscriptions.keys())) {
      disposeCronRunSubscription(key);
    }
    cronAutomationRepo.close();
    for (const key of Array.from(offPeakRunSubscriptions.keys())) {
      disposeOffPeakRunSubscription(key);
    }
    disposeOffPeakRuntime();
    offPeakTaskRepo.close();

    if (activeSessionRealtimePort) {
      activeSessionRealtimePort.dispose();
      activeSessionRealtimePort = null;
    }

    const servicesToDispose = activeServices;
    activeServices = null;
    // Registry 是全部远端 connection 的唯一 owner；释放失败不能阻塞本地服务继续收口。
    const shutdownResult = await runHostShutdownPhases(
      [
        {
          name: "remote-registry-dispose",
          run: () => windowRemoteConnectionRegistry.dispose(),
          timeoutMs: 6_000,
        },
        ...(servicesToDispose
          ? [
              {
                name: "service-dispose",
                run: () => disposeServiceResourcesAndWait(servicesToDispose),
                timeoutMs: 3_500,
              },
            ]
          : []),
      ],
      {
        phaseTimeoutMs: 5_000,
        log: (message, details) => logger.warn(message, details),
      },
    );
    if (shutdownResult.exitCode !== 0) {
      logger.warn("host resource cleanup completed with errors", {
        failedPhases: shutdownResult.failedPhases,
        reason,
        timedOutPhases: shutdownResult.timedOutPhases,
      });
    }
    activeHostApiNetworkTransport = null;
    return shutdownResult;
  })();

  const shutdownResult = await disposeHostResourcesInFlight;
  flushHostE2ECoverage((error) => {
    logger.warn("[e2e-coverage] host coverage flush failed", error);
  });
  return shutdownResult;
}

function disposeHostResourcesBestEffort(reason: string): void {
  if (hasDisposedHostResources) {
    return;
  }
  hasDisposedHostResources = true;

  logger.info(`disposing host resources, reason=${reason}`);
  pluginSandboxRegistrationBridge.dispose();
  stopHostNetworkTelemetry();
  hostNetworkCapture.setCaptureId(null);
  disposeSourceServerRuntime();
  disposeLocalResourceTelemetry();
  disposeAttachedServicePorts();
  windowHostControllerRuntime.dispose();
  for (const key of Array.from(cronRunSubscriptions.keys())) {
    disposeCronRunSubscription(key);
  }
  cronAutomationRepo.close();
  for (const key of Array.from(offPeakRunSubscriptions.keys())) {
    disposeOffPeakRunSubscription(key);
  }
  disposeOffPeakRuntime();
  offPeakTaskRepo.close();
  void windowRemoteConnectionRegistry.dispose();

  if (activeServices) {
    try {
      disposeServiceResources(activeServices);
    } catch (error) {
      logger.error("failed to dispose local services:", error);
    } finally {
      activeServices = null;
      activeHostApiNetworkTransport = null;
    }
  }

  if (activeSessionRealtimePort) {
    activeSessionRealtimePort.dispose();
    activeSessionRealtimePort = null;
  }
}

process.once("SIGTERM", () => {
  void disposeHostResources("SIGTERM").then(
    (result) => process.exit(result.exitCode),
    () => process.exit(1),
  );
});

process.once("SIGINT", () => {
  void disposeHostResources("SIGINT").then(
    (result) => process.exit(result.exitCode),
    () => process.exit(1),
  );
});

process.once("disconnect", () => {
  // parent IPC 消失后不会再有人发送 Dispose；有界清理结束后必须明确退出，避免 Host 常驻。
  void disposeHostResources("disconnect").finally(() => process.exit(1));
});

process.once("exit", () => {
  disposeHostResourcesBestEffort("exit");
});

let handlingFatalUncaughtException = false;
process.on(
  "uncaughtException",
  createHostUncaughtExceptionHandler({
    onRecovered: (error, origin) => {
      const memoryUsage = process.memoryUsage();
      logger.warn("contained host allocation failure from native TLS callback", {
        arrayBuffers: memoryUsage.arrayBuffers,
        external: memoryUsage.external,
        heapUsed: memoryUsage.heapUsed,
        message: error.message,
        origin,
        rss: memoryUsage.rss,
      });
    },
    onFatal: (error, origin) => {
      if (handlingFatalUncaughtException) {
        process.exit(1);
      }
      handlingFatalUncaughtException = true;
      logger.error(`uncaughtException origin=${origin}:`, error);
      void disposeHostResources(`uncaughtException:${origin}`).finally(() => process.exit(1));
    },
  }),
);

parentPort.on("message", async (e: Electron.MessageEvent) => {
  const result = parseHostIncomingMessageEvent(e);
  if (!result.success) {
    logger.error("invalid parentPort message:", formatZodError(result.error));
    return;
  }

  const msg = result.data;
  const port = e.ports[0];
  // 采集开关与沙箱登记结果都不携带 MessagePort，必须在 port 守卫之前消费。
  if (msg.type === HostMessageTypes.NetworkCapture) {
    hostNetworkCapture.setCaptureId(msg.control.captureId);
    return;
  }
  if (msg.type === HostMessageTypes.PluginSandboxRegisterResult) {
    pluginSandboxRegistrationBridge.accept(msg);
    return;
  }
  if (msg.type === HostMessageTypes.DatabaseStartupControl) {
    if (msg.control.action === "snapshot") databaseStartup?.coordinator.publish();
    else if (msg.control.action === "retry")
      void databaseStartup?.coordinator.retry(msg.control.attemptId);
    return;
  }

  if (msg.type === HostMessageTypes.ResourceUsageSnapshotRequest) {
    void hostResourceUsageResponder.handleRequest(msg);
    return;
  }
  if (msg.type === HostMessageTypes.ResourceUsageSnapshotCancel) {
    hostResourceUsageResponder.cancelRequest(msg.requestId);
    return;
  }

  if (msg.type === HostMessageTypes.FeedbackLogArchiveResult) {
    const pending = pendingFeedbackLogArchiveRequests.get(msg.requestId);
    if (!pending) {
      return;
    }
    pendingFeedbackLogArchiveRequests.delete(msg.requestId);
    if (msg.ok && msg.path && typeof msg.size === "number") {
      pending.onProgress?.({ processedBytes: msg.size, totalBytes: msg.size });
      pending.resolve({ path: msg.path, size: msg.size });
      return;
    }
    pending.reject(new Error(msg.error ?? "反馈日志归档创建失败"));
    return;
  }

  if (msg.type === HostMessageTypes.LocalMediaPreviewPathAuthorizeResult) {
    const pending = pendingLocalMediaPreviewPathAuthorizations.get(msg.requestId);
    if (!pending) return;
    pendingLocalMediaPreviewPathAuthorizations.delete(msg.requestId);
    if (msg.ok && msg.path) {
      logger.info("local media preview path authorization OK");
      pending.resolve(msg.path);
    } else {
      pending.reject(new Error(msg.error ?? "本地视频预览路径授权失败"));
    }
    return;
  }

  if (msg.type === HostMessageTypes.CronRun) {
    if (databaseStartup?.coordinator.snapshot.phase !== "ready") {
      parentPort.postMessage({
        type: HostResponseTypes.CronRunResult,
        runId: msg.runId,
        ok: false,
        error: "Local database startup is not ready",
        failureKind: "transient",
      });
      return;
    }
    void (async () => {
      try {
        const dispatchResult = await dispatchCronRun({
          ...msg,
          mode: msg.mode as KayingCodeTaskMode | undefined,
        });
        parentPort.postMessage({
          type: HostResponseTypes.CronRunResult,
          runId: msg.runId,
          ok: true,
          ...dispatchResult,
        });
      } catch (error) {
        parentPort.postMessage({
          type: HostResponseTypes.CronRunResult,
          runId: msg.runId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          failureKind: "transient",
        });
      }
    })();
    return;
  }

  if (msg.type === HostMessageTypes.OffPeakRun) {
    if (databaseStartup?.coordinator.snapshot.phase !== "ready") {
      parentPort.postMessage({
        type: HostResponseTypes.OffPeakRunResult,
        offPeakTaskId: msg.offPeakTaskId,
        ok: false,
        error: "Local database startup is not ready",
        failureKind: "transient",
      });
      return;
    }
    void (async () => {
      try {
        const dispatchResult = await dispatchOffPeakRun(msg);
        parentPort.postMessage({
          type: HostResponseTypes.OffPeakRunResult,
          offPeakTaskId: msg.offPeakTaskId,
          ok: true,
          ...dispatchResult,
        });
      } catch (error) {
        parentPort.postMessage({
          type: HostResponseTypes.OffPeakRunResult,
          offPeakTaskId: msg.offPeakTaskId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          // 确定性模型/凭证配置错误重试不会自愈；交给 scheduler 转 failed，
          // 未知及生命周期错误仍按 transient 保持原退避语义。
          failureKind: error instanceof OffPeakPermanentDispatchError ? "permanent" : "transient",
        });
      }
    })();
    return;
  }

  if (msg.type === HostMessageTypes.BrowserExecuteResult) {
    // main 的 WebContentsView+CDP 执行完 browser 命令，按 requestId 关联回 bridge 的 pending。
    void browserControlMainBridge.handleResult({
      requestId: msg.requestId,
      result: msg.result,
    });
    return;
  }

  if (msg.type === HostMessageTypes.Dispose) {
    // main 进程通知清理（窗口关闭 / app 退出时）
    // 这里必须等待统一资源清理完成（含异步收尾写回），再让进程退出；main 侧仍有强杀 timer 兜底。
    const result = await disposeHostResources("parent dispose");
    process.exit(result.exitCode);
    return;
  }

  if (msg.type === HostMessageTypes.Broadcast) {
    return;
  }

  if (msg.type === HostMessageTypes.SessionMessageDeliver) {
    const kayingcodeTaskService = activeServices?.getOptional(IKayingCodeTaskService);
    if (!kayingcodeTaskService) {
      parentPort.postMessage({
        type: HostResponseTypes.SessionMessageDeliverResult,
        result: {
          error: "KayingCode task service is not initialized.",
          messageId: msg.request.messageId,
          requestId: msg.request.requestId,
          sessionId: msg.request.fromSessionId,
          status: "failed",
        },
      });
      return;
    }

    void kayingcodeTaskService
      .deliverSessionMessage(msg.request)
      .then((deliveryResult) => {
        parentPort.postMessage({
          type: HostResponseTypes.SessionMessageDeliverResult,
          result: deliveryResult,
        });
      })
      .catch((error) => {
        parentPort.postMessage({
          type: HostResponseTypes.SessionMessageDeliverResult,
          result: {
            error: error instanceof Error ? error.message : String(error),
            messageId: msg.request.messageId,
            requestId: msg.request.requestId,
            sessionId: msg.request.fromSessionId,
            status: "failed",
          },
        });
      });
    return;
  }

  if (msg.type === HostMessageTypes.SessionMessageDeliveryResult) {
    const kayingcodeTaskService = activeServices?.getOptional(IKayingCodeTaskService);
    if (!kayingcodeTaskService) {
      logger.warn(
        "session message delivery result received before KayingCode task service initialized",
      );
      return;
    }
    void kayingcodeTaskService.sendSessionMessageDeliveryResult(msg.result).catch((error) => {
      logger.warn("failed to forward session message delivery result:", error);
    });
    return;
  }

  if (msg.type === HostMessageTypes.ProviderProvisioningExecute) {
    const session = windowRemoteConnectionRegistry.getSession(msg.remoteSessionId);
    if (
      !session ||
      !session.workspaceIdentity ||
      session.target.kind === "server" ||
      buildRemoteEnvironmentKey(session.target) !== msg.environmentKey
    ) {
      parentPort.postMessage({
        type: HostResponseTypes.ProviderProvisioningExecutionResult,
        requestId: msg.requestId,
        environmentKey: msg.environmentKey,
        status: "failed",
        error: "Remote Environment registration 已失效",
      });
      return;
    }
    const scope = {
      kind: "remote",
      remoteSessionId: session.remoteSessionId,
      workspacePath: session.workspacePath ?? "/",
      workspaceIdentity: session.workspaceIdentity,
    } as const;
    void Promise.resolve()
      .then(() =>
        (() => {
          const provisioningService = getRemoteProviderProvisioningExecutor(
            windowRemoteConnectionRegistry.resolveScopedServices(scope),
          );
          if (!provisioningService) {
            throw new Error("Remote Environment 不支持 Provider Provisioning");
          }
          return provisioningService.syncLocalToRemote();
        })(),
      )
      .then((result) => {
        parentPort.postMessage({
          type: HostResponseTypes.ProviderProvisioningExecutionResult,
          requestId: msg.requestId,
          environmentKey: msg.environmentKey,
          status: result.status,
          ...(result.errorMessage ? { error: result.errorMessage } : {}),
        });
      })
      .catch((error: unknown) => {
        parentPort.postMessage({
          type: HostResponseTypes.ProviderProvisioningExecutionResult,
          requestId: msg.requestId,
          environmentKey: msg.environmentKey,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return;
  }

  if (msg.type === HostMessageTypes.ConnectRemoteWorkspace) {
    // Server target 首连时 Renderer 尚未选择 workspace，不能合成 remote-agent-pending
    // identity，也不能把缺省 path 合成 "/"：registry.connect() 只要 identity 非空就按它
    // 在 Server catalog 里精确匹配（pending 格式永远匹配不到 catalog 下发的
    // remote-agent:<serverId>:<workspaceId>:<path>），且有 path 时会校验 path 与选中项
    // 一致，合成的 "/" 同样必然失败。两种情况都会让首连直接报错，workspace 列表无法
    // 展示。server 首连保持两者缺省，由 connect() 的握手结果落定 catalog 身份；
    // pending 格式的契约注释（remote-workspace-identity.ts）也明确它只用于握手前
    // 临时 session，不能作为权威身份。重连路径两个字段都由历史记录显式传入，
    // catalog 一致性校验仍然生效。
    const workspacePath = msg.workspacePath ?? (msg.target.kind === "server" ? undefined : "/");
    const workspaceIdentity =
      msg.workspaceIdentity ??
      (msg.target.kind === "server"
        ? undefined
        : buildRemoteWorkspaceIdentity(msg.workspacePath ?? "/", msg.target));
    logger.info(
      `connecting window-scoped remote source, requestId=${msg.requestId}, target=${formatRemoteTargetForLog(msg.target)}`,
    );
    void remoteConnectionProgressContext
      .run(msg.requestId, () =>
        windowRemoteConnectionRegistry.connect({
          requestId: msg.requestId,
          target: msg.target,
          remoteAssets: msg.remoteAssets,
          workspacePath,
          workspaceIdentity,
          ...(msg.confirmSourceServerInstall ? { confirmSourceServerInstall: true } : {}),
        }),
      )
      .then(async (descriptor) => {
        const replacedOfflineSessions = windowRemoteConnectionRegistry
          .listSessions()
          .filter(
            (session) =>
              session.remoteSessionId !== descriptor.remoteSessionId &&
              session.state === "disconnected" &&
              session.workspacePath === descriptor.workspacePath &&
              session.workspaceIdentity === descriptor.workspaceIdentity,
          );
        for (const replaced of replacedOfflineSessions) {
          if (replaced.workspacePath && replaced.workspaceIdentity) {
            const previousScope = {
              kind: "remote",
              ...(replaced.sourceServerId ? { sourceServerId: replaced.sourceServerId } : {}),
              remoteSessionId: replaced.remoteSessionId,
              workspacePath: replaced.workspacePath,
              workspaceIdentity: replaced.workspaceIdentity,
            } as const;
            const nextScope = {
              kind: "remote",
              ...(descriptor.sourceServerId ? { sourceServerId: descriptor.sourceServerId } : {}),
              remoteSessionId: descriptor.remoteSessionId,
              workspacePath: replaced.workspacePath,
              workspaceIdentity: replaced.workspaceIdentity,
            } as const;
            try {
              const services = windowRemoteConnectionRegistry.resolveScopedServices(nextScope);
              await windowHostControllerRuntime.replaceDisconnectedSource(previousScope, {
                scope: nextScope,
                taskService: services.get(IKayingCodeTaskService),
                sourceAvailability: "online",
              });
            } catch (error) {
              // source 已连接但 task-index 暂时不可读时不能回滚 transport，也不能删除上一代
              // 离线可信投影。Controller 会保留 pending replacement，后续 query 成功后原子替换。
              logger.warn("failed to atomically replace disconnected Controller source", error);
            }
          }
          windowHostAttachmentRegistry.detachRemoteSessionAttachments(replaced.remoteSessionId);
          await windowRemoteConnectionRegistry.disposeSession(replaced.remoteSessionId);
          // 重连替换后旧 remoteSessionId 已不再可 attachment；同步清理 Main 的端口请求关联，
          // 但不向 Renderer 伪报一次新的 transport failure。
          parentPort.postMessage({
            type: HostResponseTypes.RemoteWorkspaceClosed,
            remoteSessionId: replaced.remoteSessionId,
            reason: "disposed",
          });
        }
        parentPort.postMessage({
          type: HostResponseTypes.RemoteWorkspaceConnected,
          requestId: msg.requestId,
          descriptor,
        });
        logWindowHostTopology("remote-connected");
      })
      .catch((error) => {
        parentPort.postMessage({
          type: HostResponseTypes.RemoteWorkspaceConnectFailed,
          requestId: msg.requestId,
          error: error instanceof Error ? error.message : String(error),
          // 稳定错误码是 UI 提供安装/升级/身份确认入口的唯一依据，不能在 Host 边界丢失。
          ...buildRemoteConnectFailurePayload(error),
        });
      });
    return;
  }

  if (msg.type === HostMessageTypes.CancelRemoteWorkspaceConnect) {
    projectNavigationAbortControllers.get(msg.requestId)?.abort();
    windowRemoteConnectionRegistry.cancelConnect(msg.requestId);
    return;
  }

  if (msg.type === HostMessageTypes.CancelRemoteWorkspaceBind) {
    cancelledWorkspaceBindRequestIds.add(msg.requestId);
    if (activeWorkspaceBindRequestIds.delete(msg.requestId)) {
      // 本地 registry 的 workspace 准备不可中断；先让 Main 立即 settle，后续完成时
      // 因 request 已不 active 而丢弃迟到的 ACK，避免同一 requestId 二次回执。
      const canceled = Object.assign(new Error("Remote workspace bind was canceled"), {
        code: REMOTE_BIND_CANCELED_ERROR_CODE,
        retryable: false,
      });
      parentPort.postMessage({
        type: HostResponseTypes.RemoteWorkspaceContextBindFailed,
        requestId: msg.requestId,
        error: canceled.message,
        reasonCode: canceled.code,
        retryable: false,
      });
      cancelledWorkspaceBindRequestIds.delete(msg.requestId);
    }
    return;
  }

  if (msg.type === HostMessageTypes.BindRemoteWorkspaceContext) {
    if (cancelledWorkspaceBindRequestIds.delete(msg.requestId)) {
      parentPort.postMessage({
        type: HostResponseTypes.RemoteWorkspaceContextBindFailed,
        requestId: msg.requestId,
        error: "Remote workspace bind was canceled",
        reasonCode: REMOTE_BIND_CANCELED_ERROR_CODE,
        retryable: false,
      });
      return;
    }
    activeWorkspaceBindRequestIds.add(msg.requestId);
    const previous = windowRemoteConnectionRegistry.getSession(msg.remoteSessionId);
    let workspaceReady: Promise<void>;
    try {
      workspaceReady = windowRemoteConnectionRegistry.bindWorkspaceContext({
        remoteSessionId: msg.remoteSessionId,
        workspacePath: msg.workspacePath,
        workspaceIdentity: msg.workspaceIdentity,
      });
    } catch (error) {
      logger.warn(
        `failed to bind remote workspace context, remoteSessionId=${msg.remoteSessionId}`,
        error,
      );
      parentPort.postMessage({
        type: HostResponseTypes.RemoteWorkspaceContextBindFailed,
        requestId: msg.requestId,
        error: error instanceof Error ? error.message : String(error),
        ...(error && typeof error === "object" && "code" in error && typeof error.code === "string"
          ? { reasonCode: error.code }
          : {}),
        ...(error &&
        typeof error === "object" &&
        "retryable" in error &&
        typeof error.retryable === "boolean"
          ? { retryable: error.retryable }
          : {}),
      });
      activeWorkspaceBindRequestIds.delete(msg.requestId);
      cancelledWorkspaceBindRequestIds.delete(msg.requestId);
      return;
    }
    const current = windowRemoteConnectionRegistry.getSession(msg.remoteSessionId);
    if (current) {
      // scope generation 换代后，旧 Renderer/手机 attachment 不得继续持有远端 IO facade。
      windowHostAttachmentRegistry.detachStaleRemoteSessionAttachments(
        msg.remoteSessionId,
        current.generation,
      );
    }
    void workspaceReady
      .then(() => {
        if (!activeWorkspaceBindRequestIds.has(msg.requestId)) {
          cancelledWorkspaceBindRequestIds.delete(msg.requestId);
          return;
        }
        if (cancelledWorkspaceBindRequestIds.has(msg.requestId)) {
          throw Object.assign(new Error("Remote workspace bind was canceled"), {
            code: REMOTE_BIND_CANCELED_ERROR_CODE,
            retryable: false,
          });
        }
        const currentSession = windowRemoteConnectionRegistry.getSession(msg.remoteSessionId);
        if (!currentSession?.workspaceIdentity) {
          // bind 完成前 logical session 可能被并发释放；旧实现直接 return，Main
          // 永远收不到 ACK。抛入统一失败链，确保每个 requestId 恰好 settle 一次。
          throw Object.assign(
            new Error(`远程 workspace bind 完成时 session 已失效: ${msg.remoteSessionId}`),
            {
              code: REMOTE_WORKSPACE_BIND_SESSION_MISSING_ERROR_CODE,
              retryable: true,
            },
          );
        }
        if (previous?.workspacePath && previous.workspaceIdentity) {
          windowHostControllerRuntime.removeSource({
            kind: "remote",
            remoteSessionId: msg.remoteSessionId,
            workspacePath: previous.workspacePath,
            workspaceIdentity: previous.workspaceIdentity,
          });
        }
        parentPort.postMessage({
          type: HostResponseTypes.RemoteWorkspaceContextBound,
          requestId: msg.requestId,
          // 首次从旧 route tab 打开 Source workspace 时，Renderer 只拿到 stable
          // identity 会误认为没有旧 tab，随后 addTab 产生第二个 workspace。
          ...(msg.legacyRouteHint && msg.legacyRouteHint !== currentSession.workspaceIdentity
            ? { previousWorkspaceIdentity: msg.legacyRouteHint }
            : {}),
        });
        logger.info(
          `bound remote workspace context, remoteSessionId=${msg.remoteSessionId}, workspacePath=${msg.workspacePath}`,
        );
        activeWorkspaceBindRequestIds.delete(msg.requestId);
        cancelledWorkspaceBindRequestIds.delete(msg.requestId);
      })
      .catch((error) => {
        if (!activeWorkspaceBindRequestIds.has(msg.requestId)) {
          cancelledWorkspaceBindRequestIds.delete(msg.requestId);
          return;
        }
        logger.warn(
          `failed to prepare bound remote workspace, remoteSessionId=${msg.remoteSessionId}`,
          error,
        );
        const normalizedError = cancelledWorkspaceBindRequestIds.has(msg.requestId)
          ? Object.assign(new Error("Remote workspace bind was canceled"), {
              code: REMOTE_BIND_CANCELED_ERROR_CODE,
              retryable: false,
            })
          : error;
        parentPort.postMessage({
          type: HostResponseTypes.RemoteWorkspaceContextBindFailed,
          requestId: msg.requestId,
          error:
            normalizedError instanceof Error ? normalizedError.message : String(normalizedError),
          ...(normalizedError &&
          typeof normalizedError === "object" &&
          "code" in normalizedError &&
          typeof normalizedError.code === "string"
            ? { reasonCode: normalizedError.code }
            : {}),
          ...(normalizedError &&
          typeof normalizedError === "object" &&
          "retryable" in normalizedError &&
          typeof normalizedError.retryable === "boolean"
            ? { retryable: normalizedError.retryable }
            : {}),
        });
        activeWorkspaceBindRequestIds.delete(msg.requestId);
        cancelledWorkspaceBindRequestIds.delete(msg.requestId);
      });
    return;
  }

  if (msg.type === HostMessageTypes.DisposeRemoteWorkspaceSession) {
    const disposedSession = windowRemoteConnectionRegistry.getSession(msg.remoteSessionId);
    windowHostAttachmentRegistry.detachRemoteSessionAttachments(msg.remoteSessionId);
    void windowRemoteConnectionRegistry
      .disposeSession(msg.remoteSessionId)
      .then(() => {
        if (disposedSession?.workspacePath && disposedSession.workspaceIdentity) {
          windowHostControllerRuntime.removeSource({
            kind: "remote",
            remoteSessionId: msg.remoteSessionId,
            workspacePath: disposedSession.workspacePath,
            workspaceIdentity: disposedSession.workspaceIdentity,
          });
        }
        parentPort.postMessage({
          type: HostResponseTypes.RemoteWorkspaceClosed,
          remoteSessionId: msg.remoteSessionId,
          reason: "disposed",
        });
        logWindowHostTopology("remote-session-disposed");
      })
      .catch((error) => {
        logger.warn(
          `failed to dispose remote logical session, remoteSessionId=${msg.remoteSessionId}`,
          error,
        );
      });
    return;
  }

  if (msg.type === HostMessageTypes.SetTerminalOwner) {
    // 页面 owner 换代时先撤销旧 owner 的 PTY 绑定，再让新页面重新 bind。
    terminalOwners.setOwner(msg.ownerId);
    return;
  }

  if (msg.type === HostMessageTypes.AttachServicePort) {
    if (!port) {
      logger.error("attach-service-port message missing MessagePort");
      return;
    }
    if (msg.scope.kind === "local" && databaseStartup?.coordinator.snapshot.phase !== "ready") {
      // 刷新/手机 attachment 复用同一 Host，等待现有准备，不启动第二个执行者。
      pendingStartupAttachments.set(msg.attachmentId, () => {
        windowHostAttachmentRegistry.attach({ ...msg, port });
      });
      port.once("close", () => pendingStartupAttachments.delete(msg.attachmentId));
      return;
    }
    try {
      if (msg.scope.kind === "remote") {
        // Bind 与 Attach 共用 parentPort，但 WSL 上一代 workspace release 可能仍在途。
        // 持有已转移 port 等待 Host 内 generation barrier，避免新 attachment 踩过旧 runtime 清理。
        await windowRemoteConnectionRegistry.waitForScopedServices(msg.scope);
      }
      windowHostAttachmentRegistry.attach({
        requestId: msg.requestId,
        attachmentId: msg.attachmentId,
        clientMode: msg.clientMode,
        scope: msg.scope,
        port,
      });
      logger.info(
        `attached scoped service port, attachmentId=${msg.attachmentId}, scope=${msg.scope.kind}, clientMode=${msg.clientMode}`,
      );
      logWindowHostTopology("attachment-added");
    } catch (error) {
      // 跨 logical session 或旧 identity 的 port 若继续暴露，会把远端请求路由到错误 source。
      // scope 校验失败必须关闭已转移端口并明确记录，禁止回退 active local services。
      rejectUnavailableAttachedServicePort(port, false);
      logger.warn(`failed to attach scoped service port, attachmentId=${msg.attachmentId}`, error);
    }
    return;
  }

  if (msg.type === HostMessageTypes.DetachServicePort) {
    pendingStartupAttachments.delete(msg.attachmentId);
    windowHostAttachmentRegistry.detach(msg.attachmentId);
    logger.info(`detached service port, attachmentId=${msg.attachmentId}`);
    logWindowHostTopology("attachment-removed");
    return;
  }

  if (msg.type === HostMessageTypes.PrepareProjectWorkspace) {
    const controller = new AbortController();
    logger.info(
      `[web-remote-control] prepare project workspace request=${msg.requestId} project=${msg.projectId ?? "null"} host=${msg.hostId ?? "local"} draft=${msg.draftId ?? "-"} task=${msg.task?.taskId ?? "-"}`,
    );
    if (projectNavigationAbortControllers.has(msg.requestId)) {
      parentPort.postMessage({
        type: HostResponseTypes.ProjectWorkspacePrepared,
        requestId: msg.requestId,
        result: { ok: false, error: "项目导航 requestId 重复" },
      });
      return;
    }
    projectNavigationAbortControllers.set(msg.requestId, controller);
    try {
      const services = activeServices;
      if (!services || hasDisposedHostResources) throw new Error("Window Host is unavailable");
      const assertHost = () => {
        controller.signal.throwIfAborted();
        if (activeServices !== services || hasDisposedHostResources)
          throw new Error("Window Host changed during project navigation");
      };
      const navigation = createHostProjectWorkspaceNavigation({
        projectService: services.get(IProjectService),
        remoteProjectService: services.get(IRemoteProjectService),
        readConnectionOwner: (hostId) => resolveBotProjectConnection(hostId)?.owner,
        buildWorkspaceIdentity: (hostId, workspacePath) =>
          buildRemoteHostWorkspaceIdentity(hostId, workspacePath),
        connectRemoteWorkspace: (input) =>
          windowRemoteConnectionRegistry.connect({
            ...input,
            remoteAssets: sourceServerRuntimeDeps?.remoteAssets ?? {},
          }),
        bindRemoteWorkspace: (input) => windowRemoteConnectionRegistry.bindWorkspaceContext(input),
        disposeRemoteSession: (remoteSessionId) =>
          windowRemoteConnectionRegistry.disposeSession(remoteSessionId),
        assertHost,
      });
      const value = await navigation.prepare(
        {
          projectId: msg.projectId,
          hostId: msg.hostId,
          draftId: msg.draftId,
          reuseDraft: msg.reuseDraft,
          ...(msg.task ? { task: msg.task } : {}),
        },
        msg.requestId,
      );
      assertHost();
      logger.info(
        `[web-remote-control] prepared project workspace request=${msg.requestId} path=${value.workspacePath} remote=${value.remote?.remoteSessionId ?? "-"}`,
      );
      parentPort.postMessage({
        type: HostResponseTypes.ProjectWorkspacePrepared,
        requestId: msg.requestId,
        result: { ok: true, value },
      });
    } catch (error) {
      logger.warn(
        `[web-remote-control] prepare project workspace failed request=${msg.requestId}`,
        error,
      );
      parentPort.postMessage({
        type: HostResponseTypes.ProjectWorkspacePrepared,
        requestId: msg.requestId,
        result: { ok: false, error: error instanceof Error ? error.message : String(error) },
      });
    } finally {
      if (projectNavigationAbortControllers.get(msg.requestId) === controller)
        projectNavigationAbortControllers.delete(msg.requestId);
    }
    return;
  }

  if (!port) {
    return;
  }

  if (msg.type === HostMessageTypes.InitLocal) {
    if (!port) {
      logger.error("init-local message missing MessagePort");
      return;
    }
    if (databaseStartup) {
      port.close();
      databaseStartup.coordinator.publish();
      return;
    }
    let basePortClosed = false;
    port.once("close", () => {
      basePortClosed = true;
    });
    databaseStartup = createHostDatabaseStartup({
      startupId: msg.databaseStartupId,
      cwd: msg.agentSpawnFallbackCwd ?? process.cwd(),
      workingDirectories:
        msg.agentWarmupTargets?.map((target) => target.workspacePath) ??
        (msg.workspacePath ? [msg.workspacePath] : []),
      env: msg.runtimeProcessEnvPatch,
      publish: (state) => {
        parentPort?.postMessage({ type: HostResponseTypes.DatabaseStartupState, state });
        if (state.phase === "ready") {
          for (const attach of pendingStartupAttachments.values()) {
            try {
              attach();
            } catch (error) {
              logger.warn("startup attachment failed", error);
            }
          }
          pendingStartupAttachments.clear();
        }
      },
      onFailure: (error) =>
        logger.error(
          `local database startup failed attempt=${databaseStartup?.coordinator.snapshot.attemptId}`,
          error,
        ),
      initializeServices: async () => {
        logger.info("initializing local services");
        activeSessionRealtimePort = createTaskRealtimeBridgeForHostInit(msg, parentPort);
        // 旧 Team 补组织必须与网络代理读取共用同一个 Setting 实例及写队列。
        // 只注入 service 会跳过默认装配分支，导致缺组织的升级用户永远无法恢复连接。
        const { service: settingService, prepareLegacyAccountConnections } =
          createSettingServiceWithMigrations();
        const hostApiNetworkTransport = createHostApiNetworkTransport(async () => {
          const settings = await settingService.get();
          return {
            httpProxy: settings.httpProxy,
            noProxy: settings.httpProxyNoProxy,
            caCertPath: settings.httpProxyCaCertPath,
          };
        });
        const services = await initializeHostApiNetworkTransportOwner({
          transport: hostApiNetworkTransport,
          log: (message, details) => logger.warn(message, details),
          establishOwner: () => {
            const initializedServices = createLocalServices({
              parentPort,
              settingService,
              prepareLegacyAccountConnections,
              hostApiNetworkTransport,
              authorizeLocalMediaPreviewPath,
              runtimeProcessEnvPatch: msg.runtimeProcessEnvPatch,
              agentRuntimeContext: {
                getDeviceMid: () => msg.deviceMid,
                runtimeSurface: "desktop_local_host",
              },
              serviceAuthorityMode: "desktop-local",
              // 官方 Web 窗口目录按 hostId 读取远端项目树；解析器只认当前在线连接。
              resolveProjectHostService,
              remoteProjectConnection: {
                connectHost: connectRemoteProjectHost,
                readConnectionStates: readRemoteProjectConnectionStates,
              },
              kayingcodeAgentSpawnFallbackCwd: msg.agentSpawnFallbackCwd,
              kayingcodeBuiltinProviderConfigFilePath: msg.kayingcodeBuiltinProviderConfigFilePath,
              processLifecycleReporter: runtimeProcessLifecycleReporter,
              taskRuntimeReporter: runtimeTaskReporter,
              feedback: {
                getDeviceMid: () => msg.deviceMid,
                apiBaseUrl: msg.feedbackApiBase,
                createFullLogArchive: createFullFeedbackLogArchiveViaMain,
              },
              forwardSessionMessageSendRequested: (request) => {
                parentPort?.postMessage({
                  type: HostResponseTypes.SessionMessageSendRequested,
                  request,
                });
              },
              onAutomationManualRunRequested: dispatchManualAutomationRun,
              onOffPeakSchedulerWakeRequested: () => {
                parentPort?.postMessage({ type: HostResponseTypes.OffPeakSchedulerWakeRequest });
              },
              onProviderProvisioningSourceChanged: (trigger) => {
                parentPort?.postMessage({
                  type: HostResponseTypes.ProviderProvisioningSourceChanged,
                  trigger,
                });
              },
              // browser-use：agent 的 interaction/browserExecute 经 kayingcodeAgentService 转到这个 executor，
              // 再经 parentPort 到 main 的 WebContentsView+CDP 执行。
              browserControlExecutor: browserControlMainBridge,
              // 插件 UI 沙箱登记：Host 校验后转发 main 创建 WebContentsView，句柄经同一桥回传。
              registerPluginSandbox: (input) => pluginSandboxRegistrationBridge.register(input),
              resolveBotProjectConnection,
              resolveBotRemoteWorkspace: (workspace) =>
                sourceServerDirectory
                  ? resolveBotRemoteWorkspace(workspace, "lookup", {
                      directory: sourceServerDirectory,
                      listSessions: () => windowRemoteConnectionRegistry.listSessions(),
                    }).then((resolved) =>
                      resolved
                        ? {
                            workspacePath: resolved.workspacePath,
                            workspaceIdentity: resolved.workspaceIdentity,
                          }
                        : null,
                    )
                  : Promise.resolve(null),
            });
            activeServices = initializedServices;
            activeHostApiNetworkTransport = hostApiNetworkTransport;
            return initializedServices;
          },
        });
        const kayingcodeTaskService = services.getOptional(IKayingCodeTaskService);
        if (kayingcodeTaskService) {
          const reportingKayingCodeTaskService = createReportingRemoteKayingCodeTaskService(
            kayingcodeTaskService,
            {
              reportRunningPromptCount: false,
            },
          );
          services.register(IKayingCodeTaskService, reportingKayingCodeTaskService);
        }
        sourceServerRuntimeDeps = {
          services,
          remoteAssets: msg.remoteAssets ?? {},
          fetch: hostApiNetworkTransport.fetch,
        };
        sourceServerArtifactPolicy =
          msg.remoteAssets?.sourceServerArtifactPolicy ?? "release-versioned";
        const manager = await ensureSourceServerConnectionManager();
        const directory = sourceServerDirectory;
        if (!directory) throw new Error("Source Server directory 尚未初始化");
        const resolveRelease = async (
          probe: Parameters<typeof resolveSourceServerReleaseAsset>[0],
          target: Parameters<typeof resolveSourceServerReleaseAsset>[2],
          options?: { metadataOnly?: boolean },
        ) =>
          await resolveSourceServerReleaseAsset(
            probe,
            msg.remoteAssets ?? {},
            target,
            { fetch: hostApiNetworkTransport.fetch },
            options,
          );
        sourceServerManagementService = createSourceServerManagementService({
          directory,
          manager,
          resolveRelease,
          onBeforeSourceServerRemoved: async (sourceServerId) => {
            const hostId = remoteHostIdFromWorkspaceIdentity(
              buildServerRemoteWorkspaceIdentity({
                serverId: sourceServerId,
                workspacePath: "/",
              }),
            );
            if (!hostId) throw new Error("remote-project.invalid-host-identity");
            await services.get(IRemoteProjectService).removeHost(hostId);
            windowHostAttachmentRegistry.detachSourceSettingsAttachments(sourceServerId);
          },
        });
        sourceSettingsStateSubscription = manager.onDidChangeState((state) => {
          notifyProjectChange();
          // Source 换代/断开后旧配置 attachment 不得继续命中已关闭的 RPC generation。
          if (state.sourceServerId && shouldDetachSourceSettingsAttachment(state.state)) {
            windowHostAttachmentRegistry.detachSourceSettingsAttachments(state.sourceServerId);
          }
        });
        services.register(ISourceServerManagementService, sourceServerManagementService);
        wireLocalResourceTelemetry(services);
        hasDisposedHostResources = false;
        disposeHostResourcesInFlight = null;
        const agentWarmupTargets =
          msg.agentWarmupTargets && msg.agentWarmupTargets.length > 0
            ? msg.agentWarmupTargets
            : msg.workspacePath
              ? [
                  {
                    workspacePath: msg.workspacePath,
                    ...(msg.workspaceIdentity ? { workspaceIdentity: msg.workspaceIdentity } : {}),
                  },
                ]
              : [];
        // Main 已按最近使用顺序把启动预热限制为 3 个；Host 必须显式消费这份
        // 固定名单，不能让后续 task-list observer 再隐式扩大，也不能因单个失败扫描补位。
        agentWarmupTargets.forEach((target, index) => {
          warmUpKayingCodeAgent(
            services,
            target,
            `local host init (${index + 1}/${agentWarmupTargets.length})`,
          );
        });
        logger.info("exposing services on ChannelServer...");
        if (!basePortClosed)
          windowHostAttachmentRegistry.attach({
            requestId: `init-local-${randomUUID()}`,
            attachmentId: `base-${randomUUID()}`,
            clientMode: "desktop-continuous",
            scope: { kind: "local" },
            port,
          });
        logWindowHostTopology("base-attachment-ready");
        logger.info("local services ready, all channels registered");
        // 冷启动重连与本地 base attachment 解耦：本地服务已就绪即可后台执行，
        // 不能让远程探测拖慢首帧。URL Host 复用同一启动开关与 Registry。
        void runStartupReconnectBatch({
          getSettings: () => services.get(ISettingService).get(),
          listCandidates: async () =>
            (await services.get(IRemoteProjectService).readDirectory()).hosts.filter(
              (host) => host.kind === "server",
            ),
          reconnect: (hosts) =>
            Promise.all(
              hosts.map(async (host) => {
                try {
                  await services.get(IRemoteProjectService).connectHost(host.id);
                } catch (error) {
                  logger.warn("URL Server startup reconnect failed", { hostId: host.id, error });
                }
              }),
            ),
        }).catch((error) => logger.warn("URL Server startup directory unavailable", error));

        // Directory 初始化属于远程附加能力，失败时本地服务不受影响；
        // 候选按目录最近在线事实排序，并与仍保留的 remote-project host 取交集，
        // 避免为已被移除的设备重建连接。
        void directory
          .initialize()
          .then(async () =>
            runStartupReconnectBatch({
              getSettings: () => services.get(ISettingService).get(),
              listCandidates: async () => {
                const retained = new Set(
                  (await services.get(IRemoteProjectService).readDirectory()).hosts.map(
                    (host) => host.id,
                  ),
                );
                return (await directory.listStartupReconnectCandidates()).filter((candidate) =>
                  retained.has(remoteProjectHostIdForProfile(candidate.profile)),
                );
              },
              reconnect: (candidates) => manager.reconnectOnStartup(candidates),
            }),
          )
          .then((results) => {
            const online = results.filter((result) => result.status === "online").length;
            // 只记录失败 Profile 与原因：过去只留计数，冷启动失败只能靠手动重连复现。
            for (const result of results) {
              if (result.status === "failed") {
                logger.warn("Source Server startup reconnect failed", {
                  profileId: result.profileId,
                  error: result.error,
                });
              }
            }
            logger.info(
              `Source Server startup reconnect finished, online=${online}, failed=${results.length - online}`,
            );
          })
          .catch((error) =>
            logger.warn(
              "Source Server directory initialization failed; local services remain available",
              error,
            ),
          );
      },
    });
    await databaseStartup.coordinator.start();
  }
});
