import type {
  IKayingCodeTaskService,
  KayingCodeArchivedTaskDeletionPreview,
  KayingCodeArchivedTaskPermanentDeletionResult,
} from "@zcode/services";
import { buildTaskWorkspaceKey } from "@/lib/taskQueryCache.js";
import { logger } from "@/logger.js";

export interface ArchivedTaskDeletionTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
}

export interface ArchivedTaskDeletionWorkspace {
  workspacePath: string;
  workspaceIdentity?: string;
  label: string;
  service?: Pick<
    IKayingCodeTaskService,
    | "listArchivedTasks"
    | "deleteArchivedTasks"
    | "previewArchivedTaskDeletions"
    | "permanentlyDeleteArchivedTask"
  >;
}

export async function collectArchivedTaskDeletion(workspaces: ArchivedTaskDeletionWorkspace[]) {
  const unique = new Map(
    workspaces.map((workspace) => [
      buildTaskWorkspaceKey(workspace.workspacePath, workspace.workspaceIdentity),
      workspace,
    ]),
  );
  const results = await Promise.all(
    [...unique.values()].map(async (workspace) => {
      if (!workspace.service) return { workspace, targets: null };
      try {
        // 直接读取完整归档集合，不能使用 UI 已折叠或过滤的 items。
        const tasks = await workspace.service.listArchivedTasks({
          workspacePath: workspace.workspacePath,
          workspaceIdentity: workspace.workspaceIdentity,
        });
        const targets = [...new Set(tasks.map((task) => task.taskId))].map((taskId) => ({
          taskId,
          workspacePath: workspace.workspacePath,
          workspaceIdentity: workspace.workspaceIdentity,
        }));
        return { workspace, targets };
      } catch (error) {
        logger.warn("[ArchivedTaskDeletion] 读取归档项目失败", {
          workspaceKey: buildTaskWorkspaceKey(workspace.workspacePath, workspace.workspaceIdentity),
          error,
        });
        return { workspace, targets: null };
      }
    }),
  );
  return {
    groups: results.filter((result) => result.targets !== null),
    count: results.reduce((count, result) => count + (result.targets?.length ?? 0), 0),
    unavailableWorkspaces: results
      .filter((result) => result.targets === null)
      .map((result) => result.workspace.label),
  };
}

export async function deleteArchivedTaskSelection(
  selection: Awaited<ReturnType<typeof collectArchivedTaskDeletion>>,
  onDeleted: (target: ArchivedTaskDeletionTarget) => void,
) {
  let deleted = 0;
  let skipped = 0;
  let failed = 0;
  // 同一 workspace 一次 RPC，让原 source 在逐项事务后统一发事件；独立 source 可以并行。
  await Promise.all(
    selection.groups.map(async ({ workspace, targets }) => {
      if (!targets?.length) return;
      let result: Awaited<ReturnType<IKayingCodeTaskService["deleteArchivedTasks"]>>;
      try {
        result = await workspace.service!.deleteArchivedTasks({
          workspacePath: workspace.workspacePath,
          workspaceIdentity: workspace.workspaceIdentity,
          taskIds: targets.map((target) => target.taskId),
        });
      } catch (error) {
        failed += targets.length;
        logger.warn("[ArchivedTaskDeletion] 工作区批次删除失败", {
          workspacePath: workspace.workspacePath,
          workspaceIdentity: workspace.workspaceIdentity,
          error,
        });
        return;
      }
      const deletedIds = new Set(result.deletedTaskIds);
      const skippedIds = new Set(result.skippedTaskIds);
      for (const target of targets) {
        if (deletedIds.has(target.taskId)) {
          deleted += 1;
          onDeleted(target);
        } else if (skippedIds.has(target.taskId)) {
          skipped += 1;
        } else {
          failed += 1;
        }
      }
    }),
  );
  return { deleted, skipped, failed, unavailableWorkspaces: selection.unavailableWorkspaces };
}

export interface ArchivedTaskPermanentDeletionTarget extends ArchivedTaskDeletionTarget {
  title: string;
  workspaceLabel: string;
}

export interface ArchivedTaskPermanentDeletionPreviewEntry {
  target: ArchivedTaskPermanentDeletionTarget;
  preview?: KayingCodeArchivedTaskDeletionPreview;
  /** 预检失败时的错误码；与同批其他根隔离。 */
  errorCode?: string;
}

export interface ArchivedTaskPermanentDeletionSelection {
  entries: ArchivedTaskPermanentDeletionPreviewEntry[];
  unavailableWorkspaces: string[];
}

export type ArchivedTaskPermanentDeletionItemOutcome =
  | { target: ArchivedTaskPermanentDeletionTarget; status: "deleted" }
  | {
      target: ArchivedTaskPermanentDeletionTarget;
      status: "blocked" | "incomplete";
      reason?: string;
    }
  | { target: ArchivedTaskPermanentDeletionTarget; status: "failed"; reason: string };

export interface ArchivedTaskPermanentDeletionExecutionResult {
  deleted: number;
  blocked: number;
  incomplete: number;
  failed: number;
  unavailableWorkspaces: string[];
  /** 逐项结果；失败/阻止项必须按项展示，不能只给总数。 */
  items: ArchivedTaskPermanentDeletionItemOutcome[];
}

/**
 * 永久删除前统一走批量预检：单个入口也把目标包成一项交给批量接口，
 * 保证预检判定、分批策略与「删除全部」完全一致。
 */
export async function collectArchivedTaskPermanentDeletion(
  workspaces: ArchivedTaskDeletionWorkspace[],
): Promise<ArchivedTaskPermanentDeletionSelection> {
  const unique = new Map(
    workspaces.map((workspace) => [
      buildTaskWorkspaceKey(workspace.workspacePath, workspace.workspaceIdentity),
      workspace,
    ]),
  );
  const results = await Promise.all(
    [...unique.values()].map(async (workspace) => {
      if (!workspace.service) return { workspace, entries: null };
      try {
        // 与软删除一致：直接读取完整归档集合，不能用 UI 已折叠或过滤的 items。
        const tasks = await workspace.service.listArchivedTasks({
          workspacePath: workspace.workspacePath,
          workspaceIdentity: workspace.workspaceIdentity,
        });
        const deduped = new Map(tasks.map((task) => [task.taskId, task]));
        if (deduped.size === 0) return { workspace, entries: [] };
        const previews = await workspace.service.previewArchivedTaskDeletions({
          workspacePath: workspace.workspacePath,
          workspaceIdentity: workspace.workspaceIdentity,
          taskIds: [...deduped.keys()],
        });
        const previewByTaskId = new Map(previews.items.map((item) => [item.taskId, item]));
        return {
          workspace,
          entries: [...deduped.values()].map((task) => {
            const item = previewByTaskId.get(task.taskId);
            return {
              target: {
                taskId: task.taskId,
                title: task.title,
                workspacePath: task.workspacePath,
                workspaceIdentity: task.workspaceIdentity,
                workspaceLabel: workspace.label,
              },
              ...(item?.preview ? { preview: item.preview } : {}),
              ...(item?.errorCode ? { errorCode: item.errorCode } : {}),
            } satisfies ArchivedTaskPermanentDeletionPreviewEntry;
          }),
        };
      } catch (error) {
        logger.warn("[ArchivedTaskDeletion] 读取永久删除预检失败", {
          workspaceKey: buildTaskWorkspaceKey(workspace.workspacePath, workspace.workspaceIdentity),
          error,
        });
        return { workspace, entries: null };
      }
    }),
  );
  return {
    entries: results.flatMap((result) => result.entries ?? []),
    unavailableWorkspaces: results
      .filter((result) => result.entries === null)
      .map((result) => result.workspace.label),
  };
}

/** 单项入口复用批量预检，只取当前目标；调用方负责按 preview 展示详情。 */
export async function previewArchivedTaskPermanentDeletion(
  target: ArchivedTaskPermanentDeletionTarget,
  service: Pick<
    IKayingCodeTaskService,
    "previewArchivedTaskDeletions" | "permanentlyDeleteArchivedTask"
  >,
): Promise<{ preview?: KayingCodeArchivedTaskDeletionPreview; errorCode?: string }> {
  const result = await service.previewArchivedTaskDeletions({
    workspacePath: target.workspacePath,
    workspaceIdentity: target.workspaceIdentity,
    taskIds: [target.taskId],
  });
  const item = result.items.find((entry) => entry.taskId === target.taskId);
  return item?.preview
    ? { preview: item.preview }
    : { errorCode: item?.errorCode ?? "unavailable" };
}

export async function deleteArchivedTaskPermanentSelection(
  selection: ArchivedTaskPermanentDeletionSelection,
  workspaces: ArchivedTaskDeletionWorkspace[],
  onDeleted: (target: ArchivedTaskDeletionTarget) => void,
): Promise<ArchivedTaskPermanentDeletionExecutionResult> {
  const serviceByWorkspaceKey = new Map(
    workspaces.map((workspace) => [
      buildTaskWorkspaceKey(workspace.workspacePath, workspace.workspaceIdentity),
      workspace.service,
    ]),
  );
  const result: ArchivedTaskPermanentDeletionExecutionResult = {
    deleted: 0,
    blocked: 0,
    incomplete: 0,
    failed: 0,
    unavailableWorkspaces: selection.unavailableWorkspaces,
    items: [],
  };
  for (const entry of selection.entries) {
    const { target } = entry;
    const service = serviceByWorkspaceKey.get(
      buildTaskWorkspaceKey(target.workspacePath, target.workspaceIdentity),
    );
    if (!service || !entry.preview) {
      const reason = entry.errorCode ?? "session-data.unavailable";
      result.failed += 1;
      result.items.push({ target, status: "failed", reason });
      continue;
    }
    if (entry.preview.blockedReason) {
      result.blocked += 1;
      result.items.push({
        target,
        status: "blocked",
        reason: entry.preview.blockedReason,
      });
      continue;
    }
    // 上一次执行已完成：会话正文已不在，直接当作删除成功让列表收敛。
    if (entry.preview.completed) {
      result.deleted += 1;
      result.items.push({ target, status: "deleted" });
      onDeleted(target);
      continue;
    }
    let deleted: KayingCodeArchivedTaskPermanentDeletionResult;
    try {
      deleted = await service.permanentlyDeleteArchivedTask({
        taskId: target.taskId,
        workspacePath: target.workspacePath,
        workspaceIdentity: target.workspaceIdentity,
        revision: entry.preview.revision,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      result.failed += 1;
      result.items.push({ target, status: "failed", reason });
      logger.warn("[ArchivedTaskDeletion] 永久删除请求失败", { ...target, error });
      continue;
    }
    if (deleted.status === "deleted") {
      result.deleted += 1;
      result.items.push({ target, status: "deleted" });
      onDeleted(target);
    } else if (deleted.status === "incomplete") {
      result.incomplete += 1;
      result.items.push({ target, status: "incomplete", reason: deleted.reason });
    } else {
      result.blocked += 1;
      result.items.push({ target, status: "blocked", reason: deleted.reason });
    }
  }
  return result;
}
