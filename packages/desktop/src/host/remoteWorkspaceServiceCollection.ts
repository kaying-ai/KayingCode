/* eslint-disable max-lines -- 远程 workspace 服务注册需集中维护，以保持依赖注入顺序 */
import {
  ServiceCollection,
  IFileService,
  IMediaPreviewService,
  IGitService,
  IGitCheckpointService,
  ISystemService,
  ITerminalService,
  ISettingService,
  ICredentialService,
  IBroadcastService,
  IKayingCodeTaskService,
  IKayingCodeAgentService,
  IKayingCodeSessionService,
  IConversationShareService,
  IFileWatcherService,
  IOAuthService,
  IModelSelectionService,
  IProviderSettingsService,
  IUsageStatsService,
  ICodingPlanSubscriptionService,
  IClientConfigService,
  IClientScenesService,
  ISkillsService,
  ISkillSyncService,
  IMcpSyncService,
  IPluginSyncService,
  IPluginsService,
  IPluginManagementService,
  ISubagentsService,
  ICommandsService,
  IHooksService,
  IMemoryService,
  ISettingsSyncService,
  IPromptAttachmentTransferService,
  IOnboardingRecordService,
  IGenUiService,
  IBotsService,
  IProjectService,
  ITaskGroupService,
  IRemoteProjectService,
  IOutputStyleService,
  ISourceServerWorkspaceService,
  type IServiceAccessor,
  type ServiceDescriptor,
} from "@zcode/services";
import {
  createUnsupportedConversationShareService,
  createSettingService,
  createCredentialService,
  createBroadcastService,
  createNodeApiClient,
  createHostApiNetworkTransport,
  registerHostApiNetworkTransportForDispose,
  createOAuthService,
  createAccountProviderCredentialStore,
  createAccountProviderCredentialService,
  createAccountProviderRequestAuthService,
  createAccountRequestAuthService,
  resolveCurrentAccountAccess,
  createSettingsSyncService,
  createUsageStatsService,
  createMediaPreviewService,
  createCodingPlanSubscriptionService,
  createClientScenesService,
  createServiceLogger,
  createSubagentsService,
  createMemoryService,
  createLegacySingleRootProjectService,
  createRemoteProjectService,
} from "@zcode/services/node";
import {
  BIGMODEL_PROVIDER_ID,
  buildRuntimeKayingCodeApiUrl,
  buildServerRemoteWorkspaceIdentity,
  createClientPublicApi,
  DEFAULT_KAYINGCODE_MODEL_CONTEXT_BUDGET_STRATEGY,
  KAYINGCODE_VERSION,
  remoteHostIdFromWorkspaceIdentity,
  resolveRuntimeKayingCodeEndpointOrigin,
  type ProviderFamilyDomain,
  type KayingCodeSessionRuntimePreferencesResult,
  type RemoteTarget,
  ZAI_PROVIDER_ID,
} from "@zcode/shared";
import { assertLegacyRemoteWorkspaceRpcContract } from "./legacyRemoteWorkspaceRpcContract.js";
import {
  createRemoteProviderProvisioningExecutorFromWorkspace,
  registerRemoteProviderProvisioningExecutor,
} from "./remoteProviderProvisioningService.js";

const runtimePreferencesLogger = createServiceLogger("remote-runtime-preferences");
const KAYINGCODE_JWT_TOKEN_KEY = "kayingcodejwttoken";

export function createRemoteWorkspaceServiceCollection(params: {
  clientConfigService: IClientConfigService;
  connectionServices: IServiceAccessor;
  sourceServices?: ServiceCollection;
  parentPort: Parameters<typeof createBroadcastService>[0];
  createReportingRemoteKayingCodeTaskService: <T extends object>(service: T) => T;
  createRemotePromptAttachmentTaskService: <T extends object>(service: T) => T;
  createRemotePromptAttachmentSessionService: <T extends object>(service: T) => T;
  promptAttachmentTransferService: IPromptAttachmentTransferService;
  runtimePreferencesBridge: {
    onError: (error: unknown) => void;
  };
}): ServiceCollection {
  assertLegacyRemoteWorkspaceRpcContract(params.connectionServices);
  const localSettingService = createSettingService();
  const localCredentialService = createCredentialService();
  const localAccountProviderCredentialStore = createAccountProviderCredentialStore({
    credentialService: localCredentialService,
  });
  const hostApiNetworkTransport = createHostApiNetworkTransport(async () => {
    const settings = await localSettingService.get();
    return {
      httpProxy: settings.httpProxy,
      noProxy: settings.httpProxyNoProxy,
      caCertPath: settings.httpProxyCaCertPath,
    };
  });
  const localApiClient = createNodeApiClient({
    fetchImpl: hostApiNetworkTransport.fetch,
  });
  const localBroadcastService = createBroadcastService(params.parentPort);
  // KayingCode.localrun：无账号凭据仓库 / 登出清理。
  let handleOAuthProviderLogout: ((provider: never) => Promise<void>) | null = null;
  const localOAuthCredentialRepo = {
    loadTokenSet: async (_providerId?: string) =>
      null as { accessToken: string; kayingcodeJwtToken?: string | null } | null,
    loadUserProfile: async (_providerId?: string) => null as { id?: string } | null,
    loadActiveUserProfile: async () => null as { id?: string } | null,
  };
  void localCredentialService;
  const localAccountProviderCredentialService = createAccountProviderCredentialService({
    credentialStore: localAccountProviderCredentialStore,
  });
  const readLocalAccountProviderSettings = async () => {
    const settings = await localSettingService.get();
    return {
      providerFamilyDomain: settings.providerFamilyDomain ?? null,
      selections: settings.providerFamilyConnectionSelections ?? {},
    };
  };
  const loadLocalAccountIdentity = async (family: ProviderFamilyDomain) => {
    const providerId = family === "zai" ? ZAI_PROVIDER_ID : BIGMODEL_PROVIDER_ID;
    return (await localOAuthCredentialRepo.loadUserProfile(providerId))?.id ?? null;
  };
  const localAccountRequestAuthService = createAccountRequestAuthService(
    createAccountProviderRequestAuthService({
      resolveCurrentAccountAccess: (access) =>
        resolveCurrentAccountAccess({
          access,
          readSettings: readLocalAccountProviderSettings,
          loadAccountIdentity: loadLocalAccountIdentity,
        }),
      loadOAuthTokenSet: (providerId) => localOAuthCredentialRepo.loadTokenSet(providerId),
      async loadIndividualPlanApiKey(providerId, family) {
        const oauthProviderId = family === "zai" ? ZAI_PROVIDER_ID : BIGMODEL_PROVIDER_ID;
        const accountIdentity = (await localOAuthCredentialRepo.loadUserProfile(oauthProviderId))
          ?.id;
        if (!accountIdentity) return null;
        return localAccountProviderCredentialService.loadCodingPlanApiKey({
          providerId,
          family,
          accountIdentity,
        });
      },
      // KayingCode.localrun：无 Team Plan API Key。
      resolveTeamPlanApiKey: async () => null,
    }),
  );
  const localCodingPlanSubscriptionService = createCodingPlanSubscriptionService({
    apiClient: localApiClient,
    credentialService: localCredentialService,
  });
  handleOAuthProviderLogout = async () => undefined;
  // KayingCode.localrun：远端 workspace 也不提供官方会话分享发布/浏览。
  const conversationShareService = createUnsupportedConversationShareService({
    message: "Conversation share is not available in KayingCode (no official share service)",
  });
  const reportingRemoteKayingCodeTaskService = params.createReportingRemoteKayingCodeTaskService(
    params.connectionServices.kayingcodeTaskService,
  );
  // 手机 remote 的 replayable mirror 在 reporting wrapper 中发布用户消息；
  // 附件物化必须包在 reporting 外层，确保 mirror 和真正发给远端 agent 的 prompt 使用同一份远端路径。
  const remoteKayingCodeTaskService = params.createRemotePromptAttachmentTaskService(
    reportingRemoteKayingCodeTaskService,
  );
  const remoteKayingCodeSessionService = params.createRemotePromptAttachmentSessionService(
    params.connectionServices.kayingcodeSessionService,
  );
  const remoteProviderProvisioningService =
    createRemoteProviderProvisioningExecutorFromWorkspace(params);

  // desktop-attached remote 的 Agent 运行在远端，但 app-global 设置权威仍在
  // desktop shared Host。通过窄化的 runtime-preferences 请求原路返回，避免远端读取自己的 setting。
  const { onError } = params.runtimePreferencesBridge;
  params.connectionServices.kayingcodeAgentService.onDynamicSessionRuntimePreferencesRequest()(
    (request) => {
      const startedAt = Date.now();
      const requestContext = {
        event: "kayingcode_protocol.runtime_preferences.host_request_received",
        module: "desktop.host.remote_workspace",
        requestId: request.requestId,
        scope: request.scope,
        sessionId: request.sessionId,
      };
      // 诊断：Agent 侧超时只能说明没有拿到响应；这里记录 Host 是否收到请求，
      // 用“收到但无 response”区分 transport 丢包和设置读取卡住。
      runtimePreferencesLogger.info(
        undefined,
        "runtime preferences host request received",
        requestContext,
      );
      void (async () => {
        const trackStage = <T>(stage: string, promise: Promise<T>): Promise<T> => {
          const stageStartedAt = Date.now();
          return promise.then(
            (value) => {
              runtimePreferencesLogger.debug(
                undefined,
                "runtime preferences host stage completed",
                {
                  ...requestContext,
                  durationMs: Math.max(0, Date.now() - stageStartedAt),
                  stage,
                },
              );
              return value;
            },
            (error: unknown) => {
              runtimePreferencesLogger.warn(undefined, "runtime preferences host stage failed", {
                ...requestContext,
                durationMs: Math.max(0, Date.now() - stageStartedAt),
                error: error instanceof Error ? error.message : String(error),
                stage,
              });
              throw error;
            },
          );
        };
        let resolution:
          | { status: "resolved"; preferences: KayingCodeSessionRuntimePreferencesResult }
          | { status: "failed"; message: string };
        try {
          // 与本地 Host 同源：固定预算不依赖配置网关，远程/手机偏好响应不再串行等待网络。
          const settings = await trackStage("settings", localSettingService.get());
          const modelContextBudgetStrategy = DEFAULT_KAYINGCODE_MODEL_CONTEXT_BUDGET_STRATEGY;
          resolution = {
            status: "resolved",
            preferences: {
              askUserQuestionAutoResolutionEnabled:
                settings.askUserQuestionAutoResolutionEnabled !== false,
              nativeSearchEnhancementsEnabled: settings.nativeSearchEnhancementsEnabled !== false,
              toolSearchMode: settings.toolSearchMode ?? "auto",
              memoryEnabled: settings.memoryEnabled === true,
              modelContextBudgetStrategy,
              // remote workspace 与本地 Host 保持同一 scope 边界，首次执行不得再次等待 client config。
              ...(request.scope === "user-execution" && settings.integratedTerminalShell
                ? { integratedTerminalShell: settings.integratedTerminalShell }
                : {}),
            },
          };
        } catch (error) {
          resolution = {
            status: "failed",
            message: error instanceof Error ? error.message : String(error),
          };
          runtimePreferencesLogger.warn(undefined, "runtime preferences host resolution failed", {
            ...requestContext,
            durationMs: Math.max(0, Date.now() - startedAt),
            error: resolution.message,
          });
        }
        // 只把设置读取失败编码为 -32603；发送失败交给最终 onError 记录，不能重试同一请求。
        await params.connectionServices.kayingcodeAgentService.respondSessionRuntimePreferences({
          requestId: request.requestId,
          resolution,
        });
        runtimePreferencesLogger.info(undefined, "runtime preferences host response sent", {
          ...requestContext,
          durationMs: Math.max(0, Date.now() - startedAt),
          resolutionStatus: resolution.status,
        });
      })().catch((error: unknown) => {
        runtimePreferencesLogger.warn(undefined, "runtime preferences host response failed", {
          ...requestContext,
          durationMs: Math.max(0, Date.now() - startedAt),
          error: error instanceof Error ? error.message : String(error),
        });
        onError(error);
      });
    },
  );

  // Web 手机远控进入 SSH task 时只连到 remote workspace host，
  // 没有桌面 renderer 那层 `baseServices + remoteServices` 合并。
  // 因此这里为 remote workspace host 补齐本地全局 channel；文件、终端、KayingCode Agent 仍来自远端，
  // 设置、凭据、OAuth、模型供应商和 settings-sync 继续读写本机配置。
  const services = new ServiceCollection()
    .register(IFileService, params.connectionServices.fileService)
    .register(IGitService, params.connectionServices.gitService)
    .register(IGitCheckpointService, params.connectionServices.gitCheckpointService)
    .register(ISystemService, params.connectionServices.systemService)
    .register(ITerminalService, params.connectionServices.terminalService)
    .register(ISettingService, localSettingService)
    .register(ICredentialService, localCredentialService)
    .register(IBroadcastService, localBroadcastService)
    .register(IKayingCodeTaskService, remoteKayingCodeTaskService)
    .register(IKayingCodeAgentService, params.connectionServices.kayingcodeAgentService)
    .register(IKayingCodeSessionService, remoteKayingCodeSessionService)
    .register(IConversationShareService, conversationShareService)
    .register(IFileWatcherService, params.connectionServices.fileWatcherService)
    .register(
      IOAuthService,
      createOAuthService(localCredentialService, {
        apiClient: localApiClient,
        onProviderLogout: handleOAuthProviderLogout,
      }),
    )
    // Provider/Model 事实属于目标 Environment。远端 workspace 的选择和设置视图
    // 必须直接读取远端 Registry，不能继续显示 Desktop 本地 Provider。
    .register(IModelSelectionService, params.connectionServices.modelSelectionService)
    .register(IProviderSettingsService, params.connectionServices.providerSettingsService)
    .register(
      IUsageStatsService,
      createUsageStatsService({
        kayingcodeAgentService: params.connectionServices.kayingcodeAgentService,
      }),
    )
    .register(ICodingPlanSubscriptionService, localCodingPlanSubscriptionService)
    .register(IClientConfigService, params.clientConfigService)
    .register(
      IClientScenesService,
      createClientScenesService({
        api: createClientPublicApi({
          // 远端 workspace 仍按本机 settings/env 解析官方端点；无端点时走 ApiMock。
          resolveEndpointOrigin: () => resolveRuntimeKayingCodeEndpointOrigin(),
          request: (input, init) => localApiClient.request(input, init),
        }),
        resolveCallOptions: async () => ({
          appVersion: KAYINGCODE_VERSION,
          platform: `${process.platform}-${process.arch}`,
        }),
      }),
    )
    // 远端 workspace 的项目级 skills/plugins/commands 位于 SSH/Docker 文件系统。
    // 这里必须透出远端服务，避免本机服务拿远端 workspacePath 去本机目录扫描。
    .register(ISkillsService, params.connectionServices.skillsService)
    .register(ISkillSyncService, params.connectionServices.skillSyncService)
    .register(IMcpSyncService, params.connectionServices.mcpSyncService)
    .register(IPluginSyncService, params.connectionServices.pluginSyncService)
    .register(IPluginsService, params.connectionServices.pluginsService)
    // 远端设置页插件管理也必须打到远端 agent（插件目录在远端文件系统）。
    .register(IPluginManagementService, params.connectionServices.pluginManagementService)
    .register(ICommandsService, params.connectionServices.commandsService)
    .register(ISubagentsService, createSubagentsService({ isDesktopRuntime: true }))
    .register(IHooksService, params.connectionServices.hooksService)
    .register(IMemoryService, createMemoryService())
    .register(
      ISettingsSyncService,
      createSettingsSyncService({ settingService: localSettingService }),
    )
    .register(IPromptAttachmentTransferService, params.promptAttachmentTransferService);
  registerHostApiNetworkTransportForDispose(services, hostApiNetworkTransport);
  registerRemoteProviderProvisioningExecutor(services, remoteProviderProvisioningService);
  return services;
}

/**
 * 已运行的 Source Server / Remote Agent Server 是一个完整 Host。
 * 这里不做本机设置/凭据覆盖，只把 Source 的 RPC 服务面原样转发给窗口 attachment。
 */
export function createServerRemoteWorkspaceServiceCollection(params: {
  clientConfigService: IClientConfigService;
  connectionServices: IServiceAccessor;
  virtualProjects?: boolean;
  serverId?: string;
  targetKind: RemoteTarget["kind"];
  /** 本机 Local Host 服务；提供 Provider Provisioning Source 与分组事实。 */
  sourceServices?: ServiceCollection;
}): ServiceCollection {
  assertLegacyRemoteWorkspaceRpcContract(params.connectionServices);
  const providerProvisioningService = createRemoteProviderProvisioningExecutorFromWorkspace(params);
  const conversationShareService =
    params.targetKind === "server"
      ? createUnsupportedConversationShareService({
          message: "Conversation sharing is not available for this client or remote target",
        })
      : params.connectionServices.conversationShareService;
  // Source 的 accessor 字段是能力面：缺失的 channel 不注册，调用方得到 Unknown channel
  // 而不是伪造实例；本机 ServiceCollection 路径仍按注册表读取。
  const collection = new ServiceCollection();
  const register = <T>(descriptor: ServiceDescriptor<T>, value: T | undefined): void => {
    if (value !== undefined) collection.register(descriptor, value);
  };
  register(IFileService, params.connectionServices.fileService);
  register(IGenUiService, params.connectionServices.genUiService);
  register(IMediaPreviewService, params.connectionServices.mediaPreviewService);
  register(IGitService, params.connectionServices.gitService);
  register(IGitCheckpointService, params.connectionServices.gitCheckpointService);
  register(ISystemService, params.connectionServices.systemService);
  register(ITerminalService, params.connectionServices.terminalService);
  register(ISettingService, params.connectionServices.settingService);
  register(IOnboardingRecordService, params.connectionServices.onboardingRecordService);
  register(ICredentialService, params.connectionServices.credentialService);
  register(IBroadcastService, params.connectionServices.broadcastService);
  register(IKayingCodeTaskService, params.connectionServices.kayingcodeTaskService);
  register(IKayingCodeAgentService, params.connectionServices.kayingcodeAgentService);
  register(IKayingCodeSessionService, params.connectionServices.kayingcodeSessionService);
  register(IConversationShareService, conversationShareService);
  register(IBotsService, params.connectionServices.botsService);
  register(IFileWatcherService, params.connectionServices.fileWatcherService);
  register(IOAuthService, params.connectionServices.oauthService);
  register(IProviderSettingsService, params.connectionServices.providerSettingsService);
  register(IModelSelectionService, params.connectionServices.modelSelectionService);
  register(ISourceServerWorkspaceService, params.connectionServices.sourceServerWorkspaceService);
  register(IUsageStatsService, params.connectionServices.usageStatsService);
  register(ICodingPlanSubscriptionService, params.connectionServices.codingPlanSubscriptionService);
  register(IClientConfigService, params.clientConfigService);
  register(IClientScenesService, params.connectionServices.clientScenesService);
  register(ISkillsService, params.connectionServices.skillsService);
  register(ISkillSyncService, params.connectionServices.skillSyncService);
  register(IMcpSyncService, params.connectionServices.mcpSyncService);
  register(IPluginSyncService, params.connectionServices.pluginSyncService);
  register(IPluginsService, params.connectionServices.pluginsService);
  register(IPluginManagementService, params.connectionServices.pluginManagementService);
  register(ISubagentsService, params.connectionServices.subagentsService);
  register(ICommandsService, params.connectionServices.commandsService);
  register(IHooksService, params.connectionServices.hooksService);
  register(IMemoryService, params.connectionServices.memoryService);
  register(IOutputStyleService, params.connectionServices.outputStyleService);
  register(ISettingsSyncService, params.connectionServices.settingsSyncService);
  register(
    IPromptAttachmentTransferService,
    params.connectionServices.promptAttachmentTransferService,
  );

  if (params.virtualProjects) {
    if (
      !params.connectionServices.projectService ||
      !params.connectionServices.remoteProjectService
    )
      throw new Error("Remote virtual-project RPC registration incomplete");
    collection.register(IProjectService, params.connectionServices.projectService);
    collection.register(IRemoteProjectService, params.connectionServices.remoteProjectService);
  } else if (params.serverId) {
    collection.register(
      IProjectService,
      resolveServerProjectService({ ...params, serverId: params.serverId }),
    );
    collection.register(
      IRemoteProjectService,
      createRemoteProjectService({
        controller: false,
        database: async () => {
          throw new Error("remote-project.controller-only");
        },
      }),
    );
  }
  const controllerGroups = params.sourceServices?.getOptional(ITaskGroupService);
  const controllerBroadcast = params.sourceServices?.getOptional(IBroadcastService);
  if (controllerGroups) collection.register(ITaskGroupService, controllerGroups);
  if (controllerGroups && controllerBroadcast) {
    const remoteBroadcast = params.connectionServices.broadcastService;
    collection.register(IBroadcastService, {
      send: (message) =>
        (message.channel === "state:task-groups" ? controllerBroadcast : remoteBroadcast).send(
          message,
        ),
      acquireClaim: (key) => remoteBroadcast.acquireClaim(key),
      commitClaim: (lease) => remoteBroadcast.commitClaim(lease),
      releaseClaim: (lease) => remoteBroadcast.releaseClaim(lease),
      tryClaim: (key) => remoteBroadcast.tryClaim(key),
      onMessage: (listener) => {
        const remote = remoteBroadcast.onMessage((event) => {
          if (event.channel !== "state:task-groups") listener(event);
        });
        const local = controllerBroadcast.onMessage((event) => {
          if (event.channel === "state:task-groups") listener(event);
        });
        return {
          dispose: () => {
            remote.dispose();
            local.dispose();
          },
        };
      },
    });
  }
  // 旧 Server / 旧 client 可能没有 bots/output-style/source-server-workspace 等可选面。
  // 这些 channel 缺失时保持 fail-closed（不注册），核心合同由 legacy 断言保证。
  registerRemoteProviderProvisioningExecutor(collection, providerProvisioningService);
  return collection;
}

/** 旧 Server 的单 root 只读项目面；virtualProjects 由 Source 自己提供。 */
export function resolveServerProjectService(params: {
  connectionServices: IServiceAccessor;
  serverId: string;
  sourceServices?: ServiceCollection;
}): IProjectService {
  const hostId = remoteHostIdFromWorkspaceIdentity(
    buildServerRemoteWorkspaceIdentity({
      serverId: params.serverId,
      workspacePath: "/",
    }),
  );
  if (!hostId) throw new Error("remote-project.invalid-host-identity");
  return createLegacySingleRootProjectService({
    hostId,
    directories: {
      info: () => params.connectionServices.systemService.info(),
      read: (input) => params.connectionServices.fileService.readdir(input),
    },
    readSettings: () => params.connectionServices.settingService.get(),
    readKnownWorkspaces: async () => {
      const directory = await params.sourceServices
        ?.getOptional(IRemoteProjectService)
        ?.readDirectory();
      return (directory?.entries ?? [])
        .filter((entry) => entry.hostId === hostId)
        .flatMap((entry) =>
          entry.roots.length
            ? entry.roots.map((root) => ({ workspacePath: root.rootPath }))
            : entry.legacyWorkspace
              ? [
                  {
                    workspacePath: entry.legacyWorkspace.workspacePath,
                    workspacePurpose: entry.legacyWorkspace.workspacePurpose,
                  },
                ]
              : [],
        );
    },
    readTasks: ({ workspacePath, kind }) => {
      const tasks = params.connectionServices.kayingcodeTaskService;
      const scope = { workspacePath };
      return kind === "pinned"
        ? tasks.listPinnedTasks(scope)
        : kind === "archived"
          ? tasks.listArchivedTasks(scope)
          : tasks.listTasks(scope);
    },
    ensureConversation: async () =>
      (await params.connectionServices.fileService.ensureConversationWorkspace()).path,
  });
}
