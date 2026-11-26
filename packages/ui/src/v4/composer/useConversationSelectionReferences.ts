import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearConversationSelectionReferenceLimitReason,
  getConversationSelectionReferenceScope,
  getConversationSelectionReferenceLimitReason,
  getConversationSelectionAddEventName,
  isConversationSelectionAddEvent,
  retainSelectionCommentsWithLiveSource,
  setConversationSelectionReferenceScope,
  subscribeConversationSelectionReferenceScopes,
  type ConversationSelectionLimitReason,
  type ConversationSelectionReference,
} from "@/lib/conversationSelectionReference.js";

/**
 * 会话引用（含选区批注）的 composer 视图。
 *
 * 作用域 key 由调用方以 sessionId 参数给出：产品在根草稿用 V4_DRAFT_SCOPE_ROOT，编辑态用 edit scope。
 * `liveSourceSessionId` 只在“作用域就是真实会话”时给出，用于 rewind 后剪掉来源行已消失的带评论注释；
 * 编辑态/草稿传 null，避免把另一个会话的行当成来源。
 */
export function useConversationSelectionReferences(options: {
  sessionId: string | null;
  workspaceKey: string;
  liveSourceSessionId?: string | null;
  /** 当前会话的权威 rows；提供时，rewind 删除来源行的带评论注释会被同步移除。 */
  liveSourceRows?: { window: readonly { rowId: number }[]; firstRowId: number | null } | null;
}) {
  const [references, setReferencesState] = useState<readonly ConversationSelectionReference[]>(() =>
    getConversationSelectionReferenceScope(options.sessionId, options.workspaceKey),
  );
  const [limitReason, setLimitReason] = useState<ConversationSelectionLimitReason | null>(() =>
    getConversationSelectionReferenceLimitReason(options.sessionId, options.workspaceKey),
  );

  useEffect(() => {
    setReferencesState(
      getConversationSelectionReferenceScope(options.sessionId, options.workspaceKey),
    );
    setLimitReason(
      getConversationSelectionReferenceLimitReason(options.sessionId, options.workspaceKey),
    );
  }, [options.sessionId, options.workspaceKey]);

  const setReferences = useCallback(
    (
      update:
        | readonly ConversationSelectionReference[]
        | ((
            current: readonly ConversationSelectionReference[],
          ) => readonly ConversationSelectionReference[]),
    ) => {
      setReferencesState((current) => {
        const next = typeof update === "function" ? update(current) : update;
        setConversationSelectionReferenceScope(options.sessionId, options.workspaceKey, next);
        return next;
      });
    },
    [options.sessionId, options.workspaceKey],
  );

  useEffect(() => {
    const handleAdd = (event: Event) => {
      if (!isConversationSelectionAddEvent(event)) return;
      if (
        event.detail.targetSessionId !== options.sessionId ||
        event.detail.workspaceKey !== options.workspaceKey
      ) {
        return;
      }
      setReferencesState(
        getConversationSelectionReferenceScope(options.sessionId, options.workspaceKey),
      );
      setLimitReason(
        getConversationSelectionReferenceLimitReason(options.sessionId, options.workspaceKey),
      );
    };
    window.addEventListener(getConversationSelectionAddEventName(), handleAdd);
    return () => window.removeEventListener(getConversationSelectionAddEventName(), handleAdd);
  }, [options.sessionId, options.workspaceKey]);

  const liveSourceRowsRef = useRef(options.liveSourceRows);
  liveSourceRowsRef.current = options.liveSourceRows;
  const liveSourceSessionIdRef = useRef(options.liveSourceSessionId);
  liveSourceSessionIdRef.current = options.liveSourceSessionId;

  // 正文注释标记也能编辑/删除注释（直接写作用域存储），不经过 setReferences，
  // 必须订阅存储变化才能让 chip 与正文标记保持同一份数据。
  useEffect(
    () =>
      subscribeConversationSelectionReferenceScopes(() => {
        const latest = getConversationSelectionReferenceScope(
          options.sessionId,
          options.workspaceKey,
        );
        // 撤销删除会把注释原样放回；若期间 rewind 已删掉来源行，带评论的注释不能复活。
        // rows 不变时下面的剪枝 effect 不会重跑，所以存储变化时也按最新 rows 剪一次。
        const sourceSessionId = liveSourceSessionIdRef.current;
        const rows = liveSourceRowsRef.current;
        if (sourceSessionId && rows) {
          const pruned = retainSelectionCommentsWithLiveSource(latest, sourceSessionId, rows);
          if (pruned !== latest) {
            setConversationSelectionReferenceScope(
              options.sessionId,
              options.workspaceKey,
              pruned,
            );
            return;
          }
        }
        setReferencesState((current) =>
          current === latest || (current.length === 0 && latest.length === 0) ? current : latest,
        );
      }),
    [options.sessionId, options.workspaceKey],
  );

  const { sessionId, workspaceKey, liveSourceSessionId, liveSourceRows } = options;
  useEffect(() => {
    if (!sessionId || !liveSourceSessionId || !liveSourceRows) return;
    const current = getConversationSelectionReferenceScope(sessionId, workspaceKey);
    const next = retainSelectionCommentsWithLiveSource(current, liveSourceSessionId, liveSourceRows);
    // rows 每个流式 delta 都会换引用；只有真的删掉批注时才写回，避免清掉超限提示。
    if (next !== current) setReferences(next);
  }, [sessionId, workspaceKey, liveSourceSessionId, liveSourceRows, setReferences]);

  const removeReference = useCallback(
    (id: string) => {
      setReferences((current) => current.filter((reference) => reference.id !== id));
      setLimitReason(null);
    },
    [setReferences],
  );
  const clearReferences = useCallback(() => {
    setReferences([]);
    setLimitReason(null);
  }, [setReferences]);
  const dismissLimitReason = useCallback(() => {
    clearConversationSelectionReferenceLimitReason(options.sessionId, options.workspaceKey);
    setLimitReason(null);
  }, [options.sessionId, options.workspaceKey]);

  return {
    references,
    limitReason,
    dismissLimitReason,
    removeReference,
    clearReferences,
  };
}
