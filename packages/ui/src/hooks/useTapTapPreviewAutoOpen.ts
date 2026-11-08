import { useEffect, useRef } from "react";
import type { TapTapPreviewPublicationV1 } from "@zcode/shared";
import { useTapTapPreviewPublication } from "@/hooks/useTapTapPreviewPublication.js";

export function useTapTapPreviewAutoOpen(input: {
  enabled: boolean;
  workspaceKey: string;
  workspacePath: string;
  onPublication: (publication: TapTapPreviewPublicationV1 & { sessionId: string }) => void;
}): void {
  const { publication } = useTapTapPreviewPublication(input);
  const seen = useRef(new Map<string, number>());
  const onPublicationRef = useRef(input.onPublication);
  onPublicationRef.current = input.onPublication;
  useEffect(() => {
    if (
      !input.enabled ||
      !publication?.sessionId ||
      publication.workspaceKey !== input.workspaceKey
    )
      return;
    const key = JSON.stringify([input.workspaceKey, input.workspacePath]);
    if (publication.revision <= (seen.current.get(key) ?? 0)) return;
    seen.current.set(key, publication.revision);
    // 转写的首份发布早于比较回执；由发布者标记模式，避免独立预览抢走转写面板。
    if (publication.previewMode === "transcription-compare") return;
    // 修复依据：原先只有手动打开的面板读取回执；发布成功后需由壳层主动投影专用预览。
    onPublicationRef.current({ ...publication, sessionId: publication.sessionId });
  }, [input.enabled, input.workspaceKey, input.workspacePath, publication]);
}
