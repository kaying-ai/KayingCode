import type { ConversationSelectionReference } from "@/lib/conversationSelectionReference.js";
import type { AnnotationMarkItem } from "@/selection-comment/ConversationAnnotationMarks.js";
import { annotationVariant } from "@/selection-comment/AnnotationNumber.js";

/** 同一段原文的标记键：来源行 + 可选区域 + 起始偏移。 */
function markKey(item: Pick<AnnotationMarkItem, "rowId" | "anchor">): string {
  return `${item.rowId}:${item.anchor.regionIndex}:${item.anchor.start}`;
}

/**
 * 正文标记列表。编号 = 在 composer 列表里的位置（每条只算一条，有无评论都编号），
 * 与 chip 列表一一对应；已发送标记编号单独重排，只用于区分灰色标记之间的先后。
 *
 * 独立成纯函数：编号与去重规则可单测，调用方只负责提供当前作用域与已发送记录。
 */
export function buildAnnotationMarkItems({
  references,
  sent,
  sourceSessionId,
  pending,
  visible = true,
}: {
  references: readonly ConversationSelectionReference[];
  sent: readonly ConversationSelectionReference[];
  sourceSessionId: string;
  /** 正在新增、尚未保存的引用：虚线预占下一条编号。 */
  pending?: ConversationSelectionReference | null;
  /** 正文标记是否启用（未下发 annotationWorkspaceKey 时整体不画）。 */
  visible?: boolean;
}): AnnotationMarkItem[] {
  if (!visible) return [];
  // 已发送标记：同一段原文被多次注释并发送时只保留最新一条，避免同一处叠两个气泡。
  const latestSent = new Map<string, AnnotationMarkItem>();
  for (const reference of sent) {
    if (reference.contentType === "markdown" || !reference.anchor) continue;
    if (reference.sourceSessionId !== sourceSessionId) continue;
    const item: AnnotationMarkItem = {
      id: `sent:${reference.id}`,
      number: 0,
      variant: annotationVariant(reference.comment, true),
      rowId: reference.sourceRowId,
      anchor: reference.anchor,
      text: reference.text,
      ...(reference.comment ? { comment: reference.comment } : {}),
    };
    latestSent.delete(markKey(item));
    latestSent.set(markKey(item), item);
  }
  const dedupedSent = [...latestSent.values()].map((item, index) => ({
    ...item,
    number: index + 1,
  }));
  const current: AnnotationMarkItem[] = [];
  references.forEach((reference, index) => {
    if (reference.contentType === "markdown" || !reference.anchor) return;
    if (reference.sourceSessionId !== sourceSessionId) return;
    current.push({
      id: reference.id,
      number: index + 1,
      variant: annotationVariant(reference.comment),
      rowId: reference.sourceRowId,
      anchor: reference.anchor,
      text: reference.text,
    });
  });
  if (pending && pending.contentType !== "markdown" && pending.anchor) {
    current.push({
      id: "__pending__",
      number: references.length + 1,
      variant: "pending",
      rowId: pending.sourceRowId,
      anchor: pending.anchor,
      text: pending.text,
    });
  }
  // 当前注释盖住同一处的已发送标记：同一段再次注释时只显示当前那条。
  const currentKeys = new Set(current.map(markKey));
  return [...dedupedSent.filter((item) => !currentKeys.has(markKey(item))), ...current];
}
