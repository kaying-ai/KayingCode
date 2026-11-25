import type { KayingCodeArchivedTaskDeletionPreview } from "@zcode/services";
import type { IntlInstance } from "@/i18n/IntlProvider.js";

const KNOWN_BLOCKED_REASONS = new Set([
  "running",
  "in-use",
  "not-found",
  "not-archived",
  "unavailable",
  "changed",
  "deleting",
  "unsupported",
]);

/**
 * 预检/执行返回的原因可能是协议错误码，也可能是删除状态；未知原因保留原文，
 * 避免把「数据变化」误报成「运行时不可用」。
 */
export function describeArchivedTaskDeletionBlockedReason(
  intl: IntlInstance,
  reason: string | undefined,
): string {
  const normalized = reason?.trim() ?? "";
  const key =
    normalized === "session-data.deleting"
      ? "deleting"
      : normalized.startsWith("session-data.unavailable")
        ? "unavailable"
        : KNOWN_BLOCKED_REASONS.has(normalized)
          ? normalized
          : "unknown";
  return intl.formatMessage(
    { id: `taskList.permanentDeleteBlocked.${key}` },
    { reason: normalized || "unknown" },
  );
}

/** 单个目标的预检详情：共享附件和 fork 保留项必须显式告知，不能只显示「将删除」。 */
export function describeArchivedTaskDeletionPreview(
  intl: IntlInstance,
  preview: KayingCodeArchivedTaskDeletionPreview,
): string {
  return [
    intl.formatMessage(
      { id: "taskList.permanentDeletePreviewSummary" },
      {
        count: 1,
        forks: preview.forks.length,
        files: preview.deletedFiles,
        artifacts: preview.retainedArtifacts.length,
      },
    ),
    preview.incomplete ? intl.formatMessage({ id: "taskList.permanentDeleteIncompleteHint" }) : "",
    preview.blockedReason
      ? describeArchivedTaskDeletionBlockedReason(intl, preview.blockedReason)
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
