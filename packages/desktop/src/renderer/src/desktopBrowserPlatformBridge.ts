import type { IPlatformService } from "@zcode/shared";

type DesktopBrowserPlatformBridge = Pick<
  IPlatformService,
  | "onBrowserViewDownloadStarted"
  | "onBrowserViewReady"
  | "onBrowserViewOperation"
  | "onBrowserViewViewportChanged"
  | "onBrowserViewVisibility"
  | "onBrowserViewCloseTab"
  | "onBrowserViewSuspend"
  | "onBrowserViewRestore"
  | "browserViewLoadUrl"
  | "browserViewAttachGuest"
  | "browserViewDetachGuest"
  | "browserViewCloseTab"
  | "browserViewReportResidency"
  | "browserViewSuspendReady"
  | "browserViewEnsureResident"
  | "browserViewRestoreTabs"
  | "browserViewUpdateViewport"
  | "importChromeBrowserData"
  | "clearEmbeddedBrowserData"
  | "getPathForFile"
  | "saveFile"
  | "printPageToPdf"
  | "microphone"
>;

// Rebase 集成：browser bridge 若继续内联在 renderer 入口，会让入口越过 max-lines 门禁。
// 独立对象只做 preload 委托与旧 bridge 兼容兜底，不持有 Browser 业务状态。
//
// 语音输入：三个 preload 方法已由 packages/client 的 window.kayingcode 声明维护；
// 任一个缺失即视为旧 preload，microphone 保持 undefined，UI 隐藏语音输入入口。
const microphoneBridge = window.kayingcode;

export const desktopBrowserPlatformBridge = {
  getPathForFile: (file) =>
    file instanceof File ? (window.kayingcode?.getPathForFile?.(file) ?? null) : null,
  saveFile: (payload) =>
    window.kayingcode?.saveFile?.(payload) ??
    Promise.resolve({ success: false, error: "not_supported" }),
  // 条件定义而非兜底返回失败：UI 靠方法是否存在做能力检测，旧 preload 下必须保持 undefined
  printPageToPdf: window.kayingcode?.printPageToPdf
    ? () => window.kayingcode?.printPageToPdf!()
    : undefined,
  // 与 printPageToPdf 一样按 preload 是否提供决定能力是否存在，UI 据此决定是否显示语音输入。
  microphone:
    microphoneBridge.ensureMicrophoneAccess &&
    microphoneBridge.resetMicrophoneAccess &&
    microphoneBridge.openMicrophoneSettings
      ? {
          ensureAccess: () => microphoneBridge.ensureMicrophoneAccess!(),
          resetAccess: () => microphoneBridge.resetMicrophoneAccess!(),
          openSettings: (target) => microphoneBridge.openMicrophoneSettings!(target),
        }
      : undefined,
  onBrowserViewDownloadStarted: (handler) =>
    window.kayingcode.onBrowserViewDownloadStarted?.(handler) ?? (() => {}),
  onBrowserViewReady: (handler) => window.kayingcode?.onBrowserViewReady?.(handler) ?? (() => {}),
  onBrowserViewOperation: (handler) =>
    window.kayingcode?.onBrowserViewOperation?.(handler) ?? (() => {}),
  onBrowserViewViewportChanged: (handler) =>
    window.kayingcode?.onBrowserViewViewportChanged?.(handler) ?? (() => {}),
  onBrowserViewVisibility: (handler) =>
    window.kayingcode?.onBrowserViewVisibility?.(handler) ?? (() => {}),
  onBrowserViewCloseTab: (handler) =>
    window.kayingcode?.onBrowserViewCloseTab?.(handler) ?? (() => {}),
  onBrowserViewSuspend: (handler) =>
    window.kayingcode?.onBrowserViewSuspend?.(handler) ?? (() => {}),
  onBrowserViewRestore: (handler) =>
    window.kayingcode?.onBrowserViewRestore?.(handler) ?? (() => {}),
  browserViewLoadUrl: (payload) => window.kayingcode.browserViewLoadUrl!(payload),
  browserViewAttachGuest: (payload) =>
    window.kayingcode?.browserViewAttachGuest?.(payload) ??
    Promise.resolve({ ok: false, reason: "not-found", recoveryRequested: false }),
  browserViewDetachGuest: (payload) =>
    window.kayingcode?.browserViewDetachGuest?.(payload) ?? Promise.resolve(false),
  browserViewCloseTab: (payload) =>
    window.kayingcode?.browserViewCloseTab?.(payload) ?? Promise.resolve(),
  browserViewReportResidency: (payload) =>
    window.kayingcode?.browserViewReportResidency?.(payload) ?? Promise.resolve(),
  browserViewSuspendReady: (payload) =>
    window.kayingcode?.browserViewSuspendReady?.(payload) ?? Promise.resolve(),
  browserViewEnsureResident: (payload) =>
    window.kayingcode?.browserViewEnsureResident?.(payload) ?? Promise.resolve(),
  browserViewRestoreTabs: (payload) =>
    window.kayingcode?.browserViewRestoreTabs?.(payload) ?? Promise.resolve([]),
  browserViewUpdateViewport: (payload) =>
    window.kayingcode?.browserViewUpdateViewport?.(payload) ?? Promise.resolve(),
  importChromeBrowserData: (options) =>
    window.kayingcode?.importChromeBrowserData?.(options) ??
    Promise.resolve({
      success: false,
      cookies: { imported: 0, skipped: 0, failed: 0 },
      localStorage: {
        originsImported: 0,
        entriesImported: 0,
        originsSkipped: 0,
        originsFailed: 0,
      },
      error: "chrome_import_not_supported",
    }),
  clearEmbeddedBrowserData: (mode, target) =>
    window.kayingcode?.clearEmbeddedBrowserData?.(mode, target) ??
    Promise.resolve({ success: false, error: "unsupported" }),
} satisfies DesktopBrowserPlatformBridge;
