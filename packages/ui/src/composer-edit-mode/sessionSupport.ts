// Composer 编辑态的预置与投影校验（docs/ui/composer-edit-mode.md）。从 useComposerEditMode 拆出：
// 预置只捕获 workspaceKey，投影校验只读当前投影并通过 current snapshotRef 处理事件，
// 避免长期复用的编辑回调连带保留旧 pane 与整份历史。
import { useEffect, useMemo, useRef } from "react";
import type { AttachmentRef, ConversationSnapshot } from "@zcode/shared/kayingcode-protocol-v4";
import { isHighspeedProviderId } from "@zcode/shared";
import { logger } from "@/logger.js";
import { composerEditSessionKey } from "./contract.js";
import type {
  ComposerEditDraft,
  ComposerEditDraftConfig,
  ComposerEditInvalidReason,
  ComposerEditSession,
  ComposerEditTarget,
} from "./contract.js";
import {
  createComposerEditScopeId,
  getComposerEditSession,
  useComposerEditStore,
} from "./store.js";

/** lock ACK 前投影可能已出现本端锁：这段窗口内自愈逻辑不能把它当成遗留锁释放。 */
export const lockRequestsInFlight = new Set<string>();

export interface EditContent {
  inputKind: "sendText" | "sendGoalCommand";
  /** 含序列化上下文块的原文；载入时至少保留用户可见正文。 */
  text: string;
  attachments: readonly AttachmentRef[];
  conversationQuotes?: ComposerEditSession["conversationQuotes"];
  config: ComposerEditDraftConfig;
}

/**
 * 编辑一条消息时工具栏载入它提交时的配置（最后一条消息与排队项同一规则，docs/ui/composer-edit-mode.md）；
 * 旧消息/旧队列项缺少的字段保留当前草稿配置。旧版本曾把单轮 Highspeed Provider 持久化进输入，
 * 载入工具栏会污染后续 fallback，因此不载入 Highspeed 模型。
 */
export function submittedEditConfig(
  submitted: ComposerEditDraftConfig,
  fallback: ComposerEditDraftConfig,
): ComposerEditDraftConfig {
  const modelSelection =
    submitted.modelSelection && !isHighspeedProviderId(submitted.modelSelection.providerId)
      ? submitted.modelSelection
      : undefined;
  return {
    mode: submitted.mode ?? fallback.mode,
    planEnabled: submitted.planEnabled ?? fallback.planEnabled,
    modelSelection: modelSelection ?? fallback.modelSelection,
  };
}

// 预置操作跨渲染复用，但不能与 dispatch/releaseLock 共享作用域；否则旧命令回调仍持有旧 pane。
export function createEnterEditScope({ workspaceKey }: { workspaceKey: string }) {
  return (
    targetSessionId: string,
    target: ComposerEditTarget,
    content: EditContent,
    extra?: Partial<ComposerEditSession>,
  ) => {
    const scopeId = createComposerEditScopeId(targetSessionId);
    const draft: ComposerEditDraft = { ...content.config, text: content.text };
    useComposerEditStore.getState().begin(composerEditSessionKey(workspaceKey, targetSessionId), {
      target,
      scopeId,
      inputKind: content.inputKind,
      loadedText: content.text,
      lockConfirmed: false,
      draft,
      attachments: content.attachments,
      ...(content.conversationQuotes ? { conversationQuotes: content.conversationQuotes } : {}),
      ...extra,
    });
  };
}

export function useComposerEditProjection({
  snapshot,
  sessionId,
  workspaceKey,
  sessionKey,
  editSession,
  editorId,
  editorIdentityConfirmed,
  releaseLock,
}: {
  snapshot: ConversationSnapshot | null;
  sessionId: string | null;
  workspaceKey: string;
  sessionKey: string | null;
  editSession: ComposerEditSession | undefined;
  editorId: string;
  editorIdentityConfirmed: boolean;
  releaseLock: (sessionId: string, queueItemId: string) => Promise<boolean>;
}): ComposerEditInvalidReason | null {
  // 失效只依据投影：最后一条消息不再可编辑、队列项已不存在、或锁已不属于本编辑器。
  const invalidReason = useMemo<ComposerEditInvalidReason | null>(() => {
    if (!editSession || !snapshot || snapshot.sessionId !== sessionId) return null;
    const target = editSession.target;
    if (target.kind === "userQuery") {
      const row = snapshot.rows.window.find((candidate) => candidate.rowId === target.rowId);
      return row && row.kind === "userInput" && row.actions?.canEdit ? null : "notLatest";
    }
    const item = snapshot.queue.items.find(
      (candidate) => candidate.queueItemId === target.queueItemId,
    );
    if (!item) return "queueItemRemoved";
    if (editSession.lockConfirmed && item.editLock?.editorId !== editorId) return "editLockLost";
    return null;
  }, [editSession, editorId, sessionId, snapshot]);

  useEffect(() => {
    if (!editSession || editSession.lockConfirmed || !sessionKey || !snapshot) return;
    const target = editSession.target;
    if (target.kind !== "queueItem") return;
    const item = snapshot.queue.items.find(
      (candidate) => candidate.queueItemId === target.queueItemId,
    );
    if (item?.editLock?.editorId === editorId) {
      useComposerEditStore.getState().update(sessionKey, { lockConfirmed: true });
    }
  }, [editSession, editorId, sessionKey, snapshot]);

  // 刷新或重启后：投影里属于本编辑器的锁没有对应编辑态，说明发起端已丢失编辑，立即释放。
  // Bug 根因：曾在发出释放时就把项永久标成已处理，释放失败（断线、非 accepted ACK）后不再重试，
  // 队首一直冻结。标记只代表「进行中或已确定释放」，失败即清除，下一次投影更新时重试；
  // 释放完成前该行显示「解除」入口（ConversationQueuePanel），用户也可手动处理。
  const releasedOrphanLocksRef = useRef(new Set<string>());
  useEffect(() => {
    if (!editorIdentityConfirmed) return;
    if (!sessionId || !snapshot || snapshot.sessionId !== sessionId) return;
    for (const item of snapshot.queue.items) {
      if (item.editLock?.editorId !== editorId) continue;
      if (lockRequestsInFlight.has(item.queueItemId)) continue;
      const active = getComposerEditSession(composerEditSessionKey(workspaceKey, sessionId));
      if (active?.target.kind === "queueItem" && active.target.queueItemId === item.queueItemId) {
        continue;
      }
      if (releasedOrphanLocksRef.current.has(item.queueItemId)) continue;
      releasedOrphanLocksRef.current.add(item.queueItemId);
      logger.info("[v4-composer-edit] 释放本编辑器遗留的队列编辑锁", {
        queueItemId: item.queueItemId,
        sessionId,
      });
      const queueItemId = item.queueItemId;
      void releaseLock(sessionId, queueItemId).then((released) => {
        if (!released) releasedOrphanLocksRef.current.delete(queueItemId);
      });
    }
  }, [editorId, editorIdentityConfirmed, releaseLock, sessionId, snapshot, workspaceKey]);

  return invalidReason;
}
