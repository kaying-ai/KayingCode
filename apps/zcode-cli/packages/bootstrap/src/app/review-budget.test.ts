import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ModelNetworkStatusEvent } from "@zcode/contracts";
import { createReviewModelBudgetAdmission } from "./review-budget.js";

async function bind(root: string, sessionId: string, deviceId: string, tokenLimit: number) {
  await mkdir(join(root, "sessions"), { recursive: true });
  const name = createHash("sha256").update(sessionId).digest("hex");
  await writeFile(join(root, "sessions", `${name}.json`), JSON.stringify({
    codeId: "review-1", deviceId, tokenLimit,
  }));
}

function completed(id: string, inputTokens: number, outputTokens: number): ModelNetworkStatusEvent {
  return {
    type: "model_request_completed", requestId: id, attempt: 1,
    usage: { inputTokens, outputTokens },
  } as ModelNetworkStatusEvent;
}

test("审核额度按设备持久结算并在每次模型调用前拦截", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-budget-"));
  try {
    await bind(root, "session-a", "device-a", 10);
    await bind(root, "session-b", "device-b", 10);
    const a = createReviewModelBudgetAdmission(root, "session-a");
    const ticket = await a.acquire({ model: { providerId: "test", modelId: "test" } });
    await ticket.publish(completed("call-1", 6, 4));
    ticket.release();
    await assert.rejects(
      createReviewModelBudgetAdmission(root, "session-a").acquire({ model: { providerId: "test", modelId: "test" } }),
      /exhausted/,
    );
    const other = await createReviewModelBudgetAdmission(root, "session-b").acquire({
      model: { providerId: "test", modelId: "test" },
    });
    await other.publish(completed("call-2", 1, 1));
    other.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("没有用量完成事件的模型调用在重启后继续失败关闭", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-budget-"));
  try {
    await bind(root, "session-a", "device-a", 10);
    const ticket = await createReviewModelBudgetAdmission(root, "session-a").acquire({
      model: { providerId: "test", modelId: "test" },
    });
    ticket.release();
    await assert.rejects(
      createReviewModelBudgetAdmission(root, "session-a").acquire({ model: { providerId: "test", modelId: "test" } }),
      /uncertain/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("同一设备跨会话的同名调用保留各自稳定用量事件", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-budget-"));
  try {
    await bind(root, "session-a", "device-a", 20);
    await bind(root, "session-b", "device-a", 20);
    for (const sessionId of ["session-a", "session-b"]) {
      const ticket = await createReviewModelBudgetAdmission(root, sessionId).acquire({ model: { providerId: "test", modelId: "test" } });
      await ticket.publish(completed("same-call", 2, 3));
      ticket.release();
    }
    const key = createHash("sha256").update("review-1\0device-a").digest("hex");
    const ledger = JSON.parse(await readFile(join(root, "devices", `${key}.json`), "utf8")) as {
      codeId: string; deviceId: string; usedTokens: number; events: Record<string, number>;
    };
    assert.equal(ledger.codeId, "review-1");
    assert.equal(ledger.deviceId, "device-a");
    assert.equal(ledger.usedTokens, 10);
    const eventId = (sessionId: string) => createHash("sha256")
      .update(`${sessionId}\0same-call\0${1}`).digest("hex");
    assert.deepEqual(ledger.events, { [eventId("session-a")]: 5, [eventId("session-b")]: 5 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
