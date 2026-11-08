// Descriptors & collection (browser-safe)
export { type ServiceDescriptor, createServiceDescriptor } from "./descriptors.js";
export { ServiceCollection } from "./collection.js";
export type { ServiceExposurePolicy } from "./collection.js";
export {
  IModelSelectionService,
  IProviderSettingsService,
  type ModelSelectionView,
  type ModelSelectionViewInput,
  type ProviderSettingsProviderView,
  type ProviderSettingsView,
} from "./model-provider/providerFacadeServices.js";
export {
  createAccountRequestAuthService,
  type IAccountRequestAuthService,
  type AccountRequestAuthInput,
  type AccountRequestAuthMaterial,
  type AccountRequestAuthResolver,
} from "./model-provider/accountRequestAuthService.js";
export { IProviderProvisioningTargetService } from "./model-provider/providerProvisioning.js";
export {
  collectServiceMemoryDiagnostics,
  memoryDiagnosticsRegistry,
  registerMemoryDiagnosticsProvider,
} from "./memoryDiagnostics.js";

// Accessor
export type { IServiceAccessor } from "./accessor.js";
export {
  ConversationShareServiceError,
  createUnsupportedConversationShareService,
  IConversationShareService,
} from "./conversation-share/conversationShare.js";
export type {
  ConversationShareSelection,
  ConversationSharePublishProgress,
  ConversationShareImportProgress,
  ImportConversationShareInput,
  ImportConversationShareResult,
  ImportedConversationShare,
  ConversationSharePreflightInput,
  ConversationSharePreflightResult,
  PublishTextConversationInput,
} from "./conversation-share/conversationShare.js";
// Conversation share 的具体实现依赖 Node 文件系统，只能从 @zcode/services/node 引入；
// 根入口必须保持 browser-safe，避免 renderer 解析到 node:* 模块。
export {
  createConversationTelemetryService,
  type ConversationTelemetryWorkspaceTarget,
  type IConversationTelemetryService,
} from "./conversation-telemetry/conversationTelemetry.js";

// File service — IFileService is both a type (interface) and value (descriptor)
export { IFileService } from "./file/file.js";
export { IMediaPreviewService } from "./media-preview/mediaPreview.js";
export type { MediaPreviewPreparation } from "./media-preview/mediaPreview.js";

// Git service — IGitService is both a type (interface) and value (descriptor)
export { IGitService } from "./git/git.js";
export { IGitCheckpointService } from "./git/gitCheckpoint.js";

// System service — ISystemService is both a type (interface) and value (descriptor)
export { ISystemService } from "./system/system.js";

// Terminal service — ITerminalService is both a type (interface) and value (descriptor)
export { ITerminalService } from "./terminal/terminal.js";

// Setting service — ISettingService is both a type (interface) and value (descriptor)
export { ISettingService } from "./setting/setting.js";

// Credential service — ICredentialService is both a type (interface) and value (descriptor)
export { ICredentialService } from "./credential/credential.js";

// Broadcast service — IBroadcastService is both a type (interface) and value (descriptor)
export { IBroadcastService } from "./broadcast/broadcast.js";

// Onboarding 完成记录服务（本地持久化，后续上传服务器）
export { IOnboardingRecordService } from "./onboarding/onboardingRecord.js";
export type {
  CreateOnboardingRecordServiceOptions,
  OnboardingRecordServiceFactory,
} from "./onboarding/onboardingRecord.js";
// 这里只能导出 descriptor 和类型。根 index 会被 renderer 经 value import 拉进浏览器包，
// 若 value 导出 createOnboardingRecordService，会连带 fs/atomicFileUtils → @zcode/shared/node →
// node:timers/promises 整条 Node 链进浏览器，模块加载直接抛错导致整个应用黑屏。
// 工厂函数由 host 侧（node.ts）与测试从实现文件路径直接导入，与 createSettingService 同惯例。
export type {
  BroadcastClaimAcquireResult,
  BroadcastClaimLease,
  BroadcastMessage,
} from "./broadcast/broadcast.js";

// KayingCode task wrapper service — task 列表/置顶/归档等 app 侧包装状态入口。
export { IKayingCodeTaskService } from "./session/kayingcodeTaskService.js";
export type {
  KayingCodeArchivedTaskDeletionResult,
  KayingCodeModelTrajectory,
  KayingCodeModelTrajectoryCallSource,
  KayingCodeModelTrajectoryCallSourceKind,
  KayingCodeModelTrajectoryContentPart,
  KayingCodeModelTrajectoryMessage,
  KayingCodeModelTrajectoryRecord,
  KayingCodeModelTrajectoryUsage,
  KayingCodeTaskListKind,
  KayingCodeTaskListQuery,
  KayingCodeTaskListResult,
  KayingCodeTaskListSortBy,
  KayingCodeTaskListWorkspaceScope,
  KayingCodeTaskReadyOutcome,
  KayingCodeGroupedTaskRef,
  KayingCodeGroupedTaskView,
  KayingCodeGroupedTaskViewNode,
  KayingCodeGroupedTaskViewOrderInput,
  KayingCodeGroupedTaskViewQuery,
  KayingCodeGroupedTaskViewStructure,
  KayingCodeGroupedTaskViewStructureMember,
  KayingCodeGroupedTaskViewStructureTopOrder,
  KayingCodeGroupedTaskViewTopLevelNodeRef,
  KayingCodeTaskGroup,
  KayingCodeTaskGroupColor,
} from "./session/kayingcodeTaskService.js";
export type { KayingCodeTaskListItem } from "./session/kayingcodeTaskListTypes.js";

export { IWindowControllerService } from "./window-controller/windowController.js";
export type {
  WindowHostControllerFrame,
  WindowHostControllerMutation,
  WindowHostControllerTaskListItem,
  WindowHostControllerTaskListResult,
  WindowHostTaskUnreadSignal,
} from "./window-controller/windowController.js";

// KayingCode agent service — IKayingCodeAgentService is both a type (interface) and value (descriptor)
export {
  IKayingCodeAgentService,
  type KayingCodeAgentLocalRuntimeChildProcesses,
  KAYINGCODE_AGENT_RUNTIME_UNAVAILABLE_CODE,
} from "./kayingcode-agent/kayingcodeAgent.js";
export {
  isKayingCodeAgentMcpStatusModeUnsupportedError,
  KAYINGCODE_AGENT_MCP_STATUS_MODE_UNSUPPORTED_ERROR_CODE,
  KayingCodeAgentMcpStatusModeUnsupportedError,
} from "./kayingcode-agent/kayingcodeAgentErrors.js";
export {
  createKayingCodeAgentConnectionScope,
  readTrustedKayingCodeAgentV4Connection,
} from "./kayingcode-agent/kayingcodeAgentConnectionScope.js";
export type {
  KayingCodeAgentConnectionScope,
  KayingCodeAgentV4ClientMode,
  KayingCodeAgentV4ConnectionContext,
} from "./kayingcode-agent/kayingcodeAgentConnectionScope.js";
export type {
  KayingCodeAgentAttachmentBeginParams,
  KayingCodeAgentAttachmentChunkParams,
  KayingCodeAgentAttachmentTerminalParams,
  KayingCodeAgentCreateSessionParams,
  KayingCodeAgentInitializeResult,
  KayingCodeAgentStorageStartupSnapshot,
  KayingCodeAgentRuntimeLifecycleEvent,
  KayingCodeAgentRuntimePolicy,
  KayingCodeAgentReadSessionParams,
  KayingCodeAgentResumeSessionParams,
  KayingCodeAgentRunAutomationNowResult,
  KayingCodeAgentSavedWorkflowTarget,
  KayingCodeAgentSendPromptParams,
  KayingCodeAgentServiceEvent,
  KayingCodeAgentSessionSubscribeParams,
  KayingCodeAgentSessionTarget,
  KayingCodeAgentSetModeParams,
  KayingCodeAgentSetModelParams,
  KayingCodeAgentSetThoughtLevelParams,
  KayingCodeAgentWorkspaceTarget,
} from "./kayingcode-agent/kayingcodeAgent.js";

// KayingCode session service — app-facing session facade without KayingCode Agent naming.
export { IKayingCodeSessionService } from "./kayingcode-session/kayingcodeSession.js";
export type {
  KayingCodeSessionCreateParams,
  KayingCodeSessionEventsParams,
  KayingCodeSessionInitializeResult,
  KayingCodeSessionListParams,
  KayingCodeSessionMessagesParams,
  KayingCodeSessionReadParams,
  KayingCodeSessionResumeParams,
  KayingCodeSessionServiceEvent,
  KayingCodeSessionSetModeParams,
  KayingCodeSessionSetModelParams,
  KayingCodeSessionSetThoughtLevelParams,
  KayingCodeSessionSubscribeParams,
  KayingCodeTaskTarget,
  KayingCodeSessionWorkspaceTarget,
} from "./kayingcode-session/kayingcodeSession.js";

// Bots service — IBotsService is both a type (interface) and value (descriptor).
export { IBotsService } from "./bots/bots.js";
export type {
  BotRemoteWorkspaceResolver,
  BotRemoteWorkspaceResolution,
  BotBindCodeResult,
  BotCreateBindCodeParams,
  BotListWorkspaceRefsParams,
  BotSaveBotParams,
  BotTestResult,
} from "./bots/bots.js";
export type {
  BotProjectConnection,
  BotProjectRuntimePort,
  BotRemoteRuntimeService,
  BotRemoteTarget,
  BotRuntimeSubscription,
} from "./bot-project-runtime/index.js";

// Hooks service — IHooksService is both a type (interface) and value (descriptor).
export { IHooksService } from "./hooks/hooks.js";

// Memory service — IMemoryService is both a type (interface) and value (descriptor).
export {
  IMemoryService,
  PROJECT_MEMORY_FILE_CHANGED_ERROR_CODE,
  PROJECT_MEMORY_PREVIEW_LIMIT_EXCEEDED_ERROR_CODE,
} from "./memory/memory.js";
export type { ProjectMemoryFileSummary, ProjectMemoryWorkspaceSummary } from "./memory/memory.js";

export type { SessionRealtimePort } from "./session/sessionRealtimePort.js";

// FileWatcher service — IFileWatcherService is both a type (interface) and value (descriptor)
export { IFileWatcherService } from "./fileWatcher/fileWatcher.js";

// OAuth service — IOAuthService is both a type (interface) and value (descriptor)
export { IOAuthService } from "./oauth/oauth.js";

// UsageStats service — IUsageStatsService is both a type (interface) and value (descriptor)
export { IUsageStatsService } from "./usage-stats/usageStats.js";

// Storage（资源管理器「存储」tab）：数据类型在 @zcode/shared；这里只导出服务接口与卷分组纯函数
export type { IStorageService } from "./storage/contract.js";

// CodingPlanSubscription service — ICodingPlanSubscriptionService is both a type (interface) and value (descriptor)
export {
  ICodingPlanSubscriptionService,
  type OffPeakClientConfig,
} from "./coding-plan-subscription/codingPlanSubscription.js";
export {
  IClientScenesService,
  type ClientSceneConfig,
  type ClientSceneItem,
  type ClientSceneOption,
  type ClientSceneResponseBody,
  type ClientScenesResponse,
} from "./client-scenes/clientScenes.js";
export { isValidCronExpr } from "./session/automationCronValidation.js";
// 闲时任务管理服务（与 automation 服务面独立）；接口/描述符 browser-safe。
export { IOffPeakTaskService } from "./session/offPeakTask.js";
export type { OffPeakUpdateTaskParams } from "./session/offPeakTask.js";

// Skills service — ISkillsService is both a type (interface) and value (descriptor)
export { ISkillsService } from "./skills/skills.js";
export { ISkillSyncService } from "./skill-sync/skillSync.js";
export { IMcpSyncService } from "./mcp-sync/mcpSync.js";
export { IPluginSyncService } from "./plugin-sync/pluginSync.js";

// Plugins service — IPluginsService is both a type (interface) and value (descriptor)
export { IPluginsService } from "./plugins/plugins.js";
// 设置页插件管理薄服务（UI 平台能力面不再直触 kayingcodeAgentService）
export { IPluginManagementService } from "./plugins/pluginManagement.js";

// Subagents service — ISubagentsService is both a type (interface) and value (descriptor)
export { ISubagentsService } from "./subagents/subagents.js";

// Commands service — ICommandsService is both a type (interface) and value (descriptor)
export { ICommandsService } from "./commands/commands.js";

export { ISettingsSyncService } from "./settings-sync/settingsSync.js";

export { IFeedbackService } from "./feedback/feedback.js";
export type { FeedbackUploadProgress } from "./feedback/feedback.js";
export { IPromptAttachmentTransferService } from "./prompt-attachment-transfer/promptAttachmentTransfer.js";
export type {
  PromptAttachmentStageParams,
  PromptAttachmentStageResult,
  PromptAttachmentTransferPhase,
  PromptAttachmentTransferProgress,
} from "./prompt-attachment-transfer/promptAttachmentTransfer.js";
export type {
  CreateFeedbackTicketInput,
  FeedbackAttachment,
  FeedbackAttachmentKind,
  FeedbackComment,
  FeedbackDeviceInfo,
  FeedbackListQuery,
  FeedbackListResult,
  FeedbackReporter,
  FeedbackTicketDetail,
  FeedbackTicketFramework,
  FeedbackTicketModule,
  FeedbackTicketSeverity,
  FeedbackTicketStatus,
  FeedbackTicketSummary,
  FeedbackTicketType,
} from "@zcode/shared";
export { IClientConfigService } from "./client-config/clientConfig.js";

export * from "./task-facts/index.js";
export type {
  CliTaskFacts,
  SubagentIndexRepair,
  TaskFactChange,
  TaskFactMutation,
  TaskFactSource,
  TaskFactStore,
  TaskFactTarget,
  TaskFactsContract,
  TaskWorkspace,
} from "./task-facts/contract.js";
export { repairSubagentTaskIndex } from "./task-facts/repairSubagentTaskIndex.js";

export { ITaskGroupService } from "./task-groups/contract.js";
export type {
  GroupNode,
  GroupTaskFact,
  GroupTaskRef,
  MoveGroupNode,
  TaskGroup,
  TaskGroupColor,
  TaskGroupStructure,
} from "./task-groups/contract.js";

// 修复依据：浏览器桶导出 Node 实现会把 SQLite/crypto 带进 Taro，导致 Web 通道无法构建。
// 这里只公开契约；Host 工厂和 repository 从 @zcode/services/node 装配。
export * from "./project/contract.js";
export { LEGACY_SINGLE_ROOT_PROJECT_PREFIX } from "./project/contract.js";
export type {
  ProjectDirectories,
  ProjectRoot,
  ProjectTask,
  ProjectTaskRef,
  ProjectTree,
  SaveProjectInput,
  VirtualProject,
} from "./project/contract.js";

export type {
  ProjectMigrationContext,
  ProjectStorageContract,
} from "./project-storage/contract.js";

export { ISourceServerWorkspaceService } from "./source-server-workspace/sourceServerWorkspace.js";
// OutputStyle service — IOutputStyleService 同时是类型（interface）与值（descriptor）。
export { IOutputStyleService } from "./output-style/outputStyle.js";
export {
  ISourceServerManagementService,
  type UpdateConnectionProfileInput,
} from "./source-server-management/sourceServerManagement.js";
export {
  IWindowProjectService,
  IWindowRemoteProjectService,
  IWindowProjectChangesService,
  type WindowProjectDirectoryServices,
} from "./window-project-directory/contract.js";
export {
  createWebRemoteProjectTreeActivityBridge,
  createWindowProjectChangesService,
  type WebRemoteProjectTask,
} from "./window-project-directory/index.js";
export { IRemoteProjectService } from "./remote-projects/contract.js";
export type {
  RemoteProjectHost,
  RemoteProjectEntry,
  RemoteProjectCache,
  RemoteProjectDirectory,
} from "./remote-projects/contract.js";
export { readProjectCatalog, projectSelectionId } from "./project-catalog/index.js";
export type { ProjectCatalogPort, ProjectCatalogSnapshot } from "./project-catalog/contract.js";

export { IGenUiService } from "./gen-ui/contract.js";
export type { GenUiPrepareParams } from "./gen-ui/contract.js";
export {
  createPluginUiBridgeService,
  createPluginUiAppToolsService,
  createPluginUiSamplingService,
} from "./plugin-ui-bridge/index.js";
export type { IPluginUiBridgeService } from "./plugin-ui-bridge/contract.js";
export type { IPluginUiAppToolsService } from "./plugin-ui-bridge/appToolsContract.js";
export type { IPluginUiSamplingService } from "./plugin-ui-bridge/samplingContract.js";

export { IHighspeedCardService } from "./highspeed/highspeedCard.js";
export {
  HighspeedCardService,
  createHighspeedHttpTransport,
  buildHighspeedTurnExecution,
} from "./highspeed/highspeedCardService.js";
export { createHighspeedMockTransport } from "./highspeed/highspeedMockTransport.js";
