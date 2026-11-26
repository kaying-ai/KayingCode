import { describe, expect, it, vi } from "vitest";
import type { CommandEnvelope } from "@zcode/shared/kayingcode-protocol-v4";
import {
  queueHandlers,
  V4QueueEditLockLostError,
  V4QueueItemEditLockedError,
  V4QueueItemNotEditableError,
  V4QueueItemReservedError,
} from "../src/kayingcode-protocol-v4/commands/handlers/queue.js";
import { V4CommandNoopError } from "../src/kayingcode-protocol-v4/v4-gateway.js";
import type {
  V4CommandCoreHost,
  V4SessionRecordView,
} from "../src/kayingcode-protocol-v4/commands/types.js";

const SESSION_ID = "session-queue-edit-lock";

function command(type: string, payload: Record<string, unknown>, clientId = "client-1") {
  return {
    commandId: `command-${type}`,
    clientId,
    sessionId: SESSION_ID,
    type,
    payload,
    issuedAt: 1,
  } as unknown as CommandEnvelope;
}

function createHost(
  options: {
    queueItem?: Record<string, unknown> | null;
    editLock?: Record<string, unknown> | undefined;
  } = {},
) {
  const queueItem =
    options.queueItem === undefined
      ? {
          queueItemId: "q1",
          kind: "sendText",
          text: "hello",
          sourceCommandId: "command-origin",
          attachments: [],
          dispatch: { state: "queued" },
          modelSelection: { providerId: "provider-1", modelId: "model-1" },
        }
      : options.queueItem;
  const getPendingInputEditLock = vi.fn(() => options.editLock);
  const lockQueueItemEdit = vi.fn(async () => "locked");
  const releaseQueueItemEdit = vi.fn(async () => true);
  const editQueueItem = vi.fn(async () => "edited");
  const removeQueueItem = vi.fn(async () => true);
  const reorderQueueItem = vi.fn(async () => true);
  const reserveQueueItem = vi.fn(async () => true);
  const app = {
    sessionId: SESSION_ID,
    runtime: { getPendingInputEditLock },
    lockQueueItemEdit,
    releaseQueueItemEdit,
    editQueueItem,
    removeQueueItem,
    reorderQueueItem,
    reserveQueueItem,
  };
  const afterLegacyStateMutation = vi.fn(async () => undefined);
  const deleteQueuedTurnExecution = vi.fn();
  const host = {
    getRecord: (sessionId: string): V4SessionRecordView | undefined =>
      sessionId === SESSION_ID
        ? ({
            app,
            traceContext: { sessionId: SESSION_ID, traceId: "trace-1" },
            workspace: { workspacePath: "/workspace" },
            persistence: "immediate",
          } as unknown as V4SessionRecordView)
        : undefined,
    getQueueItem: vi.fn(() => queueItem as never),
    afterLegacyStateMutation,
    deleteQueuedTurnExecution,
    logger: { warn: vi.fn() },
  } as unknown as V4CommandCoreHost;
  return {
    host,
    mocks: {
      editQueueItem,
      lockQueueItemEdit,
      releaseQueueItemEdit,
      removeQueueItem,
      reorderQueueItem,
      reserveQueueItem,
    },
    afterLegacyStateMutation,
    deleteQueuedTurnExecution,
  };
}

describe("v4 queue edit lock handler", () => {
  it("lockQueueItemEdit 注入可信 clientId/inputOrigin 并透传 editorId", async () => {
    const { host, mocks } = createHost();
    const envelope = command("lockQueueItemEdit", { queueItemId: "q1", editorId: "editor-a" });
    envelope.inputOrigin = "mobile";
    await expect(queueHandlers.lockQueueItemEdit(host, envelope)).resolves.toBeUndefined();
    expect(mocks.lockQueueItemEdit).toHaveBeenCalledWith("q1", {
      editorId: "editor-a",
      clientId: "client-1",
      inputOrigin: "mobile",
    });
  });

  it("lockQueueItemEdit 把 core 裁决映射成可判别错误", async () => {
    const cases: Array<[string, new (id: string) => Error]> = [
      ["reserved", V4QueueItemReservedError],
      ["lockedByOther", V4QueueItemEditLockedError],
    ];
    for (const [result, errorType] of cases) {
      const { host, mocks } = createHost();
      mocks.lockQueueItemEdit.mockResolvedValue(result);
      await expect(
        queueHandlers.lockQueueItemEdit(
          host,
          command("lockQueueItemEdit", { queueItemId: "q1", editorId: "editor-a" }),
        ),
      ).rejects.toBeInstanceOf(errorType);
    }
    const { host, mocks } = createHost();
    mocks.lockQueueItemEdit.mockResolvedValue("missing");
    await expect(
      queueHandlers.lockQueueItemEdit(
        host,
        command("lockQueueItemEdit", { queueItemId: "q1", editorId: "editor-a" }),
      ),
    ).rejects.toMatchObject({ reasonCode: "queue.itemMissing" });
  });

  it("lockQueueItemEdit 拒绝 compact 项", async () => {
    const { host } = createHost({
      queueItem: { queueItemId: "q1", kind: "compact", dispatch: { state: "queued" } },
    });
    await expect(
      queueHandlers.lockQueueItemEdit(
        host,
        command("lockQueueItemEdit", { queueItemId: "q1", editorId: "editor-a" }),
      ),
    ).rejects.toBeInstanceOf(V4QueueItemNotEditableError);
  });

  it("releaseQueueItemEdit 无锁时报 noop，成功时重评自动续跑", async () => {
    const { host, mocks, afterLegacyStateMutation } = createHost();
    mocks.releaseQueueItemEdit.mockResolvedValueOnce(false);
    await expect(
      queueHandlers.releaseQueueItemEdit(
        host,
        command("releaseQueueItemEdit", { queueItemId: "q1" }),
      ),
    ).rejects.toMatchObject({ reasonCode: "queue.editLockMissing" });
    await expect(
      queueHandlers.releaseQueueItemEdit(
        host,
        command("releaseQueueItemEdit", { queueItemId: "q1" }),
      ),
    ).resolves.toBeUndefined();
    expect(afterLegacyStateMutation).toHaveBeenCalledWith(
      expect.anything(),
      "queue_edit_lock_released",
    );
  });

  it("冻结项拒绝删除、重排与立即发送", async () => {
    const lock = { editorId: "editor-a", clientId: "client-1" };
    {
      const { host, mocks } = createHost({ editLock: lock });
      await expect(
        queueHandlers.deleteQueueItem(host, command("deleteQueueItem", { queueItemId: "q1" })),
      ).rejects.toBeInstanceOf(V4QueueItemEditLockedError);
      expect(mocks.removeQueueItem).not.toHaveBeenCalled();
    }
    {
      const { host, mocks } = createHost({ editLock: lock });
      await expect(
        queueHandlers.reorderQueueItem(
          host,
          command("reorderQueueItem", { queueItemId: "q1", beforeQueueItemId: null }),
        ),
      ).rejects.toBeInstanceOf(V4QueueItemEditLockedError);
      expect(mocks.reorderQueueItem).not.toHaveBeenCalled();
    }
    {
      const { host, mocks } = createHost({ editLock: lock });
      await expect(
        queueHandlers.sendQueuedNow(host, command("sendQueuedNow", { queueItemId: "q1" })),
      ).rejects.toBeInstanceOf(V4QueueItemEditLockedError);
      expect(mocks.reserveQueueItem).not.toHaveBeenCalled();
    }
  });

  it("editQueueItem 把锁裁决映射成错误或成功写回", async () => {
    {
      const { host, mocks } = createHost({ editLock: { editorId: "editor-a", clientId: "c" } });
      mocks.editQueueItem.mockResolvedValue("editLocked");
      await expect(
        queueHandlers.editQueueItem(
          host,
          command("editQueueItem", { queueItemId: "q1", newText: "x" }),
        ),
      ).rejects.toBeInstanceOf(V4QueueItemEditLockedError);
    }
    {
      const { host, mocks } = createHost();
      mocks.editQueueItem.mockResolvedValue("lockLost");
      await expect(
        queueHandlers.editQueueItem(
          host,
          command("editQueueItem", { queueItemId: "q1", newText: "x", editorId: "editor-b" }),
        ),
      ).rejects.toBeInstanceOf(V4QueueEditLockLostError);
    }
    {
      const { host, mocks } = createHost();
      mocks.editQueueItem.mockResolvedValue("missing");
      await expect(
        queueHandlers.editQueueItem(
          host,
          command("editQueueItem", { queueItemId: "q1", newText: "x" }),
        ),
      ).rejects.toBeInstanceOf(V4CommandNoopError);
    }
    {
      const { host, mocks, afterLegacyStateMutation, deleteQueuedTurnExecution } = createHost();
      await expect(
        queueHandlers.editQueueItem(
          host,
          command("editQueueItem", {
            queueItemId: "q1",
            newText: "edited",
            editorId: "editor-a",
            modelSelection: { providerId: "provider-2", modelId: "model-2" },
            mode: "guarded",
            planEnabled: true,
          }),
        ),
      ).resolves.toBeUndefined();
      expect(mocks.editQueueItem).toHaveBeenCalledWith("q1", "edited", {
        editorId: "editor-a",
        modelSelection: { providerId: "provider-2", modelId: "model-2" },
        mode: "guarded",
        planEnabled: true,
        // 模型变化必须丢弃入队时冻结的 Highspeed 卡与凭据。
        dropHighspeed: true,
      });
      expect(deleteQueuedTurnExecution).toHaveBeenCalledWith(SESSION_ID, "command-origin");
      expect(afterLegacyStateMutation).toHaveBeenCalledWith(expect.anything(), "queue_item_edited");
    }
  });

  it("applyQueueItemsConfig 跳过非 queued/compact 项，全部跳过 = noop", async () => {
    const { host, mocks } = createHost();
    mocks.editQueueItem.mockResolvedValue("edited");
    await expect(
      queueHandlers.applyQueueItemsConfig(
        host,
        command("applyQueueItemsConfig", { queueItemIds: ["q1"], mode: "build" }),
      ),
    ).resolves.toBeUndefined();
    expect(mocks.editQueueItem).toHaveBeenCalledWith("q1", undefined, { mode: "build" });

    const compact = createHost({
      queueItem: { queueItemId: "q1", kind: "compact", dispatch: { state: "queued" } },
    });
    await expect(
      queueHandlers.applyQueueItemsConfig(
        compact.host,
        command("applyQueueItemsConfig", { queueItemIds: ["q1"], mode: "build" }),
      ),
    ).rejects.toBeInstanceOf(V4CommandNoopError);
  });
});
