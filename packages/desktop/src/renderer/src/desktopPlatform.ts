import { recordArmsCustomEventForE2E } from "@zcode/ui";
import {
  DesktopCommandIds,
  buildLocalMediaPreviewUrl,
  unwrapRemoteWorkspaceBindResult,
  type IPlatformService,
} from "@zcode/shared";

import { desktopBrowserPlatformBridge } from "./desktopBrowserPlatformBridge.js";
import { createDesktopPluginSandboxPlatform } from "./plugin-sandbox/desktopPluginSandboxPlatform.js";

export function createDesktopPlatform(options: {
  isLocalDevelopmentRuntime: boolean;
}): IPlatformService {
  return {
    canSelectFilePath: true,
    canOpenLocalFiles: true,
    pluginSandbox: createDesktopPluginSandboxPlatform(),
    createLocalMediaPreviewUrl: buildLocalMediaPreviewUrl,
    isLocalDevelopmentRuntime: options.isLocalDevelopmentRuntime,
    selectDirectory: () => window.kayingcode.selectDirectory(),
    selectDirectories: () => window.kayingcode.selectDirectories(),
    selectFile: () => window.kayingcode.selectFile(),
    selectFiles: () => window.kayingcode.selectFiles?.() ?? Promise.resolve([]),
    createTempTextAttachment: (payload) => window.kayingcode.createTempTextAttachment(payload),
    materializeWorkflowArtifactFile: (payload) =>
      window.kayingcode.materializeWorkflowArtifactFile(payload),
    onRemoteConnectionLog: (handler) => window.kayingcode.onRemoteConnectionLog(handler),
    onRemoteSessionClosed: (handler) => window.kayingcode.onRemoteSessionClosed(handler),
    // Source 自动重连会替换 logical session；统一由 preload bridge 转发换代事件。
    // 该 bridge 已由 preload 暴露，但 @zcode/shared 的 IPlatformService 尚未声明（WS1 待补），
    // 这里用窄结构断言读取，避免把缺失声明扩散成 any。
    onRemoteSessionReconnected: (handler) =>
      (
        window.kayingcode as {
          onRemoteSessionReconnected?: (callback: typeof handler) => () => void;
        }
      ).onRemoteSessionReconnected?.(handler) ?? (() => {}),
    activateOrSetWorkspace: (path) =>
      window.kayingcode.activateOrSetWorkspace?.(path) ?? Promise.resolve({ activated: false }),
    connectRemote: (remoteOptions, requestId, context) =>
      window.kayingcode.connectRemote(remoteOptions, requestId, context),
    connectRemoteAgent: (remoteOptions, requestId, context) =>
      window.kayingcode.connectRemoteAgent(remoteOptions, requestId, context),
    requestSourceSettingsAttachment: (sourceServerId) =>
      window.kayingcode.requestSourceSettingsAttachment?.(sourceServerId) ??
      Promise.reject(new Error("Source settings attachment bridge unavailable")),
    cancelPendingRemoteConnection: (requestId) =>
      window.kayingcode.cancelPendingRemoteConnection?.(requestId) ?? Promise.resolve(),
    bindRemoteWorkspaceSessionContext: async (context) => {
      if (!window.kayingcode.bindRemoteWorkspaceSessionContext) {
        throw new Error("bindRemoteWorkspaceSessionContext is unavailable");
      }
      // preload 返回结构化结果，在页面一侧还原错误才能保留 code/retryable。
      return unwrapRemoteWorkspaceBindResult(
        await window.kayingcode.bindRemoteWorkspaceSessionContext(context),
      );
    },
    startWebRemoteControl: (context) => window.kayingcode.startWebRemoteControl(context),
    stopWebRemoteControl: () => window.kayingcode.stopWebRemoteControl(),
    getWebRemoteControlStatus: () => window.kayingcode.getWebRemoteControlStatus(),
    onWebRemoteControlStatusChanged: (handler) =>
      window.kayingcode.onWebRemoteControlStatusChanged?.(handler) ?? (() => {}),
    disposeRemoteSession: (sessionId) => window.kayingcode.disposeRemoteSession(sessionId),
    isDockerAvailable: () => window.kayingcode.isDockerAvailable(),
    listWSLDistros: () => window.kayingcode.listWSLDistros(),
    listDockerContainers: () => window.kayingcode.listDockerContainers(),
    listSSHConfigAliases: () => window.kayingcode.listSSHConfigAliases(),
    loadMcpFromUserDirectory: (payload) => window.kayingcode.loadMcpFromUserDirectory(payload),
    saveMcpToUserDirectory: (payload) => window.kayingcode.saveMcpToUserDirectory(payload),
    migrateLegacyCommonMcp: (payload) => window.kayingcode.migrateLegacyCommonMcp(payload),
    openExternal: (url) => window.kayingcode.openExternal(url),
    openFeedback: () => window.kayingcode.executeDesktopCommand(DesktopCommandIds.OpenFeedback),
    openCommunity: () => window.kayingcode.executeDesktopCommand(DesktopCommandIds.OpenCommunity),
    canOpenCommunity: (locale) => window.kayingcode.canOpenCommunity(locale),
    openInFileManager: (path) => window.kayingcode.openInFileManager(path),
    openExternalFile: (path) => window.kayingcode.openExternalFile(path),
    notifyWebRemoteControlAuthStateChanged: (change) =>
      window.kayingcode.notifyWebRemoteControlAuthStateChanged(change),
    registerOAuthState: (payload) => window.kayingcode.registerOAuthState(payload),
    onOAuthCallback: (callback) => window.kayingcode.onOAuthCallback(callback),
    notifyRendererReady: () => window.kayingcode.notifyRendererReady(),
    syncTelemetryContext: (context) => window.kayingcode.syncTelemetryContext(context),
    reportTelemetryEvent: (payload) => window.kayingcode.reportTelemetryEvent(payload),
    reportArmsCustomEvent: (payload) => {
      recordArmsCustomEventForE2E(payload);
      return window.kayingcode.reportArmsCustomEvent(payload);
    },
    getRendererActionTraceConfig: window.kayingcode.getRendererActionTraceConfig
      ? () => window.kayingcode.getRendererActionTraceConfig!()
      : undefined,
    onRendererActionTraceConfigChanged: window.kayingcode.onRendererActionTraceConfigChanged
      ? (callback) => window.kayingcode.onRendererActionTraceConfigChanged!(callback)
      : undefined,
    reportLocalTtftBatch: (batch) => window.kayingcode.reportLocalTtftBatch(batch),
    reportRendererActionTraceBatch: window.kayingcode.reportRendererActionTraceBatch
      ? (batch) => window.kayingcode.reportRendererActionTraceBatch!(batch)
      : undefined,
    reportRendererHeapSample: window.kayingcode.reportRendererHeapSample
      ? (sample) => window.kayingcode.reportRendererHeapSample!(sample)
      : undefined,
    showTaskNotification: (payload) => window.kayingcode.showTaskNotification(payload),
    syncWindowTabs: (paths) => window.kayingcode.syncWindowTabs(paths),
    syncWebRemoteControlWorkspaces: (workspaces) =>
      window.kayingcode.syncWebRemoteControlWorkspaces?.(workspaces),
    onWebRemoteControlReconnectWorkspace: (handler) =>
      window.kayingcode.onWebRemoteControlReconnectWorkspace?.(handler) ?? (() => {}),
    onWebRemoteControlRendererAction: (handler) =>
      window.kayingcode.onWebRemoteControlRendererAction?.(handler) ?? (() => {}),
    syncWindowUnreadCount: (count) => window.kayingcode.syncWindowUnreadCount(count),
    syncAppSettings: (patch) => window.kayingcode.syncAppSettings?.(patch),
    // 桥缺失（旧 preload 升级窗口）时按 supported 兜底，与 Windows 现状一致，设置开关可用。
    getCloseToTrayCapability: () =>
      window.kayingcode.getCloseToTrayCapability?.() ??
      Promise.resolve({ supported: true, gnomeLikeWithoutTray: false }),
    setShortcutRecordingActive: (active) => window.kayingcode.setShortcutRecordingActive?.(active),
    onFocusTab: (handler) => window.kayingcode.onFocusTab(handler),
    onNewTab: (handler) => window.kayingcode.onNewTab(handler),
    onCloseActiveContextRequest: (handler) =>
      window.kayingcode.onCloseActiveContextRequest?.(handler) ?? (() => {}),
    onOpenBrowserUrl: (handler) => window.kayingcode.onOpenBrowserUrl?.(handler) ?? (() => {}),
    onEmbeddedBrowserPermissionPrompt: (handler) =>
      window.kayingcode.onEmbeddedBrowserPermissionPrompt?.(handler) ?? (() => {}),
    resolveEmbeddedBrowserPermissionPrompt: (request) =>
      window.kayingcode.resolveEmbeddedBrowserPermissionPrompt?.(request),
    getEmbeddedBrowserSitePermissions: () =>
      window.kayingcode.getEmbeddedBrowserSitePermissions?.() ?? Promise.resolve({}),
    setEmbeddedBrowserSitePermission: (request) =>
      window.kayingcode.setEmbeddedBrowserSitePermission?.(request) ?? Promise.resolve({}),
    clearEmbeddedBrowserSitePermissions: () =>
      window.kayingcode.clearEmbeddedBrowserSitePermissions?.() ?? Promise.resolve({}),
    resetEmbeddedBrowserSitePermission: (request) =>
      window.kayingcode.resetEmbeddedBrowserSitePermission?.(request) ?? Promise.resolve({}),
    onBrowserViewScreenshotSurfacePrepare: (handler) =>
      window.kayingcode.onBrowserViewScreenshotSurfacePrepare?.(handler) ?? (() => {}),
    onBrowserViewScreenshotSurfaceRelease: (handler) =>
      window.kayingcode.onBrowserViewScreenshotSurfaceRelease?.(handler) ?? (() => {}),
    browserViewScreenshotSurfaceReady: (payload) =>
      window.kayingcode.browserViewScreenshotSurfaceReady?.(payload),
    ...desktopBrowserPlatformBridge,
    onNewTask: (handler) => window.kayingcode.onNewTask(handler),
    onOpenWorkspace: (handler) => {
      // 开发态或升级后的旧窗口可能仍运行未暴露 onOpenWorkspace 的 preload，
      // renderer 直接调用会在启动时崩溃。这里和 activateOrSetWorkspace 一样做兼容兜底，
      // 缺少该 bridge 时只禁用原生菜单回调，不影响应用继续打开。
      return window.kayingcode.onOpenWorkspace?.(handler) ?? (() => {});
    },
    onOpenWorkspacePath: (handler) =>
      window.kayingcode.onOpenWorkspacePath?.(handler) ?? (() => {}),
    onOpenFeedbackDialog: (handler) =>
      window.kayingcode.onOpenFeedbackDialog?.(handler) ?? (() => {}),
    onOpenTicketsPanel: (handler) => window.kayingcode.onOpenTicketsPanel?.(handler) ?? (() => {}),
    onWindowFullscreenChanged: (handler) => window.kayingcode.onWindowFullscreenChanged(handler),
    getDesktopWindowChromeState: window.kayingcode.getDesktopWindowChromeState
      ? () => window.kayingcode.getDesktopWindowChromeState!()
      : undefined,
    onDesktopWindowChromeStateChanged: window.kayingcode.onDesktopWindowChromeStateChanged
      ? (handler) => window.kayingcode.onDesktopWindowChromeStateChanged!(handler)
      : undefined,
    getWindowControlsOverlayMetrics: () =>
      window.kayingcode.getWindowControlsOverlayMetrics?.() ?? null,
    onWindowControlsOverlayChanged: (handler) =>
      window.kayingcode.onWindowControlsOverlayChanged?.(handler) ?? (() => {}),
    getDesktopZoomLevel: () =>
      window.kayingcode.getDesktopZoomLevel?.() ?? Promise.resolve({ zoomLevel: 0 }),
    onDesktopZoomLevelChanged: (handler) =>
      window.kayingcode.onDesktopZoomLevelChanged?.(handler) ?? (() => {}),
    onTaskNotificationClick: (handler) => window.kayingcode.onTaskNotificationClick(handler),
    exportLogs: () => window.kayingcode.exportLogs(),
    captureWindowScreenshot: () =>
      window.kayingcode.captureWindowScreenshot?.() ?? Promise.resolve(null),
    onUpdateReady: (callback) => window.kayingcode.onUpdateReady(callback),
    onUpdateCheckResult: (callback) => window.kayingcode.onUpdateCheckResult(callback),
    onUpdateStateChanged: (callback) =>
      window.kayingcode.onUpdateStateChanged?.(callback) ?? (() => {}),
    getUpdateState: () =>
      window.kayingcode.getUpdateState?.() ?? Promise.resolve({ kind: "idle", enabled: true }),
    downloadUpdate: () => window.kayingcode.downloadUpdate?.() ?? Promise.resolve(),
    cancelUpdateDownload: () => window.kayingcode.cancelUpdateDownload?.() ?? Promise.resolve(),
    openUpdateStatusWindow: () => window.kayingcode.openUpdateStatusWindow?.() ?? Promise.resolve(),
    getAutoUpdatePreferences: () =>
      window.kayingcode.getAutoUpdatePreferences?.() ??
      Promise.resolve({ autoDownloadAndInstallUpdates: false }),
    setAutoDownloadAndInstallUpdates: (enabled) =>
      window.kayingcode.setAutoDownloadAndInstallUpdates?.(enabled) ?? Promise.resolve(),
    getDesktopSessionActivity: () =>
      window.kayingcode.getDesktopSessionActivity?.() ??
      Promise.resolve({ runningAgentSessionCount: 0 }),
    getKayingCodeStdioTapDevState: () =>
      window.kayingcode.getKayingCodeStdioTapDevState?.() ??
      Promise.resolve({ enabled: false, visible: false, logDir: "", statePath: "" }),
    onSettingsChanged: (callback) => window.kayingcode.onSettingsChanged?.(callback) ?? (() => {}),
    onApplicationLocaleChanged: (callback) =>
      window.kayingcode.onApplicationLocaleChanged?.(callback) ?? (() => {}),
    onPostUpdateReleaseNotes: (callback) => window.kayingcode.onPostUpdateReleaseNotes(callback),
    acknowledgePostUpdateReleaseNotes: (version) =>
      window.kayingcode.acknowledgePostUpdateReleaseNotes(version),
    skipUpdateVersion: (version) =>
      window.kayingcode.skipUpdateVersion?.(version) ?? Promise.resolve(),
    quitAndInstallUpdate: () => window.kayingcode.quitAndInstallUpdate(),
    getInstalledEditors: (filePath) => window.kayingcode.getInstalledEditors(filePath),
    getFileApplications: (target) => window.kayingcode.getFileApplications(target),
    openFileWithApplication: (applicationId, target) =>
      window.kayingcode.openFileWithApplication(applicationId, target),
    getApplicationIcon: (bundleId) =>
      window.kayingcode.getApplicationIcon?.(bundleId) ?? Promise.resolve(null),
    openInEditor: (editorId, path, editorOptions) =>
      window.kayingcode.openInEditor(editorId, path, editorOptions),
    executeDesktopCommand: (command) => window.kayingcode.executeDesktopCommand(command),
    setApplicationLocale: (locale) => window.kayingcode.setApplicationLocale(locale),
    getSystemLocale: () =>
      window.kayingcode.getSystemLocale?.() ??
      Promise.resolve(navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US"),
    setTitleBarTheme: (theme) => window.kayingcode.setTitleBarTheme(theme),
    getDeviceId: () =>
      (window as Window & { __KAYINGCODE_DEVICE_ID__?: string }).__KAYINGCODE_DEVICE_ID__ ?? "",
  };
}
