import { useState } from "react";
import type { IKayingCodeTaskService } from "@zcode/services";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import type { IntlInstance } from "@/i18n/IntlProvider.js";
import {
  previewArchivedTaskPermanentDeletion,
  type ArchivedTaskDeletionTarget,
} from "@/lib/archivedTaskDeletion.js";
import {
  describeArchivedTaskDeletionBlockedReason,
  describeArchivedTaskDeletionPreview,
} from "@/lib/permanentDeletionPresentation.js";
import { logger } from "@/logger.js";

export interface ArchivedTaskPermanentDeletionTask extends ArchivedTaskDeletionTarget {
  title: string;
}

/**
 * 归档行上的永久删除交互：预检 → 确认 → 执行 → 单项反馈。
 * 列表刷新与缓存移除由调用方注入，hook 只持有请求中的行和该行的结果文案。
 */
export function useArchivedTaskPermanentDeletion(params: {
  intl: IntlInstance;
  resolveService: (
    workspacePath: string,
    workspaceIdentity?: string,
  ) => Pick<
    IKayingCodeTaskService,
    "previewArchivedTaskDeletions" | "permanentlyDeleteArchivedTask"
  > | null;
  resolveWorkspaceLabel: (workspacePath: string, workspaceIdentity?: string) => string;
  onDeleted: (target: ArchivedTaskDeletionTarget) => void;
  refresh: () => Promise<void>;
}) {
  const confirmDialog = useConfirmDialog();
  const [deletingTaskKeys, setDeletingTaskKeys] = useState<Set<string>>(() => new Set());
  const [messages, setMessages] = useState<Record<string, string>>({});

  function setMessage(taskKey: string, message: string | null) {
    setMessages((current) => {
      if (!message) {
        if (!(taskKey in current)) return current;
        const next = { ...current };
        delete next[taskKey];
        return next;
      }
      return { ...current, [taskKey]: message };
    });
  }

  async function deletePermanently(
    task: ArchivedTaskPermanentDeletionTask,
    taskKey: string,
  ): Promise<void> {
    const service = params.resolveService(task.workspacePath, task.workspaceIdentity);
    if (!service) return;
    const target = {
      taskId: task.taskId,
      title: task.title,
      workspacePath: task.workspacePath,
      workspaceIdentity: task.workspaceIdentity,
      workspaceLabel: params.resolveWorkspaceLabel(task.workspacePath, task.workspaceIdentity),
    };
    setMessage(taskKey, null);
    try {
      // 单项也走批量预检接口，确保与「删除全部」共用同一判定和 revision。
      const previewResult = await previewArchivedTaskPermanentDeletion(target, service);
      if (!previewResult.preview) {
        setMessage(
          taskKey,
          params.intl.formatMessage(
            { id: "taskList.permanentDeletePreviewFailed" },
            {
              reason: describeArchivedTaskDeletionBlockedReason(
                params.intl,
                previewResult.errorCode,
              ),
            },
          ),
        );
        return;
      }
      const preview = previewResult.preview;
      if (preview.blockedReason) {
        setMessage(
          taskKey,
          describeArchivedTaskDeletionBlockedReason(params.intl, preview.blockedReason),
        );
        return;
      }
      const confirmed = await confirmDialog({
        title: params.intl.formatMessage({ id: "taskList.permanentDeleteSingleTitle" }),
        description: [
          params.intl.formatMessage({ id: "taskList.permanentDeleteDescription" }),
          describeArchivedTaskDeletionPreview(params.intl, preview),
        ].join("\n\n"),
        confirmLabel: params.intl.formatMessage({ id: "taskList.permanentDelete" }),
        confirmVariant: "destructive",
      });
      if (!confirmed) return;

      setDeletingTaskKeys((current) => new Set(current).add(taskKey));
      const result = await service.permanentlyDeleteArchivedTask({
        taskId: target.taskId,
        workspacePath: target.workspacePath,
        workspaceIdentity: target.workspaceIdentity,
        revision: preview.revision,
      });
      if (result.status === "deleted") {
        // 永久删除会移除会话正文；先从本地缓存收敛，再重查归档列表确认服务端事实。
        params.onDeleted(target);
        setMessage(taskKey, null);
        await params.refresh();
      } else {
        setMessage(
          taskKey,
          [
            describeArchivedTaskDeletionBlockedReason(params.intl, result.reason),
            result.status === "incomplete"
              ? params.intl.formatMessage({ id: "taskList.permanentDeleteIncompleteHint" })
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
    } catch (error) {
      logger.error("[WorkspaceArchivedTasksFlatSection] 永久删除归档 task 失败:", error);
      setMessage(
        taskKey,
        params.intl.formatMessage(
          { id: "taskList.permanentDeleteError" },
          { reason: error instanceof Error ? error.message : String(error) },
        ),
      );
    } finally {
      setDeletingTaskKeys((current) => {
        const next = new Set(current);
        next.delete(taskKey);
        return next;
      });
    }
  }

  return {
    permanentDeletingTaskKeys: deletingTaskKeys,
    permanentDeleteMessages: messages,
    deletePermanently,
  };
}
