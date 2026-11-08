import { useEffect, useRef } from "react";
import type { IDisposable } from "@zcode/rpc";
import {
  parsePluginBrowserComparePublicationV1,
  type PluginBrowserComparePublicationV1,
} from "@zcode/shared";
import { useServices } from "@/hooks/useServices.js";
import { joinFilePath } from "@/lib/path.js";
import type { PluginBrowserCompareContributionEntry } from "@/lib/workspaceSidePane.js";
import { logger } from "@/logger.js";

const MAX_RECEIPT_BYTES = 64 * 1024;

export function usePluginBrowserCompareAutoOpen(input: {
  enabled: boolean;
  contributions: PluginBrowserCompareContributionEntry[];
  workspaceKey: string;
  workspacePath: string;
  onPublication: (
    entry: PluginBrowserCompareContributionEntry,
    publication: PluginBrowserComparePublicationV1,
  ) => void;
}): void {
  const { fileService, fileWatcherService } = useServices();
  const inputRef = useRef(input);
  inputRef.current = input;
  const seenRevisionRef = useRef(new Map<string, number>());
  const contributionSignature = input.contributions
    .map(
      (entry) =>
        `${entry.pluginId}\0${entry.contribution.id}\0${entry.contribution.publicationFile}`,
    )
    .join("\u0001");

  useEffect(() => {
    if (!input.enabled || input.contributions.length === 0) return;
    let cancelled = false;
    let watcherId: string | null = null;
    let subscription: IDisposable | null = null;
    let refreshInFlight = false;
    let refreshQueued = false;

    const refresh = async (): Promise<void> => {
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }
      refreshInFlight = true;
      try {
        do {
          refreshQueued = false;
          const current = inputRef.current;
          await Promise.all(
            current.contributions.map(async (entry) => {
              try {
                const path = joinFilePath(
                  current.workspacePath,
                  entry.contribution.publicationFile,
                );
                const slice = await fileService.readTextFile({ path, length: MAX_RECEIPT_BYTES });
                if (slice.isBinary || slice.truncated) return;
                const publication = parsePluginBrowserComparePublicationV1(
                  JSON.parse(slice.content) as unknown,
                );
                if (
                  publication.workspaceKey !== current.workspaceKey ||
                  publication.pluginId !== entry.pluginId ||
                  publication.contributionId !== entry.contribution.id
                ) {
                  return;
                }
                const key = `${entry.pluginId}\0${entry.contribution.id}\0${publication.sessionId}`;
                const previousRevision = seenRevisionRef.current.get(key) ?? 0;
                if (publication.revision <= previousRevision) return;
                seenRevisionRef.current.set(key, publication.revision);
                if (!cancelled) current.onPublication(entry, publication);
              } catch (cause) {
                const message = cause instanceof Error ? cause.message : String(cause);
                if (!/ENOENT|not found|does not exist/iu.test(message)) {
                  logger.debug("[PluginBrowserCompare] 忽略无效自动打开回执", {
                    contributionId: entry.contribution.id,
                    error: message,
                    pluginId: entry.pluginId,
                  });
                }
              }
            }),
          );
        } while (refreshQueued && !cancelled);
      } finally {
        refreshInFlight = false;
      }
    };

    void refresh();
    void fileWatcherService
      .watch({ path: input.workspacePath })
      .then(({ id }) => {
        if (cancelled) return void fileWatcherService.unwatch({ id });
        watcherId = id;
        subscription = fileWatcherService.onDynamicChange(id)(() => void refresh());
      })
      .catch((cause: unknown) => {
        logger.warn("[PluginBrowserCompare] 无法监视自动打开回执", {
          error: cause instanceof Error ? cause.message : String(cause),
          workspaceKey: input.workspaceKey,
        });
      });
    return () => {
      cancelled = true;
      subscription?.dispose();
      if (watcherId) void fileWatcherService.unwatch({ id: watcherId });
    };
  }, [
    contributionSignature,
    fileService,
    fileWatcherService,
    input.enabled,
    input.workspaceKey,
    input.workspacePath,
  ]);
}
