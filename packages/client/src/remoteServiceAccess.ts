import { ProxyChannel, type IChannelClient } from "@zcode/rpc";
import {
  MOBILE_MODEL_CATALOG_CHANNEL,
  type MobileModelCatalog,
} from "@zcode/shared/kayingcode-protocol-v4";
import {
  IFileService,
  IMediaPreviewService,
  IGitService,
  IGitCheckpointService,
  ISystemService,
  ITerminalService,
  ISettingService,
  IOnboardingRecordService,
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
  IProviderProvisioningTargetService,
  IUsageStatsService,
  ICodingPlanSubscriptionService,
  IClientConfigService,
  IClientScenesService,
  IOffPeakTaskService,
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
  IFeedbackService,
  IPromptAttachmentTransferService,
  IWindowControllerService,
  IProjectService,
  IRemoteProjectService,
  ITaskGroupService,
  IGenUiService,
  ISourceServerManagementService,
  ISourceServerWorkspaceService,
  IBotsService,
  IOutputStyleService,
  IWindowProjectService,
  IWindowRemoteProjectService,
  IWindowProjectChangesService,
  type WindowProjectDirectoryServices,
  type IServiceAccessor,
} from "@zcode/services";

/**
 * Relay 移动 attachment 专用只读模型目录（MOB-16）。
 *
 * 原始 ModelSelectionView 携带 provider access.apiKey，不能进 IServiceAccessor——
 * 桌面 /ws 只读路径也不注册该 channel，因此这里刻意留在接口之外：只有移动链路
 * （relayIngress 注册 MOBILE_MODEL_CATALOG_CHANNEL）能取到真实目录，其余链路调用
 * 会失败关闭在 ChannelClient 上，不会静默返回空目录。
 */
export interface IMobileModelCatalogAccess {
  getCatalog(): Promise<MobileModelCatalog>;
}

const MOBILE_MODEL_CATALOG_FIELD = "mobileModelCatalog";

/** 取移动模型目录代理；非 relay 移动链路的 accessor 返回 null（字段不存在）。 */
export function readMobileModelCatalog(
  accessor: IServiceAccessor,
): IMobileModelCatalogAccess | null {
  const value = (accessor as unknown as Record<string, unknown>)[MOBILE_MODEL_CATALOG_FIELD];
  return typeof value === "object" && value !== null ? (value as IMobileModelCatalogAccess) : null;
}

/**
 * Host 能力声明。
 *
 * ProxyChannel 是惰性的：服务端未注册 channel 时也能构造出“看似存在”的代理，
 * optional 合同会拖到首次调用才失败。因此旧 Host 不提供的服务必须由调用方显式声明，
 * 未声明时保留 undefined，让 UI 走已有的降级分支。
 */
export interface RemoteServiceAccessOptions {
  signal?: AbortSignal;
  sourceServerManagementService?: boolean;
  windowProjectDirectory?: boolean;
  projectService?: boolean;
  remoteProjectService?: boolean;
  taskGroupService?: boolean;
  genUiService?: boolean;
  /** Bot 运行时；Desktop/Server Host 注册，旧 Host 可不提供。 */
  botsService?: boolean;
  /** Output style 管理；source-settings attachment 依赖该 channel。 */
  outputStyleService?: boolean;
  /** Source Server canonical workspace 映射；仅 standalone Source / remote workspace 注册。 */
  sourceServerWorkspaceService?: boolean;
  /**
   * 窗口级 Controller（实时任务帧/未读信号/跨 source 路由）。
   * 缺省视为可用（Desktop Window Host）；Web Host 没有真实 controller，
   * 必须显式 false，让 UI 走 task service 事件降级而不是等 unavailable 错误。
   */
  windowControllerService?: boolean;
}

/**
 * RemoteServiceAccess — 通过 ChannelClient 自动创建类型安全的服务代理
 *
 * 新增服务只需在此添加一个 getter。
 */
export class RemoteServiceAccess implements IServiceAccessor {
  readonly windowProjectDirectory?: WindowProjectDirectoryServices;
  readonly projectService?: IProjectService;
  readonly remoteProjectService?: IRemoteProjectService;
  readonly taskGroupService?: ITaskGroupService;
  readonly genUiService?: IGenUiService;
  readonly sourceServerManagementService?: ISourceServerManagementService;
  readonly sourceServerWorkspaceService?: ISourceServerWorkspaceService;
  readonly botsService?: IBotsService;
  readonly outputStyleService?: IOutputStyleService;
  readonly fileService: IFileService;
  readonly mediaPreviewService: IMediaPreviewService;
  readonly gitService: IGitService;
  readonly gitCheckpointService: IGitCheckpointService;
  readonly systemService: ISystemService;
  readonly terminalService: ITerminalService;
  readonly settingService: ISettingService;
  readonly onboardingRecordService: IOnboardingRecordService;
  readonly credentialService: ICredentialService;
  readonly broadcastService: IBroadcastService;
  readonly kayingcodeTaskService: IKayingCodeTaskService;
  readonly windowControllerService?: IWindowControllerService;
  readonly kayingcodeAgentService: IKayingCodeAgentService;
  readonly kayingcodeSessionService: IKayingCodeSessionService;
  readonly conversationShareService: IConversationShareService;
  readonly fileWatcherService: IFileWatcherService;
  readonly oauthService: IOAuthService;
  readonly providerSettingsService: IProviderSettingsService;
  readonly modelSelectionService: IModelSelectionService;
  /** Host-only target proxy；不属于 IServiceAccessor，避免向 Renderer 暴露 Secret 写入接口。 */
  readonly providerProvisioningTargetService!: IProviderProvisioningTargetService;
  readonly usageStatsService: IUsageStatsService;
  readonly codingPlanSubscriptionService: ICodingPlanSubscriptionService;
  readonly clientConfigService: IClientConfigService;
  readonly clientScenesService: IClientScenesService;
  readonly offPeakTaskService: IOffPeakTaskService;
  readonly skillsService: ISkillsService;
  readonly skillSyncService: ISkillSyncService;
  readonly mcpSyncService: IMcpSyncService;
  readonly pluginSyncService: IPluginSyncService;
  readonly pluginsService: IPluginsService;
  readonly pluginManagementService: IPluginManagementService;
  readonly subagentsService: ISubagentsService;
  readonly commandsService: ICommandsService;
  readonly hooksService: IHooksService;
  readonly memoryService: IMemoryService;
  readonly settingsSyncService: ISettingsSyncService;
  readonly feedbackService: IFeedbackService;
  readonly promptAttachmentTransferService: IPromptAttachmentTransferService;
  /** Mobile-only 只读模型目录；不属于 IServiceAccessor（见 IMobileModelCatalogAccess 注释）。 */
  readonly mobileModelCatalog!: IMobileModelCatalogAccess;

  constructor(channelClient: IChannelClient, options: RemoteServiceAccessOptions = {}) {
    // 远端工作区的 project 必须保留 Source 语义；只有显式能力才创建完整窗口目录组。
    if (options.windowProjectDirectory) {
      this.windowProjectDirectory = {
        projectService: ProxyChannel.toService(
          channelClient.getChannel(IWindowProjectService.channelName),
        ),
        remoteProjectService: ProxyChannel.toService(
          channelClient.getChannel(IWindowRemoteProjectService.channelName),
        ),
        changesService: ProxyChannel.toService(
          channelClient.getChannel(IWindowProjectChangesService.channelName),
        ),
      };
    }
    // 旧 Host 没有这些 channel；未声明能力时保持 undefined，不在构造期抛错。
    if (options.projectService) {
      this.projectService = ProxyChannel.toService<IProjectService>(
        channelClient.getChannel(IProjectService.channelName),
      );
    }
    if (options.remoteProjectService) {
      this.remoteProjectService = ProxyChannel.toService<IRemoteProjectService>(
        channelClient.getChannel(IRemoteProjectService.channelName),
      );
    }
    if (options.taskGroupService) {
      this.taskGroupService = ProxyChannel.toService<ITaskGroupService>(
        channelClient.getChannel(ITaskGroupService.channelName),
      );
    }
    if (options.genUiService) {
      this.genUiService = ProxyChannel.toService<IGenUiService>(
        channelClient.getChannel(IGenUiService.channelName),
      );
    }
    if (options.sourceServerManagementService) {
      this.sourceServerManagementService = ProxyChannel.toService<ISourceServerManagementService>(
        channelClient.getChannel(ISourceServerManagementService.channelName),
      );
    }
    if (options.sourceServerWorkspaceService) {
      this.sourceServerWorkspaceService = ProxyChannel.toService<ISourceServerWorkspaceService>(
        channelClient.getChannel(ISourceServerWorkspaceService.channelName),
      );
    }
    if (options.botsService) {
      this.botsService = ProxyChannel.toService<IBotsService>(
        channelClient.getChannel(IBotsService.channelName),
      );
    }
    if (options.outputStyleService) {
      this.outputStyleService = ProxyChannel.toService<IOutputStyleService>(
        channelClient.getChannel(IOutputStyleService.channelName),
      );
    }
    this.fileService = ProxyChannel.toService<IFileService>(
      channelClient.getChannel(IFileService.channelName),
    );
    // Host 已注册 media-preview channel，但遗漏 renderer proxy 时，PreviewPane
    // 会静默回退到 8 MiB 的 file.readMediaPreview，导致大 MP4 无法打开。
    this.mediaPreviewService = ProxyChannel.toService<IMediaPreviewService>(
      channelClient.getChannel(IMediaPreviewService.channelName),
    );
    this.gitService = ProxyChannel.toService<IGitService>(
      channelClient.getChannel(IGitService.channelName),
    );
    this.gitCheckpointService = ProxyChannel.toService<IGitCheckpointService>(
      channelClient.getChannel(IGitCheckpointService.channelName),
    );
    this.systemService = ProxyChannel.toService<ISystemService>(
      channelClient.getChannel(ISystemService.channelName),
    );
    this.terminalService = ProxyChannel.toService<ITerminalService>(
      channelClient.getChannel(ITerminalService.channelName),
    );
    this.settingService = ProxyChannel.toService<ISettingService>(
      channelClient.getChannel(ISettingService.channelName),
    );
    this.onboardingRecordService = ProxyChannel.toService<IOnboardingRecordService>(
      channelClient.getChannel(IOnboardingRecordService.channelName),
    );
    this.credentialService = ProxyChannel.toService<ICredentialService>(
      channelClient.getChannel(ICredentialService.channelName),
    );
    this.broadcastService = ProxyChannel.toService<IBroadcastService>(
      channelClient.getChannel(IBroadcastService.channelName),
    );
    this.kayingcodeTaskService = ProxyChannel.toService<IKayingCodeTaskService>(
      channelClient.getChannel(IKayingCodeTaskService.channelName),
    );
    if (options.windowControllerService !== false) {
      this.windowControllerService = ProxyChannel.toService<IWindowControllerService>(
        channelClient.getChannel(IWindowControllerService.channelName),
      );
    }
    this.kayingcodeAgentService = ProxyChannel.toService<IKayingCodeAgentService>(
      channelClient.getChannel(IKayingCodeAgentService.channelName),
    );
    this.kayingcodeSessionService = ProxyChannel.toService<IKayingCodeSessionService>(
      channelClient.getChannel(IKayingCodeSessionService.channelName),
    );
    this.conversationShareService = ProxyChannel.toService<IConversationShareService>(
      channelClient.getChannel(IConversationShareService.channelName),
    );
    this.fileWatcherService = ProxyChannel.toService<IFileWatcherService>(
      channelClient.getChannel(IFileWatcherService.channelName),
    );
    this.oauthService = ProxyChannel.toService<IOAuthService>(
      channelClient.getChannel(IOAuthService.channelName),
    );
    this.providerSettingsService = ProxyChannel.toService<IProviderSettingsService>(
      channelClient.getChannel(IProviderSettingsService.channelName),
    );
    this.modelSelectionService = ProxyChannel.toService<IModelSelectionService>(
      channelClient.getChannel(IModelSelectionService.channelName),
    );
    Object.defineProperty(this, "providerProvisioningTargetService", {
      value: ProxyChannel.toService<IProviderProvisioningTargetService>(
        channelClient.getChannel(IProviderProvisioningTargetService.channelName),
      ),
      enumerable: false,
    });
    this.usageStatsService = ProxyChannel.toService<IUsageStatsService>(
      channelClient.getChannel(IUsageStatsService.channelName),
    );
    this.codingPlanSubscriptionService = ProxyChannel.toService<ICodingPlanSubscriptionService>(
      channelClient.getChannel(ICodingPlanSubscriptionService.channelName),
    );
    this.clientConfigService = ProxyChannel.toService<IClientConfigService>(
      channelClient.getChannel(IClientConfigService.channelName),
    );
    this.clientScenesService = ProxyChannel.toService<IClientScenesService>(
      channelClient.getChannel(IClientScenesService.channelName),
    );
    this.offPeakTaskService = ProxyChannel.toService<IOffPeakTaskService>(
      channelClient.getChannel(IOffPeakTaskService.channelName),
    );
    this.skillsService = ProxyChannel.toService<ISkillsService>(
      channelClient.getChannel(ISkillsService.channelName),
    );
    this.skillSyncService = ProxyChannel.toService<ISkillSyncService>(
      channelClient.getChannel(ISkillSyncService.channelName),
    );
    this.mcpSyncService = ProxyChannel.toService<IMcpSyncService>(
      channelClient.getChannel(IMcpSyncService.channelName),
    );
    this.pluginSyncService = ProxyChannel.toService<IPluginSyncService>(
      channelClient.getChannel(IPluginSyncService.channelName),
    );
    this.pluginsService = ProxyChannel.toService<IPluginsService>(
      channelClient.getChannel(IPluginsService.channelName),
    );
    this.pluginManagementService = ProxyChannel.toService<IPluginManagementService>(
      channelClient.getChannel(IPluginManagementService.channelName),
    );
    this.subagentsService = ProxyChannel.toService<ISubagentsService>(
      channelClient.getChannel(ISubagentsService.channelName),
    );
    this.commandsService = ProxyChannel.toService<ICommandsService>(
      channelClient.getChannel(ICommandsService.channelName),
    );
    this.hooksService = ProxyChannel.toService<IHooksService>(
      channelClient.getChannel(IHooksService.channelName),
    );
    this.memoryService = ProxyChannel.toService<IMemoryService>(
      channelClient.getChannel(IMemoryService.channelName),
    );
    this.settingsSyncService = ProxyChannel.toService<ISettingsSyncService>(
      channelClient.getChannel(ISettingsSyncService.channelName),
    );
    this.feedbackService = ProxyChannel.toService<IFeedbackService>(
      channelClient.getChannel(IFeedbackService.channelName),
    );
    this.promptAttachmentTransferService = ProxyChannel.toService<IPromptAttachmentTransferService>(
      channelClient.getChannel(IPromptAttachmentTransferService.channelName),
    );
    // 与 providerProvisioningTargetService 同法：不可枚举，避免被当作通用服务面遍历/序列化。
    Object.defineProperty(this, MOBILE_MODEL_CATALOG_FIELD, {
      value: ProxyChannel.toService<IMobileModelCatalogAccess>(
        channelClient.getChannel(MOBILE_MODEL_CATALOG_CHANNEL),
      ),
      enumerable: false,
    });
  }
}
