import { Columns2Icon, LoaderCircleIcon, RefreshCwIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type {
  BrowserViewScreenshotSurfacePreparePayload,
  PluginBrowserComparePublicationV1,
} from "@zcode/shared";
import { UnifiedBrowserView } from "@/browser-use/UnifiedBrowserView.js";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable.js";
import { TabsContent } from "@/components/ui/tabs.js";
import { toast } from "@/components/ui/toast.js";
import { usePluginBrowserComparePublication } from "@/hooks/usePluginBrowserComparePublication.js";
import { useTapTapPreviewPublication } from "@/hooks/useTapTapPreviewPublication.js";
import { useTapTapPreviewRouteRepair } from "@/hooks/useTapTapPreviewRouteRepair.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { CompareBrowserUrlBar } from "@/plugin-browser-compare/CompareBrowserUrlBar.js";
import { resolvePluginBrowserCompareViewportPreference } from "@/plugin-browser-compare/pluginBrowserCompareViewport.js";
import { resolvePluginBrowserCompareTargetPublication } from "@/plugin-browser-compare/pluginBrowserCompareTargetPublication.js";
import {
  getPluginBrowserCompareNavigationRequestId,
  getPluginBrowserCompareTabGroup,
  PLUGIN_BROWSER_COMPARE_LAYOUT_PANEL_IDS,
  type PluginBrowserCompareSidePaneTab,
} from "@/lib/workspaceSidePane.js";

export function PluginBrowserCompareSidePaneContent({
  isPanelVisible,
  isSelected,
  screenshotSurfaceRequest,
  tab,
}: {
  isPanelVisible: boolean;
  isSelected: boolean;
  screenshotSurfaceRequest: BrowserViewScreenshotSurfacePreparePayload | null;
  tab: PluginBrowserCompareSidePaneTab;
}): React.JSX.Element {
  const { intl } = useKayingCodeIntl();
  const platform = usePlatform();
  const { error, isLoading, publication, refresh } = usePluginBrowserComparePublication(tab);
  const { publication: latestTapTapPublication } = useTapTapPreviewPublication({
    workspaceKey: tab.workspaceKey,
    workspacePath: tab.workspacePath,
  });
  const displayedPublication = useMemo(
    () =>
      publication
        ? resolvePluginBrowserCompareTargetPublication(publication, latestTapTapPublication)
        : null,
    [latestTapTapPublication, publication],
  );
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [clearingCache, setClearingCache] = useState(false);
  const handleClearPreviewCache = useCallback(() => {
    if (!platform.clearEmbeddedBrowserData || clearingCache) return;
    setClearingCache(true);
    void platform
      .clearEmbeddedBrowserData("cache", "all")
      .then((result) => {
        toast(
          intl.formatMessage({
            id: result.success
              ? "pluginBrowserCompare.clearCacheSuccess"
              : "pluginBrowserCompare.clearCacheFailed",
          }),
        );
        if (result.success) {
          setRefreshNonce((value) => value + 1);
        }
      })
      .catch(() => {
        toast(intl.formatMessage({ id: "pluginBrowserCompare.clearCacheFailed" }));
      })
      .finally(() => setClearingCache(false));
  }, [clearingCache, intl, platform]);
  const captureRole =
    screenshotSurfaceRequest?.tabId === tab.sourceTabId
      ? "source"
      : screenshotSurfaceRequest?.tabId === tab.targetTabId
        ? "target"
        : null;
  const screenshotSurfaceStyle: CSSProperties | undefined = screenshotSurfaceRequest
    ? {
        position: "fixed",
        left: 0,
        top: 0,
        width: `${screenshotSurfaceRequest.viewport.width}px`,
        height: `${screenshotSurfaceRequest.viewport.height}px`,
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
      {displayedPublication ? (
        <div className="flex h-full min-h-0 w-full flex-col">
          {captureRole ? null : (
            <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-2">
              <span className="text-ui-sm text-foreground-subtle">
                {displayedPublication.viewport.width} × {displayedPublication.viewport.height}
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={clearingCache}
                  aria-label={intl.formatMessage({ id: "pluginBrowserCompare.clearCache" })}
                  title={intl.formatMessage({ id: "pluginBrowserCompare.clearCache" })}
                  onClick={handleClearPreviewCache}
                >
                  <Trash2Icon
                    className={cn("size-4", clearingCache && "animate-pulse")}
                  />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={intl.formatMessage({ id: "pluginBrowserCompare.refresh" })}
                  onClick={() => setRefreshNonce((value) => value + 1)}
                >
                  <RefreshCwIcon className="size-4" />
                </Button>
              </div>
            </div>
          )}
          <ResizablePanelGroup
            orientation="horizontal"
            layoutId={`plugin-browser-compare:${tab.pluginId}:${tab.contribution.id}`}
            panelIds={PLUGIN_BROWSER_COMPARE_LAYOUT_PANEL_IDS}
            className="min-h-0 min-w-[45rem] flex-1 overflow-x-auto"
          >
            <ResizablePanel
              id={PLUGIN_BROWSER_COMPARE_LAYOUT_PANEL_IDS[0]}
              defaultSize="50%"
              minSize="30%"
              maxSize="70%"
              className={cn(
                "min-w-0",
                captureRole === "target" && "hidden!",
                captureRole === "source" && "flex-1! basis-full!",
              )}
            >
              <CompareBrowser
                role="source"
                hidden={captureRole === "target"}
                captureMode={captureRole === "source"}
                isPanelVisible={isPanelVisible}
                isSelected={isSelected}
                publication={displayedPublication}
                refreshNonce={refreshNonce}
                screenshotSurfaceRequest={
                  captureRole === "source" ? screenshotSurfaceRequest : null
                }
                tab={tab}
              />
            </ResizablePanel>
            <ResizableHandle className={captureRole ? "hidden!" : undefined} />
            <ResizablePanel
              id={PLUGIN_BROWSER_COMPARE_LAYOUT_PANEL_IDS[1]}
              defaultSize="50%"
              minSize="30%"
              maxSize="70%"
              className={cn(
                "min-w-0",
                captureRole === "source" && "hidden!",
                captureRole === "target" && "flex-1! basis-full!",
              )}
            >
              <CompareBrowser
                role="target"
                hidden={captureRole === "source"}
                captureMode={captureRole === "target"}
                isPanelVisible={isPanelVisible}
                isSelected={isSelected}
                publication={displayedPublication}
                refreshNonce={refreshNonce}
                screenshotSurfaceRequest={
                  captureRole === "target" ? screenshotSurfaceRequest : null
                }
                tab={tab}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className="flex h-full min-h-0 w-full items-center justify-center p-6">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            {error ? (
              <TriangleAlertIcon className="size-8 text-warning" aria-hidden="true" />
            ) : isLoading ? (
              <LoaderCircleIcon
                className="size-8 animate-spin text-foreground-subtle"
                aria-hidden="true"
              />
            ) : (
              <Columns2Icon className="size-8 text-foreground-subtle" aria-hidden="true" />
            )}
            <div className="text-ui-base font-medium text-foreground">
              {intl.formatMessage({
                id: error
                  ? "pluginBrowserCompare.invalidReceipt"
                  : "pluginBrowserCompare.emptyTitle",
              })}
            </div>
            <p className="text-ui-sm text-foreground-subtle">
              {intl.formatMessage({
                id: error
                  ? "pluginBrowserCompare.invalidReceiptDescription"
                  : "pluginBrowserCompare.emptyDescription",
              })}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => void refresh()}
            >
              <RefreshCwIcon className={isLoading ? "size-4 animate-spin" : "size-4"} />
              {intl.formatMessage({ id: "pluginBrowserCompare.refresh" })}
            </Button>
          </div>
        </div>
      )}
    </TabsContent>
  );
}

function CompareBrowser({
  captureMode,
  hidden,
  isPanelVisible,
  isSelected,
  publication,
  refreshNonce,
  role,
  screenshotSurfaceRequest,
  tab,
}: {
  captureMode: boolean;
  hidden: boolean;
  isPanelVisible: boolean;
  isSelected: boolean;
  publication: PluginBrowserComparePublicationV1;
  refreshNonce: number;
  role: "source" | "target";
  screenshotSurfaceRequest: BrowserViewScreenshotSurfacePreparePayload | null;
  tab: PluginBrowserCompareSidePaneTab;
}): React.JSX.Element | null {
  const view = tab.contribution.views[role === "source" ? 0 : 1];
  const receiptUrl = role === "source" ? publication.sourceUrl : publication.targetUrl;
  const tabId = role === "source" ? tab.sourceTabId : tab.targetTabId;
  const [overrideUrl, setOverrideUrl] = useState<string | null>(null);
  const [localReloadNonce, setLocalReloadNonce] = useState(0);
  const [manualNavNonce, setManualNavNonce] = useState(0);
  const url = overrideUrl ?? receiptUrl;
  // 新 publication 到达时回到回执 URL，避免旧手动地址挡住当前 revision。
  useEffect(() => {
    setOverrideUrl(null);
  }, [receiptUrl]);
  const { handleGuestNavigation, repairSequence } = useTapTapPreviewRouteRepair({
    desiredUrl: receiptUrl,
    publicationOperationId: `${publication.targetPublication.operationId}:${publication.targetPublication.revision}`,
  });
  const navigationId = overrideUrl
    ? `${role}:manual:${overrideUrl}:${manualNavNonce}:${localReloadNonce}:${refreshNonce}`
    : getPluginBrowserCompareNavigationRequestId({
        publication,
        refreshNonce: refreshNonce + localReloadNonce,
        repairSequence,
        role,
      });
  const viewportPreference = resolvePluginBrowserCompareViewportPreference({
    captureMode,
    publicationViewport: publication.viewport,
    screenshotViewport: screenshotSurfaceRequest?.viewport ?? null,
  });
  return (
    <section
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden",
        hidden && "hidden!",
        captureMode ? undefined : "min-w-[22.5rem] border-r border-border last:border-r-0",
      )}
      data-browser-compare-role={role}
    >
      {captureMode ? null : (
        <CompareBrowserUrlBar
          label={view.label}
          currentUrl={url}
          isNavigating={false}
          navigateNonce={manualNavNonce + localReloadNonce + refreshNonce}
          onNavigate={(nextUrl) => {
            setOverrideUrl(nextUrl);
            setManualNavNonce((value) => value + 1);
          }}
          onReload={() => setLocalReloadNonce((value) => value + 1)}
        />
      )}
      <div className="min-h-0 flex-1">
        <UnifiedBrowserView
          browserKey={tabId}
          isVisible={isPanelVisible && isSelected && !hidden}
          isSelected={isSelected}
          isCurrentTask
          initialUrl={url}
          navigationRequest={{
            id: navigationId,
            url,
          }}
          onGuestNavigation={role === "target" ? handleGuestNavigation : undefined}
          onNavigationRequestHandled={() => undefined}
          workspacePath={tab.workspacePath}
          workspaceIdentity={tab.workspaceIdentity}
          workspaceKey={tab.workspaceKey}
          remoteSessionId={tab.remoteSessionId ?? undefined}
          sessionId={tab.sessionId}
          tabGroup={getPluginBrowserCompareTabGroup(tab)}
          screenshotSurfaceRequest={screenshotSurfaceRequest}
          controlledHumanViewportPreference={viewportPreference}
          webviewPartition={
            view.profile === "taptap-preview"
              ? "persist:kayingcode-taptap-preview"
              : "persist:kayingcode-embedded-browser"
          }
          showToolbar={false}
        />
      </div>
    </section>
  );
}
