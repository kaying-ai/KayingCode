import { Gamepad2Icon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import {
  TAPTAP_PREVIEW_WEBVIEW_PARTITION,
  type BrowserViewScreenshotSurfacePreparePayload,
  toTapTapGamePreviewUrl,
  type TapTapPreviewPublicationV1,
} from "@zcode/shared";
import { UnifiedBrowserView } from "@/browser-use/UnifiedBrowserView.js";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { TabsContent } from "@/components/ui/tabs.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { useTapTapPreviewPublication } from "@/hooks/useTapTapPreviewPublication.js";
import { useTapTapPreviewRouteRepair } from "@/hooks/useTapTapPreviewRouteRepair.js";
import type { TapTapPreviewSidePaneTab } from "@/lib/workspaceSidePane.js";

export function TapTapPreviewSidePaneContent({
  isPanelVisible,
  isSelected,
  screenshotSurfaceRequest,
  tab,
}: {
  isPanelVisible: boolean;
  isSelected: boolean;
  screenshotSurfaceRequest: BrowserViewScreenshotSurfacePreparePayload | null;
  tab: TapTapPreviewSidePaneTab;
}): React.JSX.Element {
  const { intl } = useKayingCodeIntl();
  const { error, isLoading, publication, refresh } = useTapTapPreviewPublication({
    workspaceKey: tab.workspaceKey,
    workspacePath: tab.workspacePath,
  });
  // 修复依据：TapTap tab 复用 browser screenshot coordinator，但此前只有 browser-use
  // 能进入临时合成层，prepare 因而永远没有 ready 回执并固定在 3 秒超时。
  const screenshotSurfaceStyle: CSSProperties | undefined = screenshotSurfaceRequest
    ? {
        position: "fixed",
        left: 0,
        top: 0,
        width: `${screenshotSurfaceRequest.viewport.width}px`,
        height: `${screenshotSurfaceRequest.viewport.height + 80}px`,
        maxWidth: screenshotSurfaceRequest.surfaceScaleMode === "unscaled" ? undefined : "100vw",
        maxHeight: screenshotSurfaceRequest.surfaceScaleMode === "unscaled" ? undefined : "100vh",
        pointerEvents: "none",
        opacity: 0.001,
      }
    : undefined;

  return (
    <TabsContent
      value={tab.id}
      forceMount
      aria-hidden={!isSelected}
      inert={!isSelected ? true : undefined}
      data-browser-screenshot-surface-state={screenshotSurfaceRequest ? "preparing" : undefined}
      className={cn(
        "h-full min-h-0 bg-background",
        isSelected
          ? "relative z-10 flex"
          : screenshotSurfaceRequest
            ? "pointer-events-none fixed z-0 flex overflow-hidden"
            : "hidden",
      )}
      style={screenshotSurfaceStyle}
    >
      {publication ? (
        <TapTapPreviewBrowser
          isPanelVisible={isPanelVisible}
          isSelected={isSelected}
          publication={publication}
          screenshotSurfaceRequest={screenshotSurfaceRequest}
          tab={tab}
        />
      ) : (
        <div className="flex h-full min-h-0 w-full items-center justify-center bg-background p-6">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            {error ? (
              <TriangleAlertIcon className="size-8 text-warning" aria-hidden="true" />
            ) : (
              <Gamepad2Icon className="size-8 text-foreground-subtle" aria-hidden="true" />
            )}
            <div className="text-ui-base font-medium text-foreground">
              {intl.formatMessage({
                id: error ? "taptapPreview.invalidReceipt" : "taptapPreview.emptyTitle",
              })}
            </div>
            <p className="text-ui-sm text-foreground-subtle">
              {intl.formatMessage({
                id: error
                  ? "taptapPreview.invalidReceiptDescription"
                  : "taptapPreview.emptyDescription",
              })}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => void refresh()}
            >
              <RefreshCwIcon className={isLoading ? "size-4 animate-spin" : "size-4"} />
              {intl.formatMessage({ id: "taptapPreview.refresh" })}
            </Button>
          </div>
        </div>
      )}
    </TabsContent>
  );
}

function TapTapPreviewBrowser({
  isPanelVisible,
  isSelected,
  publication,
  screenshotSurfaceRequest,
  tab,
}: {
  isPanelVisible: boolean;
  isSelected: boolean;
  publication: TapTapPreviewPublicationV1;
  screenshotSurfaceRequest: BrowserViewScreenshotSurfacePreparePayload | null;
  tab: TapTapPreviewSidePaneTab;
}): React.JSX.Element {
  const displayUrl = useMemo(
    () => toTapTapGamePreviewUrl(publication.previewUrl),
    [publication.previewUrl],
  );
  const { handleGuestNavigation, repairSequence } = useTapTapPreviewRouteRepair({
    desiredUrl: displayUrl,
    publicationOperationId: publication.operationId,
  });

  return (
    <UnifiedBrowserView
      browserKey={tab.tabId}
      isVisible={isPanelVisible && isSelected}
      isSelected={isSelected}
      isCurrentTask
      screenshotSurfaceRequest={screenshotSurfaceRequest}
      initialUrl={displayUrl}
      navigationRequest={{
        id: `${publication.operationId}:preview:${repairSequence}`,
        url: displayUrl,
      }}
      onGuestNavigation={handleGuestNavigation}
      onNavigationRequestHandled={() => undefined}
      workspacePath={tab.workspacePath}
      workspaceIdentity={tab.workspaceIdentity}
      workspaceKey={tab.workspaceKey}
      remoteSessionId={tab.remoteSessionId ?? undefined}
      sessionId={tab.sessionId}
      webviewPartition={TAPTAP_PREVIEW_WEBVIEW_PARTITION}
    />
  );
}
