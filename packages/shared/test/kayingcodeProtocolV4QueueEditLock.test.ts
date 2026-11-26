// queue 编辑锁协议面（docs/ui/composer-edit-mode.md）：
// lock/release 命令、editQueueItem 的 editorId/attachments/config，以及 snapshot 的 editLock 投影。
import { describe, expect, it } from "vitest";
import {
  COMMANDS_REQUIRING_BASE_REVISION,
  parseCommandEnvelope,
  queueItemEditLockSchema,
  queueItemSchema,
  commandPayloadSchemas,
} from "../src/kayingcode-protocol-v4/index.js";

const envelope = (type: string, payload: unknown) => ({
  commandId: "command-1",
  clientId: "client-1",
  sessionId: "session-1",
  type,
  payload,
  issuedAt: 1,
});

describe("v4 queue edit lock 协议", () => {
  it("lockQueueItemEdit 要求非空 editorId", () => {
    const schema = commandPayloadSchemas.lockQueueItemEdit;
    expect(schema.safeParse({ queueItemId: "q1", editorId: "editor-1" }).success).toBe(true);
    expect(schema.safeParse({ queueItemId: "q1", editorId: "" }).success).toBe(false);
    expect(schema.safeParse({ queueItemId: "q1" }).success).toBe(false);
  });

  it("releaseQueueItemEdit 只需 queueItemId", () => {
    const schema = commandPayloadSchemas.releaseQueueItemEdit;
    expect(schema.safeParse({ queueItemId: "q1" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("editQueueItem 不走 CAS：冻结编辑的并发保护是 CLI 编辑锁", () => {
    expect(COMMANDS_REQUIRING_BASE_REVISION.has("editQueueItem")).toBe(false);
    // 信封不带 baseRevision 也能解析（运行中 revision 抖动不再误拒排队消息编辑）。
    expect(
      parseCommandEnvelope(envelope("editQueueItem", { queueItemId: "q1", newText: "x" })).ok,
    ).toBe(true);
  });

  it("editQueueItem 保持旧形态可用，并接受 composer 编辑态字段", () => {
    const schema = commandPayloadSchemas.editQueueItem;
    // 普通编辑（不带 editorId）仍可用。
    expect(schema.safeParse({ queueItemId: "q1", newText: "plain" }).success).toBe(true);
    const full = schema.safeParse({
      queueItemId: "q1",
      newText: "edited",
      editorId: "editor-1",
      attachments: [],
      modelSelection: { providerId: "provider-1", modelId: "model-1" },
      mode: "guarded",
      planEnabled: true,
    });
    expect(full.success).toBe(true);
    expect(schema.safeParse({ queueItemId: "q1", newText: "x", editorId: "" }).success).toBe(false);
  });

  it("applyQueueItemsConfig 至少要带 modelSelection 或 mode", () => {
    const schema = commandPayloadSchemas.applyQueueItemsConfig;
    expect(schema.safeParse({ queueItemIds: ["q1"] }).success).toBe(false);
    expect(schema.safeParse({ queueItemIds: [], mode: "build" }).success).toBe(false);
    expect(schema.safeParse({ queueItemIds: ["q1"], mode: "build" }).success).toBe(true);
    expect(
      schema.safeParse({
        queueItemIds: ["q1"],
        modelSelection: { providerId: "provider-1", modelId: "model-1" },
      }).success,
    ).toBe(true);
  });

  it("parseCommandEnvelope 能找到新增命令", () => {
    expect(
      parseCommandEnvelope(envelope("lockQueueItemEdit", { queueItemId: "q1", editorId: "e1" })).ok,
    ).toBe(true);
    expect(parseCommandEnvelope(envelope("releaseQueueItemEdit", { queueItemId: "q1" })).ok).toBe(
      true,
    );
    expect(
      parseCommandEnvelope(
        envelope("applyQueueItemsConfig", { queueItemIds: ["q1"], mode: "plan" }),
      ).ok,
    ).toBe(true);
  });

  it("queueItem.editLock 严格解析锁归属", () => {
    expect(
      queueItemEditLockSchema.safeParse({ editorId: "editor-1", clientId: "client-1" }).success,
    ).toBe(true);
    expect(
      queueItemEditLockSchema.safeParse({
        editorId: "editor-1",
        clientId: "client-1",
        inputOrigin: "mobile",
      }).success,
    ).toBe(true);
    expect(queueItemEditLockSchema.safeParse({ editorId: "editor-1" }).success).toBe(false);
    expect(
      queueItemEditLockSchema.safeParse({
        editorId: "editor-1",
        clientId: "client-1",
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("queueItem 允许缺省 editLock（旧快照兼容）", () => {
    const base = {
      queueItemId: "q1",
      kind: "sendText",
      text: "hello",
      sourceCommandId: "command-1",
      clientId: "client-1",
      attachments: [],
      delivery: { requested: "queue", admitted: "queue" },
      order: { admissionSeq: 1, queuePosition: 0 },
      steer: { state: "notRequested" },
      dispatch: { state: "queued" },
      admittedAt: 1,
    };
    const unlocked = queueItemSchema.safeParse(base);
    expect(unlocked.success).toBe(true);
    expect(unlocked.success && unlocked.data.editLock).toBeUndefined();
    const locked = queueItemSchema.safeParse({
      ...base,
      editLock: { editorId: "editor-1", clientId: "client-1", inputOrigin: "desktop" },
    });
    expect(locked.success).toBe(true);
    expect(locked.success && locked.data.editLock?.editorId).toBe("editor-1");
  });
});
