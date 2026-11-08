import { IOffPeakTaskService } from "./session/offPeakTask.js";
import type { IRemoteProjectService } from "#src/remote-projects/contract.js";
import type { ITaskGroupService } from "#src/task-groups/contract.js";
import type { WindowProjectDirectoryServices } from "#src/window-project-directory/contract.js";
import type { IProjectService } from "#src/project/contract.js";
import type { IGenUiService } from "./gen-ui/contract.js";
import type { ISourceServerManagementService } from "./source-server-management/sourceServerManagement.js";
import type { IFileService } from "./file/file.js";
import type { IMediaPreviewService } from "./media-preview/mediaPreview.js";
import type { IGitService } from "./git/git.js";
import type { IGitCheckpointService } from "./git/gitCheckpoint.js";
import type { ISystemService } from "./system/system.js";
import type { ITerminalService } from "./terminal/terminal.js";
import type { ISettingService } from "./setting/setting.js";
import type { ICredentialService } from "./credential/credential.js";
import type { IBroadcastService } from "./broadcast/broadcast.js";
import type { IKayingCodeTaskService } from "./session/kayingcodeTaskService.js";
import type { IKayingCodeAgentService } from "./kayingcode-agent/kayingcodeAgent.js";
import type { IKayingCodeSessionService } from "./kayingcode-session/kayingcodeSession.js";
import type { IFileWatcherService } from "./fileWatcher/fileWatcher.js";
import type { IOAuthService } from "./oauth/oauth.js";
import type {
  IModelSelectionService,
  IProviderSettingsService,
} from "./model-provider/providerFacadeServices.js";
import type { IUsageStatsService } from "./usage-stats/usageStats.js";
import type { ICodingPlanSubscriptionService } from "./coding-plan-subscription/codingPlanSubscription.js";
import type { IClientConfigService } from "./client-config/clientConfig.js";
import type { IClientScenesService } from "./client-scenes/clientScenes.js";
import type { ISkillsService } from "./skills/skills.js";
import type { ISkillSyncService } from "./skill-sync/skillSync.js";
import type { IMcpSyncService } from "./mcp-sync/mcpSync.js";
import type { IPluginSyncService } from "./plugin-sync/pluginSync.js";
import type { IPluginsService } from "./plugins/plugins.js";
import type { IPluginManagementService } from "./plugins/pluginManagement.js";
import type { ISubagentsService } from "./subagents/subagents.js";
import type { ICommandsService } from "./commands/commands.js";
import type { IHooksService } from "./hooks/hooks.js";
import type { IMemoryService } from "./memory/memory.js";
import type { ISettingsSyncService } from "./settings-sync/settingsSync.js";
import type { IFeedbackService } from "./feedback/feedback.js";
import type { IPromptAttachmentTransferService } from "./prompt-attachment-transfer/promptAttachmentTransfer.js";
import type { IWindowControllerService } from "./window-controller/windowController.js";
import type { IOnboardingRecordService } from "./onboarding/onboardingRecord.js";
import type { IConversationShareService } from "./conversation-share/conversationShare.js";
import type { IBotsService } from "./bots/bots.js";
import type { IOutputStyleService } from "./output-style/outputStyle.js";
import type { ISourceServerWorkspaceService } from "./source-server-workspace/sourceServerWorkspace.js";

/** UI 层消费的统一服务接口 */
export interface IServiceAccessor {
  /** 窗口级项目目录组；远端/旧 Host 未提供时回退到 projectService/remoteProjectService。 */
  readonly windowProjectDirectory?: WindowProjectDirectoryServices;
  /** 当前 Host 的权威项目服务；旧 Host / 测试 double 可不提供。 */
  readonly projectService?: IProjectService;
  /** 本机持有的远端项目入口；旧 Host / 测试 double 可不提供。 */
  readonly remoteProjectService?: IRemoteProjectService;
  /** 任务分组服务；旧 Host / 测试 double 可不提供。 */
  readonly taskGroupService?: ITaskGroupService;
  /** 仅桌面窗口 Host 的 Source Server 目录与连接管理；远端 / Web 不提供。 */
  readonly sourceServerManagementService?: ISourceServerManagementService;
  /** Source Server 握手后的 canonical workspace 映射；standalone server / desktop host 才会注册。 */
  readonly sourceServerWorkspaceService?: ISourceServerWorkspaceService;
  /** Bot 运行时（Feishu 等）；node host 注册，Web 等无 Bot 宿主按可选处理。 */
  readonly botsService?: IBotsService;
  /** Output style 管理；host 注册后 source-settings attachment 才能透传。 */
  readonly outputStyleService?: IOutputStyleService;
  /** 生成式 UI 文档状态与沙箱；web 或旧 host 可不提供。 */
  readonly genUiService?: IGenUiService;
  readonly fileService: IFileService;
  readonly mediaPreviewService?: IMediaPreviewService;
  readonly gitService: IGitService;
  readonly gitCheckpointService: IGitCheckpointService;
  readonly systemService: ISystemService;
  readonly terminalService: ITerminalService;
  readonly settingService: ISettingService;
  /** Onboarding 完成记录（本地持久化）；旧测试 double / 不支持的 host 可不提供。 */
  readonly onboardingRecordService?: IOnboardingRecordService;
  readonly credentialService: ICredentialService;
  readonly broadcastService: IBroadcastService;
  readonly kayingcodeTaskService: IKayingCodeTaskService;
  /** 窗口 Host 聚合面；旧 server wire 或测试 double 可暂不提供。 */
  readonly windowControllerService?: IWindowControllerService;
  readonly kayingcodeAgentService: IKayingCodeAgentService;
  readonly kayingcodeSessionService: IKayingCodeSessionService;
  readonly conversationShareService: IConversationShareService;
  readonly fileWatcherService: IFileWatcherService;
  readonly oauthService: IOAuthService;
  /** 当前 Environment 的 Provider 配置与设置视图。 */
  readonly providerSettingsService: IProviderSettingsService;
  /** 当前 Environment Registry 发布的唯一模型选择 View。 */
  readonly modelSelectionService: IModelSelectionService;
  readonly usageStatsService: IUsageStatsService;
  readonly codingPlanSubscriptionService: ICodingPlanSubscriptionService;
  readonly clientConfigService: IClientConfigService;
  readonly clientScenesService: IClientScenesService;
  /** 闲时任务管理（独立服务面）。 */
  readonly offPeakTaskService: IOffPeakTaskService;
  readonly skillsService: ISkillsService;
  readonly skillSyncService: ISkillSyncService;
  readonly mcpSyncService: IMcpSyncService;
  readonly pluginSyncService: IPluginSyncService;
  readonly pluginsService: IPluginsService;
  /** 设置页插件管理（UI 不再直触 kayingcodeAgentService 的 plugins/* 面） */
  readonly pluginManagementService: IPluginManagementService;
  readonly subagentsService: ISubagentsService;
  readonly commandsService: ICommandsService;
  readonly hooksService: IHooksService;
  readonly memoryService: IMemoryService;
  readonly settingsSyncService: ISettingsSyncService;
  readonly feedbackService: IFeedbackService;
  readonly promptAttachmentTransferService: IPromptAttachmentTransferService;
}
