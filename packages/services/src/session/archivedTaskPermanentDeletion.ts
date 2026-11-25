// 归档任务的永久删除服务面：把 CLI 的单项预检/批量预检/执行三次调用收敛成
// 「预览 → 逐项执行 → 汇总」；UI 只用这里的结果，不直接拼 v4 请求。

/** 预检给出的阻止原因；not-archived 由后续任务索引状态补判。 */
export type KayingCodeArchivedTaskDeletionPreviewReason =
  | "running"
  | "in-use"
  | "not-found"
  | "not-archived"
  | "unavailable"
  | "changed";

/** 单次批量预检的根数；与 v4 契约的 100 上限留余量，避免一次同步扫描长期占用 CLI。 */
export const ARCHIVED_TASK_DELETION_PREVIEW_BATCH_SIZE = 20;
const METHOD_NOT_FOUND_CODE = -32601;

/** CLI 预检返回的原始结构；这里不复用 v4 类型，保持 services 对 UI 的产品字段。 */
export interface ArchivedTaskDeletionProtocolPreview {
  sessionId: string;
  revision: string;
  sessionIds: string[];
  forks: Array<{ sessionId: string; title: string }>;
  retainedArtifacts: Array<{
    sessionId: string;
    artifactId: string;
    fileName: string;
    referrers: Array<{ sessionId: string; title: string }>;
  }>;
  deletedFiles: number;
  blockedReason?: KayingCodeArchivedTaskDeletionPreviewReason;
  incomplete: boolean;
  completed: boolean;
}

export interface ArchivedTaskDeletionProtocolResult {
  sessionId: string;
  status: "deleted" | "blocked" | "incomplete";
  sessionIds: string[];
  retainedArtifacts: number;
  reason?: string;
}

export interface ArchivedTaskDeletionWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
}

/**
 * 归档永久删除的协议端口。由 KayingCode agent service 提供；测试可注入内存实现，
 * 不需要拉起 CLI 进程。
 */
export interface ArchivedTaskDeletionProtocolPort {
  previewSessionDeletions(
    params: ArchivedTaskDeletionWorkspaceTarget & { sessionIds: string[] },
  ): Promise<{
    results: Array<{ preview: ArchivedTaskDeletionProtocolPreview } | { error: { code: string } }>;
  }>;
  previewSessionDeletion(
    params: ArchivedTaskDeletionWorkspaceTarget & { sessionId: string },
  ): Promise<ArchivedTaskDeletionProtocolPreview>;
  executeSessionDeletion(
    params: ArchivedTaskDeletionWorkspaceTarget & {
      sessionId: string;
      revision: string;
      operationId: string;
    },
  ): Promise<ArchivedTaskDeletionProtocolResult>;
}

export interface ArchivedTaskPermanentDeletionPreview {
  taskId: string;
  revision: string;
  /** 根会话 + 其 owned tree（子代理/派生会话）；fork 不在其中。 */
  sessionIds: string[];
  forks: Array<{ taskId: string; title: string }>;
  retainedArtifacts: Array<{
    taskId: string;
    artifactId: string;
    fileName: string;
    referrers: Array<{ taskId: string; title: string }>;
  }>;
  deletedFiles: number;
  blockedReason?: KayingCodeArchivedTaskDeletionPreviewReason;
  /** 上次执行中断，重试只完成余项。 */
  incomplete: boolean;
  completed: boolean;
}

export interface ArchivedTaskPermanentDeletionPreviewItem {
  taskId: string;
  preview?: ArchivedTaskPermanentDeletionPreview;
  /** 该根预检失败的错误码；不影响同批其他根。 */
  errorCode?: string;
}

export interface ArchivedTaskPermanentDeletionPreviewBatchResult {
  items: ArchivedTaskPermanentDeletionPreviewItem[];
}

export interface ArchivedTaskPermanentDeletionResult {
  taskId: string;
  status: "deleted" | "blocked" | "incomplete";
  sessionIds: string[];
  retainedArtifacts: number;
  reason?: string;
}

function errorCodeOf(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) return code;
    if (code === METHOD_NOT_FOUND_CODE) return "unsupported";
  }
  return error instanceof Error && error.message ? error.message : "session-data.unavailable";
}

function isMethodNotFound(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === METHOD_NOT_FOUND_CODE,
  );
}

function toPreview(
  taskId: string,
  preview: ArchivedTaskDeletionProtocolPreview,
): ArchivedTaskPermanentDeletionPreview {
  return {
    taskId,
    revision: preview.revision,
    sessionIds: preview.sessionIds,
    forks: preview.forks.map((fork) => ({ taskId: fork.sessionId, title: fork.title })),
    retainedArtifacts: preview.retainedArtifacts.map((artifact) => ({
      taskId: artifact.sessionId,
      artifactId: artifact.artifactId,
      fileName: artifact.fileName,
      referrers: artifact.referrers.map((referrer) => ({
        taskId: referrer.sessionId,
        title: referrer.title,
      })),
    })),
    deletedFiles: preview.deletedFiles,
    ...(preview.blockedReason ? { blockedReason: preview.blockedReason } : {}),
    incomplete: preview.incomplete,
    completed: preview.completed,
  };
}

function emptyPreview(taskId: string, errorCode: string): ArchivedTaskPermanentDeletionPreviewItem {
  return { taskId, errorCode };
}

/**
 * 旧 CLI 不认识批量预检时逐项回退；只有 method-not-found 能证明旧 Agent 不支持，
 * 其它错误必须按项记录，不能把整批降级成逐项请求掩盖真实失败。
 */
async function previewChunk(
  port: ArchivedTaskDeletionProtocolPort,
  workspace: ArchivedTaskDeletionWorkspaceTarget,
  taskIds: string[],
): Promise<ArchivedTaskPermanentDeletionPreviewItem[]> {
  try {
    const batch = await port.previewSessionDeletions({ ...workspace, sessionIds: taskIds });
    return taskIds.map((taskId, index) => {
      const result = batch.results[index];
      return result && "preview" in result
        ? { taskId, preview: toPreview(taskId, result.preview) }
        : emptyPreview(
            taskId,
            result && "error" in result ? result.error.code : "session-data.unavailable",
          );
    });
  } catch (error) {
    if (!isMethodNotFound(error)) {
      const code = errorCodeOf(error);
      return taskIds.map((taskId) => emptyPreview(taskId, code));
    }
    const items: ArchivedTaskPermanentDeletionPreviewItem[] = [];
    for (const taskId of taskIds) {
      try {
        const preview = await port.previewSessionDeletion({ ...workspace, sessionId: taskId });
        items.push({ taskId, preview: toPreview(taskId, preview) });
      } catch (singleError) {
        items.push(emptyPreview(taskId, errorCodeOf(singleError)));
      }
    }
    return items;
  }
}

export interface ArchivedTaskPermanentDeletionService {
  previewArchivedTaskDeletion(
    params: ArchivedTaskDeletionWorkspaceTarget & { taskId: string },
  ): Promise<ArchivedTaskPermanentDeletionPreview>;
  previewArchivedTaskDeletions(
    params: ArchivedTaskDeletionWorkspaceTarget & { taskIds: string[] },
  ): Promise<ArchivedTaskPermanentDeletionPreviewBatchResult>;
  permanentlyDeleteArchivedTask(
    params: ArchivedTaskDeletionWorkspaceTarget & {
      taskId: string;
      revision: string;
      operationId: string;
    },
  ): Promise<ArchivedTaskPermanentDeletionResult>;
}

export function createArchivedTaskPermanentDeletionService(
  port: ArchivedTaskDeletionProtocolPort,
): ArchivedTaskPermanentDeletionService {
  return {
    async previewArchivedTaskDeletion(params) {
      const preview = await port.previewSessionDeletion({
        workspacePath: params.workspacePath,
        ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
        sessionId: params.taskId,
      });
      return toPreview(params.taskId, preview);
    },

    async previewArchivedTaskDeletions(params) {
      const taskIds = [...new Set(params.taskIds)];
      const items: ArchivedTaskPermanentDeletionPreviewItem[] = [];
      // 顺序分批：每批一次 CLI 全表扫描，不并发堆叠读取。
      for (
        let offset = 0;
        offset < taskIds.length;
        offset += ARCHIVED_TASK_DELETION_PREVIEW_BATCH_SIZE
      ) {
        items.push(
          ...(await previewChunk(
            port,
            {
              workspacePath: params.workspacePath,
              ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
            },
            taskIds.slice(offset, offset + ARCHIVED_TASK_DELETION_PREVIEW_BATCH_SIZE),
          )),
        );
      }
      return { items };
    },

    async permanentlyDeleteArchivedTask(params) {
      try {
        const result = await port.executeSessionDeletion({
          workspacePath: params.workspacePath,
          ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
          sessionId: params.taskId,
          revision: params.revision,
          operationId: params.operationId,
        });
        return {
          taskId: params.taskId,
          status: result.status,
          sessionIds: result.sessionIds,
          retainedArtifacts: result.retainedArtifacts,
          ...(result.reason ? { reason: result.reason } : {}),
        };
      } catch (error) {
        // 执行失败按项返回，调用方继续处理同批其他归档；结果可能已在 CLI 落盘，标为 incomplete。
        return {
          taskId: params.taskId,
          status: "incomplete",
          sessionIds: [],
          retainedArtifacts: 0,
          reason: errorCodeOf(error),
        };
      }
    },
  };
}
