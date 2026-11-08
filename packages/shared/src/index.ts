/* eslint-disable max-lines -- 共享协议的兼容公开入口集中导出；本文件不持有运行时状态，拆分会改变既有消费路径。 */
export { cloudContentPayloadSchema, contentBundleSchema } from "./cloudContent.js";
export * from "./networkCapture.js";
export type {
  CloudContentPayload,
  CloudContentBundle,
  CloudContentHeroType,
} from "./cloudContent.js";
export type {
  FileBinaryPreview,
  FileEntry,
  FileMediaPreview,
  FileStat,
  FileTextSlice,
  FileWatchEvent,
  WorkspaceFileEntry,
  SystemInfo,
  AppSettings,
  ElectronReleaseChannel,
  IntegratedTerminalShellDialect,
  IntegratedTerminalShellOption,
  IntegratedTerminalShellSelection,
  Locale,
  LocalePreference,
  KayingCodeInteractionBehavior,
  TabId,
  TabState,
  ResourceUsageCategory,
  ResourceUsageBaseGroupKey,
  ResourceUsageProcess,
  HostResourceUsageProcess,
  ResourceUsageSnapshot,
  RemoteTargetSnapshot,
  RemoteAgentTargetSnapshot,
  RemoteWorkspaceSessionEntry,
  PersistedWorkspaceSessionEntry,
} from "./protocol.js";
export type { WorkspacePurpose } from "./workspacePurpose.js";
export { DEFAULT_LOCALE } from "./protocol.js";
export {
  KAYINGCODE_VERSION,
  KAYINGCODE_COMMIT,
  KAYINGCODE_BUILD_TIME,
  ZCODE_UPSTREAM_VERSION,
} from "./version.js";
export type { HelloMessage, HelloAckMessage } from "./handshake.js";
export type { ArmsRumEnv, KayingCodeEnv, KayingCodeProductFlavor } from "./env.js";
export type { RemoteAssetInstallMode } from "./remoteAssetInstallMode.js";
export type {
  RemoteResourcePackageId,
  RemoteResourcePackageSelection,
} from "./remoteResourcePackages.js";
export type {
  DockerConnectOptions,
  RemoteTarget,
  ServerConnectOptions,
  SSHConnectOptions,
  WSLConnectOptions,
} from "./remoteTarget.js";
export { stripRemoteTargetSecrets } from "./remoteTarget.js";
export type {
  RemoteAgentSshTarget,
  RemoteAgentTarget,
  WorkspaceConnectionTarget,
} from "./remoteAgentTarget.js";
export {
  stripRemoteAgentTargetSecrets,
  stripWorkspaceConnectionTargetSecrets,
} from "./remoteAgentTarget.js";
export { buildSshRemoteHostKey } from "./remoteSshHostKey.js";
export { buildRemoteEnvironmentKey } from "./remoteEnvironmentKey.js";
export type {
  ShortcutChannel,
  ShortcutCommandEntry,
  ShortcutCommandId,
  ParsedShortcutBinding,
} from "./shortcutCommands.js";
export {
  SHORTCUT_COMMANDS,
  getDefaultShortcutBindings,
  isValidShortcutBinding,
  normalizeShortcutKey,
  parseShortcutBinding,
  serializeShortcutBinding,
} from "./shortcutCommands.js";
export {
  KAYINGCODE_ENV,
  KAYINGCODE_PRODUCT_FLAVOR,
  KAYINGCODE_APP_VERSION_ENV,
  KAYINGCODE_BUILD_COMMIT_ID_ENV,
  RUNTIME_KAYINGCODE_DEBUG,
  KAYINGCODE_TELEMETRY_REPORT_ENDPOINT,
  KAYINGCODE_ARMS_RUM_ENDPOINT,
  KAYINGCODE_TELEMETRY_ENABLED,
  mapKayingCodeEnvToArmsRumEnv,
  normalizeKayingCodeEnv,
  normalizeKayingCodeProductFlavor,
  ZCODE_ARMS_RUM_ENDPOINT,
  ZCODE_TELEMETRY_REPORT_ENDPOINT,
  ZCODE_AUTO_UPDATE_ENABLED,
} from "./env.js";
export * from "./errors.js";
export {
  USER_INSTRUCTIONS_MAX_BYTES,
  USER_INSTRUCTIONS_TOO_LARGE_ERROR_CODE,
} from "./userInstructions.js";
export * from "./rendererActionTrace.js";
export * from "./validation.js";
export * from "./api.js";
export * from "./kayingcode-protocol/index.js";
export * from "./account-provider-state.js";
// re-home：旧协议承重面的幸存文件（消费者继续走 barrel，零感知）
export * from "./kayingcode-protocol-legacy-types.js";
export * from "./kayingcode-task-types-core.js";
export * from "./task-realtime-core.js";
export * from "./remote-workspace-identity.js";
export * from "./kayingcode-api-retry-status.js";
export * from "./kayingcode-network-debug-status.js";
export * from "./kayingcode-session-visible-content.js";
export * from "./official-mcp-auth.js";
export * from "./official-mcp-tool-error.js";
export * from "./conversation-message-projection-policy.js";
export * from "./conversation-share.js";
export * from "./conversation-share-content.js";
export * from "./conversation-preview-artifacts.js";
export * from "./kayingcode-session-task-status.js";
export * from "./kayingcode-tool-projection-memory.js";
export * from "./kayingcode-slash-command-help.js";
export * from "./kayingcodeEndpoint.js";
export * from "./kayingcode-source-headers.js";
export * from "./kayingcode-agent-policy.js";
export * from "./kayingcode-media-policy.js";
export * from "./media-preview.js";
export * from "./plugin-display-name.js";
export * from "./kayingcode-agent-runtime.js";
export * from "./runtimeEnv.js";
export * from "./endpointHostname.js";
export * from "./dynamic-workflow-feature.js";
export * from "./markdown-artifact-images.js";
export * from "./serviceAuthority.js";
export * from "./server-remote.js";
export * from "./source-server/index.js";

export interface ICredentialStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export * from "./test-ids.js";
export * from "./test-ids-workflow.js";
export * from "./channels.js";
export * from "./storage.js";
export * from "./oauth.js";
export * from "./desktopMenu.js";
export * from "./feedback.js";
export * from "./e2e-test-bridge.js";
export * from "./remoteAppConfig.js";
export * from "./helpAppConfig.js";
export * from "./remoteAssetInstallMode.js";
export * from "./onboardingRecord.js";
export * from "./remoteResourcePackages.js";
export { resolvePlanIdentitySnapshot } from "./plan-identity.js";
export {
  BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS,
  BROWSER_VIEW_RESTORE_BOOTSTRAP_URL,
  LOCAL_MEDIA_PREVIEW_SCHEME,
  BROWSER_LOCAL_PREVIEW_SCHEME,
  browserPreviewSourceUrl,
  DesktopCommandIds,
  buildLocalMediaPreviewUrl,
  createOpenInEditorRemoteTarget,
  unwrapRemoteWorkspaceBindResult,
} from "./platform.js";
export type {
  ArmsCustomEventPayload,
  ConfigureFinalArmsCustomEventE2ERequest,
  FinalArmsCustomEventE2EEntry,
  FinalArmsCustomEventPayload,
  MobilePluginDiscoveryTelemetry,
  RendererTelemetryEventPayload,
  TelemetryEventPayload,
  TelemetryRendererContext,
  TelemetryUiMode,
} from "./telemetry.js";
export {
  PLUGIN_TELEMETRY_EVENTS,
  mobilePluginDiscoveryTelemetrySchema,
  sanitizePluginTelemetryDetail,
  collectTelemetryRendererContext,
  normalizeTelemetryUiMode,
  telemetryUiModeSchema,
  resolveSafeTelemetryHostname,
  sanitizeTelemetryErrorMessage,
  sanitizeTelemetrySkillName,
  sanitizeTelemetryEventDetail,
} from "./telemetry.js";
export type {
  RedactTelemetryTextOptions,
  TelemetryProviderIdentity,
  TelemetryProviderScope,
} from "./telemetryRedaction.js";
export {
  TELEMETRY_SAFE_BUILTIN_MODEL_IDS,
  TELEMETRY_TEXT_MAX_LENGTH,
  redactTelemetryText,
  redactTelemetryUrl,
  resolveTelemetryModelId,
  resolveTelemetryProviderScope,
  sanitizeTelemetryModelValue,
} from "./telemetryRedaction.js";
export * from "./remoteUsageTelemetry.js";
export * from "./sessionCreateTelemetry.js";
export type { LaunchMarks } from "./launchMarks.js";
export { LAUNCH_MARKS_QUERY_KEY, parseLaunchMarks, serializeLaunchMarks } from "./launchMarks.js";
export type {
  CancelPendingRemoteConnectionRequest,
  BindRemoteWorkspaceSessionContextRequest,
  BindRemoteWorkspaceSessionContextIpcResult,
  BindRemoteWorkspaceSessionContextResult,
  BrowserTabResidencyState,
  BrowserViewCloseTabNotification,
  BrowserViewCloseTabRequest,
  BrowserViewOperationPayload,
  BrowserViewResidencyReportPayload,
  BrowserViewResidencyTransitionPayload,
  BrowserViewRestoredTabShell,
  BrowserViewRestoreTabsRequest,
  BrowserViewScreenshotSurfacePreparePayload,
  BrowserViewScreenshotSurfaceReadyPayload,
  BrowserViewScreenshotSurfaceReleasePayload,
  BrowserViewSurfaceScaleMode,
  BrowserViewViewportChangedPayload,
  ChromeBrowserDataImportError,
  ChromeBrowserDataImportOptions,
  ChromeBrowserDataImportResult,
  ConnectRemoteRequest,
  FileApplicationInfo,
  FileApplicationTarget,
  CreateTempTextAttachmentRequest,
  CreateTempTextAttachmentResult,
  MaterializeWorkflowArtifactFileRequest,
  MaterializeWorkflowArtifactFileResult,
  SaveFileRequest,
  SaveFileResult,
  PrintPageToPdfResult,
  DesktopCloseToTrayCapability,
  DesktopCommandId,
  DesktopZoomState,
  WindowControlsOverlayMetrics,
  DesktopWindowChromeState,
  DesktopTitleBarTheme,
  DockerContainerInfo,
  EditorInfo,
  ApplicationIconInfo,
  ApplicationIconLocator,
  ApplicationIconRequest,
  BrowserGuestAttachRejectReason,
  BrowserGuestAttachResult,
  EmbeddedBrowserDataClearResult,
  EmbeddedBrowserDataClearTarget,
  EmbeddedBrowserOpenUrlRequest,
  EmbeddedBrowserPermissionDeviceOption,
  EmbeddedBrowserPermissionPromptEvent,
  EmbeddedBrowserPermissionResolution,
  EmbeddedBrowserPermissionResolveRequest,
  EmbeddedBrowserPermissionScreenOption,
  EmbeddedBrowserSitePermissionResetRequest,
  EmbeddedBrowserSitePermissionUpdateRequest,
  EmbeddedBrowserSitePermissionsSnapshot,
  IPlatformService,
  OpenInEditorRemoteTarget,
  OpenInEditorOptions,
  PostUpdateReleaseNotesPayload,
  RemoteConnectionRuntimeLog,
  RemoteSessionClosedEvent,
  RemoteSessionReconnectedEvent,
  RemoteServiceSession,
  SSHConfigAliasOption,
  TaskNotificationPayload,
  UpdateCheckResultPayload,
  UpdateStatePayload,
  WSLDistro,
  KayingCodeStdioTapDevState,
  WindowControlsOverlayReadyPayload,
} from "./platform.js";
export type { KayingCodeTaskCreateResult } from "./kayingcode-task-types.js";
export * from "./kayingcode-task-types.js";
export * from "./automation-types.js";
export * from "./off-peak-types.js";
export * from "./background-task-control-merge.js";
export * from "./background-task-controls.js";
export * from "./background-task-notifications.js";
export * from "./background-bash-jobs.js";
export * from "./kayingcode-agent-model-state.js";
export * from "./task-realtime.js";
export { formatTimestamp, formatLogPrefix } from "./log-format.js";
export * from "./model-provider-types.js";
export * from "./model-provider-family.js";
export * from "./provider-family-connection-selection.js";
export * from "./provider-provisioning.js";
export * from "./custom-model-value.js";
export * from "./model-selection-types.js";
export * from "./model-selection-key.js";
export * from "./model-selection.js";
export * from "./legacy-model-provider-identity.js";
export * from "./official-glm-model-id.js";
export * from "./skills-types.js";
export * from "./skill-sync.js";
export * from "./mcp-sync.js";
export * from "./plugin-sync.js";
export * from "./remote-sync.js";
export * from "./plugin-types.js";
export * from "./subagents-types.js";
export * from "./settings-source.js";
export * from "./settings-errors.js";
export * from "./app-runtime-preferences.js";
export * from "./command-types.js";
export * from "./plugin-marketplaces.js";
export * from "./lineChangeStat.js";
export * from "./process-names.js";
export * from "./mcp.js";
export * from "./runtime-tool-runtime.js";
export * from "./git.js";
export * from "./bots.js";
export * from "./assistant-message-parts.js";
export * from "./kayingcodePersistedMessageMerge.js";
export * from "./assistant-presentation.js";
export * from "./tool-call-summary.js";
export * from "./tool-identity.js";
export * from "./streaming-tool-input-preview.js";
export * from "./tool-plan-adapter.js";
export * from "./permission-request-preview.js";
export * from "./web-remote-control.js";
export * from "#src/web-remote-relay/index.js";

export * from "./web-remote-control-rpc-transport.js";
export * from "./settings-sync.js";
export * from "./uuid.js";
export * from "./usage-stats.js";
export * from "./highspeed.js";
export * from "./force-update-config.js";
export * from "./forceUpdate.js";
export * from "./intranetProbe.js";
export * from "./intranetDefaults.js";
export * from "./hooks.js";
export * from "./memory.js";
export * from "./output-style.js";
export * from "./openrouter-attribution.js";
export * from "./workspaceSessionRestore.js";
export * from "./skill-scan-policy.js";
export * from "./browser-use/index.js";
export * from "./taptap-maker.js";
export * from "./plugin-browser-compare.js";

export { API_KEY_USAGE_SCENE, type ApiKeyCreationUsageScene } from "./api-key-usage-scene.js";
export {
  projectAccessTokenFingerprint,
  ProjectAccessTokenTransientError,
} from "./project-access-token.js";
export {
  ProjectAccessTokenClient,
  type ProjectAccessTokenInput,
  type ProjectAccessTokenMaterial,
} from "./project-access-token-client.js";

export * from "./attachment-source.js";

export {
  requestSecuritySensitiveHeaders,
  isRequestSecurityFailure,
} from "./request-security-edition/policy.js";
export * from "./request-security-edition/verification-policy.js";

export * from "./conversation-share-tool-presentation.js";
export {
  parseSubagentMarkdownSelection,
  formatSubagentMarkdownModel,
} from "./subagent-markdown-selection.js";
export * from "./memoryDiagnostics.js";
export * from "./database-startup.js";
export * from "./processResourceTelemetry.js";
export * from "./execution-state.js";

export { bashOutputDisplaySchema } from "./bash-output-display.js";

export * from "./subagent-runtime-config.js";

export * from "./subagent-profile.js";
export { parseAgentProfileFromMarkdown } from "./subagent-profile-parser.js";

export * from "./local-ttft/contract.js";
export * from "./pluginStoreOrder.js";
export * from "./clientConfig.js";
export * from "./client-public-api/index.js";
export * from "./pluginStoreOrdering.js";
export * from "./marketingTouch.js";
export * from "./rewardsEmbedded.js";
export * from "./rewardsBridge.js";
export * from "./session-debug.js";
export { redactFeedbackText } from "./feedbackPrivacy.js";
export * from "./game-development-plugin-listing.js";
export * from "./plugin-skill-details.js";

export * from "./channel-mention.js";
export * from "./usage-quota.js";
export * from "./gen-ui/index.js";

export * from "./mcp-apps/index.js";
export * from "./web-remote-relay/index.js";

export * from "./bots.js";
export * from "./conversationSelection.js";

export * from "./source-server/index.js";
export * from "./web-remote-control-rpc-transport.js";
export * from "./web-remote-control.js";
export * from "./localrun.js";

export type { PublicZCodeErrorCode as PublicKayingCodeErrorCode } from "./source-server/errorCodes.js";
