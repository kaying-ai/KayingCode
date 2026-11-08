import { describe, expect, it, vi } from "vitest";
import { createWindowHostControllerRuntime } from "./windowHostControllerService.js";

function meta(taskId: string, workspacePath: string) {
  return {
    taskId,
    workspacePath,
    title: taskId,
    status: "idle",
    createdAt: 1,
    updatedAt: 1,
    traceId: taskId,
    provider: "test",
    mode: "default",
    model: "test",
  } as never;
}

describe("window controller host scope", () => {
  it("delegates host-scoped lists to the persistent owner and overlays local live status", async () => {
    const readHostTaskList = vi.fn(async () => ({
      items: [meta("t1", "/w")],
      total: 1,
      hasMore: false,
    }));
    const runtime = createWindowHostControllerRuntime({
      createId: () => "id",
      readHostTaskList,
      resolveSource: () => null,
    });

    const result = await runtime.service.listTaskList({
      kind: "all",
      workspaceScopes: "host",
      sortBy: "updated",
    });

    expect(readHostTaskList).toHaveBeenCalledWith({
      kind: "all",
      workspaceScopes: "host",
      sortBy: "updated",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      taskId: "t1",
      sourceAvailability: "online",
      liveStatus: "idle",
    });
  });

  it("reads task meta from the source owner and rejects a replaced source", async () => {
    let current = {
      getTaskMeta: vi.fn(async () => meta("t1", "/w")),
    };
    const runtime = createWindowHostControllerRuntime({
      createId: () => "id",
      readHostTaskList: async () => ({ items: [], total: 0, hasMore: false }),
      resolveSource: () => ({
        scope: { kind: "local" as const, workspacePath: "/w" },
        taskService: current as never,
        sourceAvailability: "online" as const,
      }),
    });

    await expect(
      runtime.service.getTaskMeta!({
        address: { taskId: "t1", workspacePath: "/w" },
      }),
    ).resolves.toMatchObject({ taskId: "t1" });

    current = {
      getTaskMeta: vi.fn(async () => {
        // 读取期间 source 被替换：返回前再解析时必须发现服务换代。
        current = { getTaskMeta: vi.fn(async () => meta("t1", "/w")) };
        return meta("t1", "/w");
      }),
    };
    await expect(
      runtime.service.getTaskMeta!({
        address: { taskId: "t1", workspacePath: "/w" },
      }),
    ).rejects.toThrow("任务读取期间 source 已失效");
  });
});
