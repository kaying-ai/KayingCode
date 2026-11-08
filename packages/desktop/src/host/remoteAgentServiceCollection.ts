import {
  ServiceCollection,
  IBroadcastService,
  IClientConfigService,
  IClientScenesService,
  ICodingPlanSubscriptionService,
  ICommandsService,
  IConversationShareService,
  ICredentialService,
  IFileService,
  IFileWatcherService,
  IGitCheckpointService,
  IGitService,
  IHooksService,
  IKayingCodeAgentService,
  IKayingCodeSessionService,
  IKayingCodeTaskService,
  IMcpSyncService,
  IMediaPreviewService,
  IMemoryService,
  IModelSelectionService,
  IOAuthService,
  IPluginManagementService,
  IPluginSyncService,
  IPluginsService,
  IPromptAttachmentTransferService,
  IProviderSettingsService,
  ISettingService,
  ISettingsSyncService,
  ISkillSyncService,
  ISkillsService,
  ISubagentsService,
  ISystemService,
  ITerminalService,
  IUsageStatsService,
  type IServiceAccessor,
} from "@zcode/services";
import { assertLegacyRemoteWorkspaceRpcContract } from "./legacyRemoteWorkspaceRpcContract.js";

/**
 * 独立 Server 是执行与配置权威；这里只增加 desktop attachment 所需的 task reporting，
 * 不安装本地 runtime-preferences 或 Provider Provisioning 写入桥。
 */
export function createRemoteAgentServiceCollection(params: {
  connectionServices: IServiceAccessor;
  createReportingRemoteKayingCodeTaskService: <T extends object>(service: T) => T;
}): ServiceCollection {
  assertLegacyRemoteWorkspaceRpcContract(params.connectionServices);
  const remote = params.connectionServices;
  const taskService = params.createReportingRemoteKayingCodeTaskService(
    remote.kayingcodeTaskService,
  );
  return new ServiceCollection()
    .register(IFileService, remote.fileService)
    .register(IMediaPreviewService, remote.mediaPreviewService)
    .register(IGitService, remote.gitService)
    .register(IGitCheckpointService, remote.gitCheckpointService)
    .register(ISystemService, remote.systemService)
    .register(ITerminalService, remote.terminalService)
    .register(ISettingService, remote.settingService)
    .register(ICredentialService, remote.credentialService)
    .register(IBroadcastService, remote.broadcastService)
    .register(IKayingCodeTaskService, taskService)
    .register(IKayingCodeAgentService, remote.kayingcodeAgentService)
    .register(IKayingCodeSessionService, remote.kayingcodeSessionService)
    .register(IConversationShareService, remote.conversationShareService)
    .register(IFileWatcherService, remote.fileWatcherService)
    .register(IOAuthService, remote.oauthService)
    .register(IModelSelectionService, remote.modelSelectionService)
    .register(IProviderSettingsService, remote.providerSettingsService)
    .register(IUsageStatsService, remote.usageStatsService)
    .register(ICodingPlanSubscriptionService, remote.codingPlanSubscriptionService)
    .register(IClientConfigService, remote.clientConfigService)
    .register(IClientScenesService, remote.clientScenesService)
    .register(ISkillsService, remote.skillsService)
    .register(ISkillSyncService, remote.skillSyncService)
    .register(IMcpSyncService, remote.mcpSyncService)
    .register(IPluginSyncService, remote.pluginSyncService)
    .register(IPluginsService, remote.pluginsService)
    .register(IPluginManagementService, remote.pluginManagementService)
    .register(ICommandsService, remote.commandsService)
    .register(ISubagentsService, remote.subagentsService)
    .register(IHooksService, remote.hooksService)
    .register(IMemoryService, remote.memoryService)
    .register(ISettingsSyncService, remote.settingsSyncService)
    .register(IPromptAttachmentTransferService, remote.promptAttachmentTransferService);
}
