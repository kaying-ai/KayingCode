import { describe, expect, it, vi } from "vitest";
import {
  collectArchivedTaskPermanentDeletion,
  deleteArchivedTaskPermanentSelection,
  previewArchivedTaskPermanentDeletion,
  type ArchivedTaskDeletionWorkspace,
} from "../src/lib/archivedTaskDeletion.js";

vi.mock("@/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

function preview(taskId: string, overrides: Record<string, unknown> = {}) {
  return {
    taskId,
    revision: `rev-${taskId}`,
    sessionIds: [taskId],
    forks: [],
    retainedArtifacts: [],
    deletedFiles: 2,
    incomplete: false,
    completed: false,
    ...overrides,
  };
}

function workspace(
  label: string,
  tasks: Array<{ taskId: string; title: string }>,
  previewResult: (taskIds: string[]) => Promise<{
    items: Array<{ taskId: string; preview?: unknown; errorCode?: string }>;
  }>,
  permanentDelete = vi.fn(async () => ({
    taskId: "",
    status: "deleted" as const,
    sessionIds: [],
    retainedArtifacts: 0,
  })),
): ArchivedTaskDeletionWorkspace & { permanentDelete: typeof permanentDelete } {
  return {
    workspacePath: `/work/${label}`,
    label,
    permanentDelete,
    service: {
      async listArchivedTasks() {
        return tasks.map((task) => ({
          taskId: task.taskId,
          title: task.title,
          workspacePath: `/work/${label}`,
          archived: true,
        })) as never;
      },
      async deleteArchivedTasks() {
        return { deletedTaskIds: [], skippedTaskIds: [], failedTaskIds: [] };
      },
      previewArchivedTaskDeletions: async (params) => previewResult(params.taskIds),
      permanentlyDeleteArchivedTask: permanentDelete,
    } as never,
  };
}

describe("归档永久删除选择与执行", () => {
  it("按 workspace 读取完整归档集合并走批量预检，单项错误保留在对应项", async () => {
    const batchCalls: string[][] = [];
    const first = workspace(
      "first",
      [
        { taskId: "a", title: "A" },
        { taskId: "b", title: "B" },
      ],
      async (taskIds) => {
        batchCalls.push(taskIds);
        return {
          items: [
            {
              taskId: "a",
              preview: preview("a", {
                forks: [{ taskId: "fork", title: "Fork" }],
                retainedArtifacts: [
                  {
                    taskId: "other",
                    artifactId: "p",
                    fileName: "shared.png",
                    referrers: [{ taskId: "fork", title: "Fork" }],
                  },
                ],
              }),
            },
            { taskId: "b", errorCode: "session-data.identity-mismatch" },
          ],
        };
      },
    );
    const second = workspace("second", [{ taskId: "c", title: "C" }], async () => ({
      items: [{ taskId: "c", preview: preview("c", { blockedReason: "running" }) }],
    }));

    const selection = await collectArchivedTaskPermanentDeletion([first, second]);

    expect(batchCalls).toEqual([["a", "b"]]);
    expect(selection.unavailableWorkspaces).toEqual([]);
    expect(
      selection.entries.map((entry) => [entry.target.taskId, entry.target.workspaceLabel]),
    ).toEqual([
      ["a", "first"],
      ["b", "first"],
      ["c", "second"],
    ]);
    expect(selection.entries[0]?.preview).toMatchObject({
      forks: [{ taskId: "fork", title: "Fork" }],
      retainedArtifacts: [{ fileName: "shared.png" }],
    });
    expect(selection.entries[1]?.errorCode).toBe("session-data.identity-mismatch");
    expect(selection.entries[2]?.preview?.blockedReason).toBe("running");
  });

  it("预检失败的工作区记为 unavailable，不阻断其他工作区", async () => {
    const broken = workspace("broken", [{ taskId: "x", title: "X" }], async () => {
      throw new Error("offline");
    });
    const healthy = workspace("healthy", [{ taskId: "y", title: "Y" }], async () => ({
      items: [{ taskId: "y", preview: preview("y") }],
    }));

    const selection = await collectArchivedTaskPermanentDeletion([broken, healthy]);

    expect(selection.entries.map((entry) => entry.target.taskId)).toEqual(["y"]);
    expect(selection.unavailableWorkspaces).toEqual(["broken"]);
  });

  it("逐项执行并按项返回 blocked/incomplete/failed，成功项回调缓存移除", async () => {
    const calls: Array<{ taskId: string; revision: string }> = [];
    const permanentDelete = vi.fn(async (params: { taskId: string; revision: string }) => {
      calls.push({ taskId: params.taskId, revision: params.revision });
      if (params.taskId === "blocked") {
        return {
          taskId: params.taskId,
          status: "blocked" as const,
          sessionIds: [params.taskId],
          retainedArtifacts: 0,
          reason: "in-use",
        };
      }
      if (params.taskId === "incomplete") {
        return {
          taskId: params.taskId,
          status: "incomplete" as const,
          sessionIds: [params.taskId],
          retainedArtifacts: 0,
          reason: "session-data.deleting",
        };
      }
      return {
        taskId: params.taskId,
        status: "deleted" as const,
        sessionIds: [params.taskId],
        retainedArtifacts: 1,
      };
    });
    const first = workspace(
      "first",
      [
        { taskId: "ok", title: "OK" },
        { taskId: "blocked", title: "Blocked" },
        { taskId: "incomplete", title: "Incomplete" },
        { taskId: "broken", title: "Broken" },
        { taskId: "missing", title: "Missing" },
      ],
      async (taskIds) => ({
        items: taskIds
          .filter((taskId) => taskId !== "missing")
          .map((taskId) => ({
            taskId,
            preview: preview(taskId, taskId === "blocked" ? { blockedReason: "running" } : {}),
          })),
      }),
      permanentDelete,
    );

    const selection = await collectArchivedTaskPermanentDeletion([first]);
    // 模拟确认期间目标新增文件：执行时返回 blocked changed。
    permanentDelete.mockImplementation(async (params: { taskId: string; revision: string }) => {
      calls.push({ taskId: params.taskId, revision: params.revision });
      if (params.taskId === "blocked") {
        return {
          taskId: params.taskId,
          status: "blocked" as const,
          sessionIds: [params.taskId],
          retainedArtifacts: 0,
          reason: "changed",
        };
      }
      if (params.taskId === "incomplete") {
        return {
          taskId: params.taskId,
          status: "incomplete" as const,
          sessionIds: [params.taskId],
          retainedArtifacts: 0,
          reason: "session-data.deleting",
        };
      }
      if (params.taskId === "broken") throw new Error("rpc closed");
      return {
        taskId: params.taskId,
        status: "deleted" as const,
        sessionIds: [params.taskId],
        retainedArtifacts: 1,
      };
    });
    const deletedTargets: string[] = [];
    const result = await deleteArchivedTaskPermanentSelection(selection, [first], (target) =>
      deletedTargets.push(target.taskId),
    );

    expect(result).toMatchObject({
      deleted: 1,
      blocked: 1,
      incomplete: 1,
      failed: 2,
    });
    expect(result.items).toEqual([
      { target: expect.objectContaining({ taskId: "ok" }), status: "deleted" },
      {
        target: expect.objectContaining({ taskId: "blocked" }),
        status: "blocked",
        reason: "running",
      },
      {
        target: expect.objectContaining({ taskId: "incomplete" }),
        status: "incomplete",
        reason: "session-data.deleting",
      },
      {
        target: expect.objectContaining({ taskId: "broken" }),
        status: "failed",
        reason: "rpc closed",
      },
      {
        target: expect.objectContaining({ taskId: "missing" }),
        status: "failed",
        reason: "session-data.unavailable",
      },
    ]);
    // 预检已经 blocked 的项不会发执行请求。
    expect(calls.map((call) => call.taskId)).toEqual(["ok", "incomplete", "broken"]);
    expect(deletedTargets).toEqual(["ok"]);
  });

  it("单项入口把目标包成一项复用批量预检", async () => {
    const seen: string[][] = [];
    const first = workspace("first", [], async (taskIds) => {
      seen.push(taskIds);
      return { items: [{ taskId: taskIds[0]!, preview: preview(taskIds[0]!) }] };
    });
    const result = await previewArchivedTaskPermanentDeletion(
      {
        taskId: "a",
        title: "A",
        workspacePath: "/work/first",
        workspaceLabel: "first",
      },
      first.service!,
    );
    expect(seen).toEqual([["a"]]);
    expect(result.preview?.revision).toBe("rev-a");
  });
});
