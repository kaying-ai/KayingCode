import { useCallback, useEffect, useRef, useState } from "react";
import {
  isSameTapTapMakerApp,
  isTapTapGamePreviewView,
  shouldRestoreTapTapGamePreview,
} from "@zcode/shared";

/**
 * Maker hydration may replace `tab=preview` with its default chat route.
 * Keep the initial selection stable for a bounded window, while preserving
 * normal user navigation after the preview has settled.
 */
export function useTapTapPreviewRouteRepair({
  desiredUrl,
  publicationOperationId,
}: {
  desiredUrl: string;
  publicationOperationId: string;
}): {
  handleGuestNavigation: (currentUrl: string) => void;
  repairSequence: number;
} {
  const [repairSequence, setRepairSequence] = useState(0);
  const repairCountRef = useRef(0);
  const selectionSettledRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    repairCountRef.current = 0;
    selectionSettledRef.current = false;
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, [publicationOperationId]);

  useEffect(
    () => () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    },
    [],
  );

  const handleGuestNavigation = useCallback(
    (currentUrl: string) => {
      if (!isSameTapTapMakerApp(currentUrl, desiredUrl)) return;
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      if (isTapTapGamePreviewView(currentUrl)) {
        settleTimerRef.current = setTimeout(() => {
          selectionSettledRef.current = true;
          settleTimerRef.current = null;
        }, 1_500);
        return;
      }
      if (
        selectionSettledRef.current ||
        repairCountRef.current >= 2 ||
        !shouldRestoreTapTapGamePreview(currentUrl, desiredUrl)
      ) {
        return;
      }
      // 修复依据：Maker SPA 在 hydration 后可能把 query tab 重置为 chat；
      // 初次加载期间有限次恢复到 preview，窗口结束后仍允许用户手动切换其他 tab。
      repairCountRef.current += 1;
      setRepairSequence((sequence) => sequence + 1);
    },
    [desiredUrl],
  );

  return { handleGuestNavigation, repairSequence };
}
