import { useCallback, useEffect, useMemo, useState } from "react";
import type { IDisposable } from "@zcode/rpc";
import {
  parsePluginBrowserComparePublicationV1,
  type PluginBrowserComparePublicationV1,
} from "@zcode/shared";
import { useServices } from "@/hooks/useServices.js";
import { joinFilePath } from "@/lib/path.js";
import type { PluginBrowserCompareSidePaneTab } from "@/lib/workspaceSidePane.js";
import { logger } from "@/logger.js";

const MAX_RECEIPT_BYTES = 64 * 1024;

export function usePluginBrowserComparePublication(tab: PluginBrowserCompareSidePaneTab) {
  const { fileService, fileWatcherService } = useServices();
  const [publication, setPublication] = useState<PluginBrowserComparePublicationV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const receiptPath = useMemo(
    () => joinFilePath(tab.workspacePath, tab.contribution.publicationFile),
    [tab.contribution.publicationFile, tab.workspacePath],
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const slice = await fileService.readTextFile({
        path: receiptPath,
        length: MAX_RECEIPT_BYTES,
      });
      if (slice.isBinary || slice.truncated) {
        throw new Error("Browser compare receipt is not a bounded text document");
      }
      const next = parsePluginBrowserComparePublicationV1(JSON.parse(slice.content) as unknown);
      if (next.workspaceKey !== tab.workspaceKey) {
        throw new Error("Browser compare receipt belongs to a different workspace identity");
      }
      if (next.sessionId !== tab.sessionId) {
        throw new Error("Browser compare receipt belongs to a different task session");
      }
      if (next.pluginId !== tab.pluginId || next.contributionId !== tab.contribution.id) {
        throw new Error("Browser compare receipt does not match the panel contribution");
      }
      setPublication(next);
      setError(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/ENOENT|not found|does not exist/iu.test(message)) {
        setPublication(null);
        setError(null);
      } else {
        setPublication(null);
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    fileService,
    receiptPath,
    tab.contribution.id,
    tab.pluginId,
    tab.sessionId,
    tab.workspaceKey,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    let watcherId: string | null = null;
    let subscription: IDisposable | null = null;
    void fileWatcherService
      .watch({ path: tab.workspacePath })
      .then(({ id }) => {
        if (cancelled) return void fileWatcherService.unwatch({ id });
        watcherId = id;
        subscription = fileWatcherService.onDynamicChange(id)(() => void refresh());
      })
      .catch((cause: unknown) => {
        logger.warn("[PluginBrowserCompare] 无法监视工作区比较回执", {
          error: cause instanceof Error ? cause.message : String(cause),
          pluginId: tab.pluginId,
          workspaceKey: tab.workspaceKey,
        });
      });
    return () => {
      cancelled = true;
      subscription?.dispose();
      if (watcherId) void fileWatcherService.unwatch({ id: watcherId });
    };
  }, [fileWatcherService, refresh, tab.pluginId, tab.workspaceKey, tab.workspacePath]);

  return { error, isLoading, publication, refresh };
}
