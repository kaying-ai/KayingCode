export { App } from "./App.js";
export { AppErrorBoundary, ScopedErrorBoundary } from "./ErrorBoundary.js";
export type { ScopedErrorBoundaryVariant } from "./ErrorBoundary.js";
export { Button, buttonVariants } from "./components/ui/button.js";
export { DesktopWindowFrame } from "./DesktopWindowFrame.js";
export {
  AssistantCodeCommentFeatureProvider,
  useAssistantCodeCommentFeatureEnabled,
} from "./AssistantCodeCommentFeatureProvider.js";
export { TooltipProvider } from "./components/ui/tooltip.js";
export { CodeViewer } from "./components/ui/code-viewer.js";
export { Root } from "./Root.js";
// 移动工作台使用同一时间线/行/工具与队列展示，不要求暴露完整 Root 服务面。
export { ConversationTimeline } from "./v4/ConversationTimeline.js";
export { ConversationQueuePanel } from "./v4/ConversationQueuePanel.js";
export type { ConversationRowRenderContext } from "./v4/conversationRowContext.js";
export { DEFAULT_CODE_PREVIEW_SETTINGS } from "./lib/codePreviewSettings.js";
export { PermissionDialog } from "./PermissionDialog.js";
export { pendingPermissionToLegacyRequest } from "./v4/pendingInteractionAdapter.js";
export { UpdateStatusWindowRoot } from "./UpdateStatusWindowRoot.js";
export { ConfirmDialogHost } from "./ConfirmDialog.js";
export { Terminal } from "./Terminal.js";
export { GitGraphPane } from "./git-graph/GitGraphPane.js";
export { layoutGitGraph } from "./git-graph/layout.js";
export type {
  GitGraphCommit,
  GitGraphLayout,
  GitGraphLayoutEdge,
  GitGraphLayoutOptions,
  GitGraphLayoutRow,
  GitGraphRef,
  GitGraphRefKind,
} from "./git-graph/layout.js";
export { SSHDialog, RemoteConnectionDialog } from "./SSHDialog.js";
export { useTheme } from "./useTheme.js";
export type { Theme } from "./useTheme.js";
export { useTestActions } from "./test-actions.js";
export type { TestActions } from "./test-actions.js";
export { StoreProvider, useKayingCodeStore } from "./store/StoreProvider.js";
export type { KayingCodeState } from "./store/index.js";
export {
  ensureSourceSettingsServices,
  getSourceSettingsServices,
  registerSourceSettingsServices,
  useSourceSettingsServices,
} from "./store/sourceSettingsServiceStore.js";
export {
  bindRemoteWorkspacePath,
  getRemoteWorkspaceSession,
  registerBaseWorkspaceServices,
  registerRemoteWorkspaceSession,
  unbindRemoteWorkspacePath,
  unregisterRemoteWorkspaceSession,
  useRemoteWorkspaceSessionStore,
} from "./store/remoteWorkspaceSessionStore.js";
export {
  REMOTE_WORKSPACE_DISCONNECTED_ERROR_CODE,
  createRemoteWorkspaceDisconnectedError,
} from "./lib/remoteWorkspaceServiceError.js";
// Source 设置页公共消费面：目录读取、配置服务解析与 Source attachment 请求。
// 设置页组件本身带可选 settingsSourceServerId；缺省时行为与普通设置页一致。
export { SettingsPage } from "./SettingsPage.js";
export {
  useConfigWorkspaceServices,
  useConfigWorkspaceServicesResolution,
  useConfigWorkspaceTargets,
  useSettingsSourceServices,
} from "./workspace-config-catalog/index.js";
export type {
  ConfigWorkspaceServicesOptions,
  ConfigWorkspaceTarget,
  ConfigWorkspaceTargetsOptions,
} from "./workspace-config-catalog/index.js";
export type { ConfigCatalogPort } from "./workspace-config-catalog/index.js";

// Hooks —— 统一的服务和平台操作访问层
export {
  ServiceProvider,
  useServices,
  useWorkspaceServices,
  PlatformProvider,
  usePlatform,
  useSelectDirectory,
  useConnectRemote,
  useReaddir,
  useSystemInfo,
  useIntranetProbe,
  useTerminal,
  useSettings,
  useRecentProjects,
  useConfirmDialog,
  useCredentials,
  useAuthToken,
  useGitRepository,
  useGitActions,
} from "./hooks/index.js";

export { KayingCodeIntlProvider, useKayingCodeIntl, LocaleSwitcher } from "./i18n/index.js";
export { ResourceManagerApp } from "./resource-manager/ResourceManagerApp.js";
export type {
  ResourceManagerAppProps,
  ResourceManagerTab,
} from "./resource-manager/ResourceManagerApp.js";
export type { IntlInstance } from "./i18n/index.js";
export {
  FileDisplayInline,
  createFileDisplayDom,
  getFileDisplayPath,
  resolveFileDisplayDescriptor,
  setDefaultFileDisplayBasePath,
} from "./lib/fileDisplay.js";
export type { FileDisplayDescriptor, FileDisplayOptions } from "./lib/fileDisplay.js";
export { playTaskNotificationSound } from "./lib/taskNotificationSound.js";
export {
  applyUiFontSizePx,
  loadUiFontSizePx,
  subscribeToUiFontSizeStorageChanges,
} from "./lib/uiFontSize.js";
export { reportUiLaunchToInput } from "./lib/uiPerfArmsTelemetry.js";
export {
  RendererUserActionTelemetry,
  runUserAction,
  runUserActionAsync,
  setUserActionTelemetry,
  startUserAction,
} from "./lib/userActionTelemetry.js";
export {
  CORE_USER_ACTION_FEATURES,
  SETTINGS_USER_ACTION_FEATURES,
  USER_ACTION_CATALOG,
} from "./lib/userActionTraceCatalog.js";
export { setReactErrorArmsReporter } from "./lib/reactErrorArmsTelemetry.js";
export { recordArmsCustomEventForE2E } from "./lib/armsCustomEventObservability.js";
export { generateMobileDeviceFingerprint, setStreamClientId } from "./lib/streamClientId.js";
export { GlobalDatabaseStartupLoading } from "./root/GlobalDatabaseStartupLoading.js";

export { LocalTtftObserver, setLocalTtftObserver } from "@/v4/telemetry/localTtftObserver.js";
