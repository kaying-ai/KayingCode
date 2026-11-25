import { describe, expect, it } from "vitest";
import {
  SessionEventType,
  createSessionId,
  createTraceId,
  type SessionEvent,
} from "@zcode/contracts";
import { createTestAgentRuntime } from "./test-agent-runtime.js";
import { createTestSessionEventStore } from "./test-event-store.js";
import { createTestModelFactory } from "./test-runtime-model.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createRuntimeHarness(
  sessionId = createSessionId("runtime-steer-edit-lock"),
  eventStore = createTestSessionEventStore(),
) {
  const modelStarted = deferred<void>();
  const finishModel = deferred<void>();
  const runtime = createTestAgentRuntime(
    sessionId,
    { mode: "build" },
    {
      eventStore,
      modelFactory: createTestModelFactory({
        async generateText() {
          modelStarted.resolve();
          await finishModel.promise;
          return {
            finishReason: "stop",
            providerMetadata: undefined,
            text: "first answer",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      } as never),
    },
  );
  return { runtime, eventStore, modelStarted, finishModel };
}

describe("composer queue edit lock", () => {
  it("freezes a queued input until the owning editor submits or releases it", async () => {
    // docs/ui/composer-edit-mode.md：编辑锁与 reservation 互斥；冻结期间不能被删除、重排、
    // 提升，只有持锁编辑器的 editPendingInputById 能写回并同时释放锁。
    const sessionId = createSessionId("runtime-steer-edit-lock");
    const { runtime, eventStore, modelStarted, finishModel } = createRuntimeHarness(sessionId);
    const traceContext = { sessionId, traceId: createTraceId("trace-edit-lock") };
    const pendingTurn = runtime.executeTurn("run while editing");
    await modelStarted.promise;
    const queued = await runtime.steerTurn({
      input: "edit me",
      delivery: "queue",
      intent: {
        sourceCommandId: "command-edit",
        queueItemId: "queue-edit",
        clientId: "desktop",
        kind: "sendText",
        admissionSeq: 1,
        admittedAt: 1,
        requestedDelivery: "queue",
        admittedDelivery: "queue",
        mode: "build",
      },
    });
    const other = await runtime.steerTurn({ input: "other", delivery: "queue" });
    if (queued.kind !== "queued" || other.kind !== "queued") {
      throw new Error("expected queued inputs");
    }
    const lock = { editorId: "editor-a", clientId: "desktop", inputOrigin: "desktop" as const };

    await expect(
      runtime.lockPendingInputEdit({
        pendingInputId: queued.pendingInputId,
        editLock: lock,
        traceContext,
      }),
    ).resolves.toBe("locked");
    // 同一编辑器重复加锁幂等；其他编辑器被拒绝。
    await expect(
      runtime.lockPendingInputEdit({
        pendingInputId: queued.pendingInputId,
        editLock: { ...lock, editorId: "editor-a" },
        traceContext,
      }),
    ).resolves.toBe("locked");
    await expect(
      runtime.lockPendingInputEdit({
        pendingInputId: queued.pendingInputId,
        editLock: { ...lock, editorId: "editor-b" },
        traceContext,
      }),
    ).resolves.toBe("lockedByOther");
    await expect(
      runtime.lockPendingInputEdit({
        pendingInputId: "missing-input",
        editLock: lock,
        traceContext,
      }),
    ).resolves.toBe("missing");
    expect(runtime.getPendingInputEditLock(queued.pendingInputId)).toEqual(lock);

    // 冻结项：reserve / 删除 / 重排都被拒绝；其他项不受影响。
    await expect(
      runtime.reservePendingInputById({
        pendingInputId: queued.pendingInputId,
        reservationId: "send-now",
        traceContext,
      }),
    ).resolves.toBe(false);
    await expect(
      runtime.removePendingInputById({
        pendingInputId: queued.pendingInputId,
        reason: "user_removed",
        traceContext,
      }),
    ).resolves.toBe(false);
    await expect(
      runtime.reorderPendingInput({
        pendingInputId: queued.pendingInputId,
        beforePendingInputId: null,
        traceContext,
      }),
    ).resolves.toBe(false);
    await expect(
      runtime.reorderPendingInput({
        pendingInputId: other.pendingInputId,
        beforePendingInputId: queued.pendingInputId,
        traceContext,
      }),
    ).resolves.toBe(true);

    // 未持锁的写回不能覆盖冻结项；声明错误编辑器视为锁已丢失。
    await expect(
      runtime.editPendingInputById({
        pendingInputId: queued.pendingInputId,
        newText: "overwrite",
        traceContext,
      }),
    ).resolves.toBe("editLocked");
    await expect(
      runtime.editPendingInputById({
        pendingInputId: queued.pendingInputId,
        newText: "overwrite",
        editorId: "editor-b",
        traceContext,
      }),
    ).resolves.toBe("lockLost");
    await expect(
      runtime.editPendingInputById({
        pendingInputId: queued.pendingInputId,
        newText: "overwrite",
        editorId: "editor-a",
        traceContext,
      }),
    ).resolves.toBe("edited");
    expect(runtime.getPendingInputEditLock(queued.pendingInputId)).toBeUndefined();

    const events = await eventStore.getEvents(sessionId);
    const lockEvents = events
      .filter((event) => event.type === SessionEventType.TurnSteerEditLockChanged)
      .map((event) => (event.payload as { editLock?: unknown }).editLock ?? null);
    expect(lockEvents).toEqual([lock, null]);
    const editedEvent = events
      .filter((event) => event.type === SessionEventType.TurnSteerQueued)
      .at(-1);
    expect(editedEvent?.payload).toMatchObject({
      pendingInputId: queued.pendingInputId,
      input: "overwrite",
      intent: { text: "overwrite" },
    });

    // 只改配置（applyQueueItemsConfig）：缺省 newText 保留原输入。
    await expect(
      runtime.editPendingInputById({
        pendingInputId: queued.pendingInputId,
        mode: "guarded",
        traceContext,
      }),
    ).resolves.toBe("edited");
    const configEdited = (await eventStore.getEvents(sessionId))
      .filter((event) => event.type === SessionEventType.TurnSteerQueued)
      .at(-1);
    expect(configEdited?.payload).toMatchObject({
      pendingInputId: queued.pendingInputId,
      input: "overwrite",
      intent: { text: "overwrite", mode: "guarded" },
    });

    // 解锁后恢复正常；reserve 后不能再被冻结。
    await expect(
      runtime.lockPendingInputEdit({
        pendingInputId: queued.pendingInputId,
        editLock: lock,
        traceContext,
      }),
    ).resolves.toBe("locked");
    await expect(
      runtime.releasePendingInputEdit({ pendingInputId: queued.pendingInputId, traceContext }),
    ).resolves.toBe(true);
    await expect(
      runtime.releasePendingInputEdit({ pendingInputId: queued.pendingInputId, traceContext }),
    ).resolves.toBe(false);
    await expect(
      runtime.reservePendingInputById({
        pendingInputId: queued.pendingInputId,
        reservationId: "send-now",
        traceContext,
      }),
    ).resolves.toBe(true);
    await expect(
      runtime.lockPendingInputEdit({
        pendingInputId: queued.pendingInputId,
        editLock: lock,
        traceContext,
      }),
    ).resolves.toBe("reserved");

    finishModel.resolve();
    await pendingTurn;
  });

  it("keeps the edit lock when the unlock event fails to persist", async () => {
    // 锁的内存状态与锁事件同生同灭：解锁事件写入失败时，投影仍显示锁，runtime 也必须仍持锁。
    const sessionId = createSessionId("runtime-steer-edit-lock-unlock-failure");
    const baseStore = createTestSessionEventStore();
    let failNextUnlock = true;
    const failingStore = new Proxy(baseStore, {
      get(target, property, receiver) {
        if (property === "append") {
          return async (event: SessionEvent) => {
            const unlocking =
              event.type === SessionEventType.TurnSteerEditLockChanged &&
              !(event.payload as { editLock?: unknown }).editLock;
            if (failNextUnlock && unlocking) {
              failNextUnlock = false;
              throw new Error("unlock append failed");
            }
            return target.append(event);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const { runtime, finishModel, modelStarted } = createRuntimeHarness(sessionId, failingStore);
    const traceContext = { sessionId, traceId: createTraceId("trace-edit-lock-unlock-failure") };
    const pendingTurn = runtime.executeTurn("run while editing");
    await modelStarted.promise;
    const queued = await runtime.steerTurn({ input: "edit me", delivery: "queue" });
    if (queued.kind !== "queued") throw new Error("expected queued input");
    const lock = { editorId: "editor-a", clientId: "desktop" };
    await runtime.lockPendingInputEdit({
      pendingInputId: queued.pendingInputId,
      editLock: lock,
      traceContext,
    });

    await expect(
      runtime.releasePendingInputEdit({ pendingInputId: queued.pendingInputId, traceContext }),
    ).rejects.toThrow("unlock append failed");
    expect(runtime.getPendingInputEditLock(queued.pendingInputId)).toEqual(lock);
    await expect(
      runtime.removePendingInputById({
        pendingInputId: queued.pendingInputId,
        reason: "user_removed",
        traceContext,
      }),
    ).resolves.toBe(false);
    // 重试成功后锁才消失。
    await expect(
      runtime.releasePendingInputEdit({ pendingInputId: queued.pendingInputId, traceContext }),
    ).resolves.toBe(true);
    expect(runtime.getPendingInputEditLock(queued.pendingInputId)).toBeUndefined();

    finishModel.resolve();
    await pendingTurn;
  });
});
