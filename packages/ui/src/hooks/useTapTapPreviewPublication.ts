import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseTapTapPreviewPublicationV1,
  TAPTAP_PREVIEW_RECEIPT_RELATIVE_PATH,
  type TapTapPreviewPublicationV1,
} from "@zcode/shared";
import type { IDisposable } from "@zcode/rpc";
import { joinFilePath } from "@/lib/path.js";
import { logger } from "@/logger.js";
import { useServices } from "@/hooks/useServices.js";

export function useTapTapPreviewPublication(input: {
  workspaceKey: string;
  workspacePath: string;
  enabled?: boolean;
}) {
  const { fileService, fileWatcherService } = useServices();
  const enabled = input.enabled !== false;
  const scope = JSON.stringify([input.workspaceKey, input.workspacePath]);
  const [state, setState] = useState<{
    scope: string;
    publication: TapTapPreviewPublicationV1 | null;
    error: string | null;
    isLoading: boolean;
  }>({ scope, publication: null, error: null, isLoading: true });
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let watcherId: string | null = null;
    let subscription: IDisposable | null = null;
    let refreshing = false;
    let queued = false;
    const receiptPath = joinFilePath(input.workspacePath, TAPTAP_PREVIEW_RECEIPT_RELATIVE_PATH);
    const read = async (): Promise<void> => {
      if (cancelled) return;
      if (refreshing) {
        queued = true;
        return;
      }
      refreshing = true;
      try {
        do {
          queued = false;
          try {
            const slice = await fileService.readTextFile({ path: receiptPath, length: 64 * 1024 });
            if (cancelled) return;
            if (slice.isBinary || slice.truncated)
              throw new Error("TapTap preview receipt is not a bounded text document");
            const next = parseTapTapPreviewPublicationV1(JSON.parse(slice.content) as unknown);
            if (next.workspaceKey !== input.workspaceKey)
              throw new Error("TapTap preview receipt belongs to a different workspace identity");
            setState({ scope, publication: next, error: null, isLoading: false });
          } catch (cause) {
            if (cancelled) return;
            const message = cause instanceof Error ? cause.message : String(cause);
            const missing = /ENOENT|not found|does not exist/iu.test(message);
            setState({
              scope,
              publication: null,
              error: missing ? null : message,
              isLoading: false,
            });
          }
        } while (queued && !cancelled);
      } finally {
        refreshing = false;
      }
    };
    refreshRef.current = read;
    void read();
    void fileWatcherService
      .watch({ path: input.workspacePath, recursive: true })
      .then(({ id }) => {
        if (cancelled) return void fileWatcherService.unwatch({ id });
        watcherId = id;
        // 修复依据：首轮发布会新建嵌套 .maker 目录；根目录非递归监听可能漏掉首次回执及后续原子替换。
        subscription = fileWatcherService.onDynamicChange(id)(() => void read());
        // 订阅成功后补读，覆盖初始 read 与 watcher 就绪之间发生的提交，不用延时猜测。
        void read();
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        logger.warn("[TapTapPreview] 无法监视发布回执", {
          error: cause instanceof Error ? cause.message : String(cause),
          workspaceKey: input.workspaceKey,
        });
      });
    return () => {
      // 工作区切换与卸载后，旧读取不得向新工作区投影，也不能触发自动展开。
      cancelled = true;
      refreshRef.current = async () => {};
      subscription?.dispose();
      if (watcherId) void fileWatcherService.unwatch({ id: watcherId });
    };
  }, [enabled, fileService, fileWatcherService, input.workspaceKey, input.workspacePath, scope]);

  const current = enabled && state.scope === scope;
  return {
    error: current ? state.error : null,
    isLoading: current ? state.isLoading : enabled,
    publication: current ? state.publication : null,
    refresh,
  };
}
