import { describe, expect, it } from "vitest";
import {
  ARCHIVED_TASK_DELETION_PREVIEW_BATCH_SIZE,
  createArchivedTaskPermanentDeletionService,
  type ArchivedTaskDeletionProtocolPort,
  type ArchivedTaskDeletionProtocolPreview,
} from "../src/session/archivedTaskPermanentDeletion.js";

function previewOf(
  sessionId: string,
  overrides: Partial<ArchivedTaskDeletionProtocolPreview> = {},
) {
  return {
    sessionId,
    revision: `rev-${sessionId}`,
    sessionIds: [sessionId],
    forks: [],
    retainedArtifacts: [],
    deletedFiles: 1,
    incomplete: false,
    completed: false,
    ...overrides,
  } satisfies ArchivedTaskDeletionProtocolPreview;
}

describe("归档永久删除服务面", () => {
  it("批量预检按 20 项分批、去重并保持入参顺序", async () => {
    const calls: string[][] = [];
    const port: ArchivedTaskDeletionProtocolPort = {
      async previewSessionDeletions(params) {
        calls.push(params.sessionIds);
        return {
          results: params.sessionIds.map((sessionId) => ({
            preview: previewOf(sessionId),
          })),
        };
      },
      async previewSessionDeletion() {
        throw new Error("不应逐项调用");
      },
      async executeSessionDeletion() {
        throw new Error("not used");
      },
    };
    const taskIds = Array.from(
      { length: ARCHIVED_TASK_DELETION_PREVIEW_BATCH_SIZE + 2 },
      (_, index) => `task-${index}`,
    );
    const service = createArchivedTaskPermanentDeletionService(port);
    const result = await service.previewArchivedTaskDeletions({
      workspacePath: "/work",
      taskIds: [...taskIds, "task-1"],
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toHaveLength(ARCHIVED_TASK_DELETION_PREVIEW_BATCH_SIZE);
    expect(calls[1]).toEqual(["task-20", "task-21"]);
    expect(result.items.map((item) => item.taskId)).toEqual(taskIds);
    expect(result.items[0]?.preview).toMatchObject({
      taskId: "task-0",
      revision: "rev-task-0",
      forks: [],
      retainedArtifacts: [],
    });
  });

  it("整批 method-not-found 时逐项回退，单项错误只记在该项", async () => {
    const batchError = Object.assign(new Error("Method not found"), { code: -32601 });
    const port: ArchivedTaskDeletionProtocolPort = {
      async previewSessionDeletions() {
        throw batchError;
      },
      async previewSessionDeletion(params) {
        if (params.sessionId === "bad") throw new Error("session-data.identity-mismatch");
        return {
          ...previewOf(params.sessionId),
          forks: [{ sessionId: "fork", title: "Fork" }],
          retainedArtifacts: [
            {
              sessionId: "other",
              artifactId: "artifact-1",
              fileName: "shared.png",
              referrers: [{ sessionId: "fork", title: "Fork" }],
            },
          ],
        };
      },
      async executeSessionDeletion() {
        throw new Error("not used");
      },
    };
    const service = createArchivedTaskPermanentDeletionService(port);
    const result = await service.previewArchivedTaskDeletions({
      workspacePath: "/work",
      taskIds: ["ok", "bad"],
    });

    expect(result.items[0]).toMatchObject({
      taskId: "ok",
      preview: {
        forks: [{ taskId: "fork", title: "Fork" }],
        retainedArtifacts: [
          {
            taskId: "other",
            fileName: "shared.png",
            referrers: [{ taskId: "fork", title: "Fork" }],
          },
        ],
      },
    });
    expect(result.items[1]).toEqual({
      taskId: "bad",
      errorCode: "session-data.identity-mismatch",
    });
  });

  it("非 method-not-found 的批量失败不降级，逐项记录同一错误码", async () => {
    let singleCalls = 0;
    const port: ArchivedTaskDeletionProtocolPort = {
      async previewSessionDeletions() {
        throw new Error("session-data.unavailable");
      },
      async previewSessionDeletion() {
        singleCalls += 1;
        throw new Error("不应调用");
      },
      async executeSessionDeletion() {
        throw new Error("not used");
      },
    };
    const service = createArchivedTaskPermanentDeletionService(port);
    const result = await service.previewArchivedTaskDeletions({
      workspacePath: "/work",
      taskIds: ["a", "b"],
    });

    expect(singleCalls).toBe(0);
    expect(result.items).toEqual([
      { taskId: "a", errorCode: "session-data.unavailable" },
      { taskId: "b", errorCode: "session-data.unavailable" },
    ]);
  });

  it("执行结果按项映射，请求失败不抛出而是标记 incomplete", async () => {
    const executed: Array<{ sessionId: string; revision: string; operationId: string }> = [];
    const port: ArchivedTaskDeletionProtocolPort = {
      async previewSessionDeletions() {
        return { results: [] };
      },
      async previewSessionDeletion() {
        throw new Error("not used");
      },
      async executeSessionDeletion(params) {
        executed.push({
          sessionId: params.sessionId,
          revision: params.revision,
          operationId: params.operationId,
        });
        if (params.sessionId === "blocked") {
          return {
            sessionId: params.sessionId,
            status: "blocked",
            sessionIds: [params.sessionId],
            retainedArtifacts: 0,
            reason: "running",
          };
        }
        if (params.sessionId === "broken") throw new Error("rpc closed");
        return {
          sessionId: params.sessionId,
          status: "deleted",
          sessionIds: [params.sessionId, "child"],
          retainedArtifacts: 2,
        };
      },
    };
    const service = createArchivedTaskPermanentDeletionService(port);

    await expect(
      service.permanentlyDeleteArchivedTask({
        workspacePath: "/work",
        taskId: "ok",
        revision: "rev",
        operationId: "op",
      }),
    ).resolves.toEqual({
      taskId: "ok",
      status: "deleted",
      sessionIds: ["ok", "child"],
      retainedArtifacts: 2,
    });
    await expect(
      service.permanentlyDeleteArchivedTask({
        workspacePath: "/work",
        taskId: "blocked",
        revision: "rev",
        operationId: "op",
      }),
    ).resolves.toEqual({
      taskId: "blocked",
      status: "blocked",
      sessionIds: ["blocked"],
      retainedArtifacts: 0,
      reason: "running",
    });
    await expect(
      service.permanentlyDeleteArchivedTask({
        workspacePath: "/work",
        taskId: "broken",
        revision: "rev",
        operationId: "op",
      }),
    ).resolves.toEqual({
      taskId: "broken",
      status: "incomplete",
      sessionIds: [],
      retainedArtifacts: 0,
      reason: "rpc closed",
    });
    expect(executed).toEqual([
      { sessionId: "ok", revision: "rev", operationId: "op" },
      { sessionId: "blocked", revision: "rev", operationId: "op" },
      { sessionId: "broken", revision: "rev", operationId: "op" },
    ]);
  });
});
