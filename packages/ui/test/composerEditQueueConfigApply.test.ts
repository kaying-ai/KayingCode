// 编辑提交后应用到其他排队消息（docs/ui/composer-edit-mode.md）：候选项与字段只从当前投影派生。
import { describe, expect, it } from "vitest";
import { HIGHSPEED_PROVIDER_IDS } from "@zcode/shared";
import { planQueueConfigApply } from "../src/composer-edit-mode/index.js";

function item(
  queueItemId: string,
  overrides: {
    state?: "queued" | "reserved" | "promoting";
    kind?: "sendText" | "sendGoalCommand" | "compact";
    editLock?: { editorId: string; clientId: string };
    mode?: "build" | "yolo";
    providerId?: string;
    modelId?: string;
    reasoningLevel?: string;
  } = {},
) {
  return {
    queueItemId,
    kind: overrides.kind ?? "sendText",
    dispatch: { state: overrides.state ?? "queued" },
    ...(overrides.editLock ? { editLock: overrides.editLock } : {}),
    ...(overrides.mode ? { mode: overrides.mode } : {}),
    ...(overrides.providerId
      ? {
          modelSelection: {
            providerId: overrides.providerId,
            modelId: overrides.modelId ?? "m",
            ...(overrides.reasoningLevel
              ? { options: { reasoningLevel: overrides.reasoningLevel } }
              : {}),
          },
        }
      : {}),
  } as never;
}

describe("planQueueConfigApply", () => {
  it("只选仍在排队、无锁、非 compact、且配置不同的项", () => {
    const plan = planQueueConfigApply(
      [
        item("a"),
        item("b", { editLock: { editorId: "e", clientId: "c" } }),
        item("c", { state: "reserved" }),
        item("d", { kind: "compact" }),
        item("e", { mode: "build" }),
      ],
      { mode: "yolo" },
      "self",
    );
    expect(plan).toEqual({ queueItemIds: ["a", "e"], mode: "yolo" });
  });

  it("排除本次编辑项；都相同返回 null（不提示）", () => {
    expect(planQueueConfigApply([item("a", { mode: "yolo" })], { mode: "yolo" })).toBeNull();
    expect(planQueueConfigApply([item("a", { mode: "build" })], { mode: "yolo" }, "a")).toBeNull();
  });

  it("只带实际变化的字段：模型相同只带 mode", () => {
    const plan = planQueueConfigApply(
      [item("a", { mode: "build", providerId: "p", modelId: "m" })],
      {
        mode: "yolo",
        modelSelection: { providerId: "p", modelId: "m" },
      },
    );
    expect(plan).toEqual({ queueItemIds: ["a"], mode: "yolo" });
  });

  it("只带实际变化的字段：mode 相同只带模型（含 reasoning）", () => {
    const plan = planQueueConfigApply(
      [item("a", { mode: "yolo", providerId: "p", modelId: "m", reasoningLevel: "low" })],
      {
        mode: "yolo",
        modelSelection: {
          providerId: "p",
          modelId: "m",
          options: { reasoningLevel: "high" },
        },
      },
    );
    expect(plan).toEqual({
      queueItemIds: ["a"],
      modelSelection: { providerId: "p", modelId: "m", options: { reasoningLevel: "high" } },
    });
  });

  it("Highspeed 单轮模型不作为排队项模型应用", () => {
    expect(
      planQueueConfigApply([item("a")], {
        modelSelection: { providerId: HIGHSPEED_PROVIDER_IDS.zai, modelId: "fast" },
      }),
    ).toBeNull();
  });
});
