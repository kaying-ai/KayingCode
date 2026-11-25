// 归档永久删除协议面：单项预检、批量预检（1–100、按序 preview/error）与执行参数/结果。
import { describe, expect, it } from "vitest";
import {
  V4_METHODS,
  V4_SESSION_DELETION_PREVIEW_BATCH_MAX,
  v4SessionDeletionExecuteParamsSchema,
  v4SessionDeletionParamsSchema,
  v4SessionDeletionPreviewBatchItemSchema,
  v4SessionDeletionPreviewBatchParamsSchema,
  v4SessionDeletionPreviewBatchResultSchema,
  v4SessionDeletionPreviewSchema,
  v4SessionDeletionResultSchema,
} from "../src/kayingcode-protocol-v4/index.js";

const params = { sessionId: "sess_1", workspace: { workspacePath: "/work/site" } };
const preview = {
  sessionId: "sess_1",
  revision: "rev",
  sessionIds: ["sess_1", "sess_1_child"],
  forks: [{ sessionId: "sess_1_fork", title: "fork" }],
  retainedArtifacts: [
    {
      sessionId: "sess_1",
      artifactId: "shared",
      fileName: "shared.png",
      referrers: [{ sessionId: "sess_1_fork", title: "fork" }],
    },
  ],
  deletedFiles: 2,
  incomplete: false,
  completed: false,
};

describe("v4 session deletion contract", () => {
  it("单项预检只接受安全会话 ID 与完整 workspace 身份", () => {
    expect(v4SessionDeletionParamsSchema.safeParse(params).success).toBe(true);
    expect(
      v4SessionDeletionParamsSchema.safeParse({
        ...params,
        workspace: { workspacePath: "/work/site", workspaceIdentity: "remote:host" },
      }).success,
    ).toBe(true);
    expect(
      v4SessionDeletionParamsSchema.safeParse({ ...params, sessionId: "../escape" }).success,
    ).toBe(false);
    expect(v4SessionDeletionParamsSchema.safeParse({ ...params, workspace: {} }).success).toBe(
      false,
    );
    expect(v4SessionDeletionParamsSchema.safeParse({ ...params, extra: 1 }).success).toBe(false);
  });

  it("预检结果包含 revision、owned tree、fork、保留附件与 blocked/incomplete 状态", () => {
    expect(v4SessionDeletionPreviewSchema.parse(preview)).toEqual(preview);
    expect(
      v4SessionDeletionPreviewSchema.parse({
        ...preview,
        blockedReason: "in-use",
        incomplete: true,
      }),
    ).toMatchObject({ blockedReason: "in-use", incomplete: true });
    expect(
      v4SessionDeletionPreviewSchema.safeParse({ ...preview, blockedReason: "unknown" }).success,
    ).toBe(false);
  });

  it("批量预检限制 1–100 项并拒绝多余字段", () => {
    expect(V4_SESSION_DELETION_PREVIEW_BATCH_MAX).toBe(100);
    expect(v4SessionDeletionPreviewBatchParamsSchema.safeParse({ items: [params] }).success).toBe(
      true,
    );
    expect(
      v4SessionDeletionPreviewBatchParamsSchema.safeParse({
        items: Array.from({ length: 100 }, () => params),
      }).success,
    ).toBe(true);
    expect(
      v4SessionDeletionPreviewBatchParamsSchema.safeParse({
        items: Array.from({ length: 101 }, () => params),
      }).success,
    ).toBe(false);
    expect(v4SessionDeletionPreviewBatchParamsSchema.safeParse({ items: [] }).success).toBe(false);
    expect(
      v4SessionDeletionPreviewBatchParamsSchema.safeParse({ items: [params], extra: 1 }).success,
    ).toBe(false);
  });

  it("批量结果按 items 顺序接受 preview 或单项 error", () => {
    const result = {
      results: [
        { preview },
        { error: { code: "session-data.identity-mismatch" } },
        { preview: { ...preview, blockedReason: "not-found" } },
      ],
    };
    expect(v4SessionDeletionPreviewBatchResultSchema.parse(result)).toEqual(result);
    expect(v4SessionDeletionPreviewBatchItemSchema.safeParse({ error: { code: "" } }).success).toBe(
      false,
    );
    expect(
      v4SessionDeletionPreviewBatchItemSchema.safeParse({ preview, error: { code: "x" } }).success,
    ).toBe(false);
  });

  it("执行必须携带 revision 与 operationId", () => {
    expect(
      v4SessionDeletionExecuteParamsSchema.safeParse({
        ...params,
        revision: "rev",
        operationId: "op",
      }).success,
    ).toBe(true);
    expect(
      v4SessionDeletionExecuteParamsSchema.safeParse({ ...params, revision: "rev" }).success,
    ).toBe(false);
    expect(
      v4SessionDeletionExecuteParamsSchema.safeParse({ ...params, operationId: "op" }).success,
    ).toBe(false);
    expect(
      v4SessionDeletionExecuteParamsSchema.safeParse({
        ...params,
        revision: "",
        operationId: "op",
      }).success,
    ).toBe(false);
    expect(
      v4SessionDeletionExecuteParamsSchema.safeParse({
        ...params,
        revision: "rev",
        operationId: "op",
        extra: 1,
      }).success,
    ).toBe(false);
  });

  it("执行结果为 deleted/blocked/incomplete，blocked 可带原因", () => {
    for (const status of ["deleted", "blocked", "incomplete"] as const)
      expect(
        v4SessionDeletionResultSchema.parse({
          sessionId: "sess_1",
          status,
          sessionIds: ["sess_1"],
          retainedArtifacts: 1,
        }),
      ).toMatchObject({ status });
    expect(
      v4SessionDeletionResultSchema.safeParse({
        sessionId: "sess_1",
        status: "blocked",
        sessionIds: [],
        retainedArtifacts: 0,
        reason: "changed",
      }).success,
    ).toBe(true);
    expect(
      v4SessionDeletionResultSchema.safeParse({
        sessionId: "sess_1",
        status: "unknown",
        sessionIds: [],
        retainedArtifacts: 0,
      }).success,
    ).toBe(false);
  });

  it("方法名冻结在 V4_METHODS", () => {
    expect(V4_METHODS.sessionDeletionPreview).toBe("v4/storage/sessionData/deletionPreview");
    expect(V4_METHODS.sessionDeletionPreviewBatch).toBe(
      "v4/storage/sessionData/deletionPreviewBatch",
    );
    expect(V4_METHODS.sessionDeletionExecute).toBe("v4/storage/sessionData/deletionExecute");
  });
});
