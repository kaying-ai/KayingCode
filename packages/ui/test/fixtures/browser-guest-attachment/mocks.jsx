import React, { useCallback, useRef } from "react";

export const usePlatform = () => window.attachmentTest.platform;
export const logger = { debug() {}, warn() {}, info() {}, error() {} };
export const useKayingCodeIntl = () => ({ intl: { formatMessage: ({ id }) => id } });
export const useDesktopZoomFactor = () => 1;
export const useBrowserScreenshotSurfaceReady = () => {};
export const useEmbeddedBrowserWheelChain = () => {};
export const useWebElementPicker = () => ({
  cancelPicking: async () => {},
  isPicking: false,
  togglePicking: async () => {},
});
export function useBrowserResizeOperationWarning() {
  return {
    browserRegionRef: useRef(null),
    notifyBrowserViewportResize() {},
    prepareForAgentViewportChange() {},
    showResizeWarning: false,
  };
}
export const BrowserToolbar = ({ onToggleResponsiveMode }) => (
  <button data-testid="toggle-viewport" onClick={onToggleResponsiveMode}>
    响应式
  </button>
);
export const BrowserViewportToolbar = () => null;
export const DEFAULT_RESPONSIVE_BROWSER_VIEWPORT_SIZE = { width: 1280, height: 720 };
export function BrowserViewportSurface({ onWebviewRef, webviewGeneration }) {
  const ref = useCallback(
    (node) => {
      if (node && !window.attachmentTest.realGuest) {
        const id = ++window.attachmentTest.guestId;
        node.getWebContentsId = () => id;
        node.setZoomFactor = () => {};
        node.getURL = () => "about:blank";
        node.getTitle = () => "";
        node.canGoBack = () => false;
        node.canGoForward = () => false;
        node.loadURL = async (url) => {
          window.attachmentTest.calls.push({ kind: "navigate", url, guestId: id });
        };
      }
      onWebviewRef(node);
    },
    [onWebviewRef],
  );
  return (
    <webview
      key={webviewGeneration}
      ref={ref}
      src={window.attachmentTest.realGuest ? "about:blank" : undefined}
      style={{ width: "100%", height: "600px" }}
    />
  );
}
