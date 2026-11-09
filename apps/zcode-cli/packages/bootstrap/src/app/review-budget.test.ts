import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type {
  ModelNetworkStatusEvent,
  ModelRequestAdmission,
  ModelRequestAdmissionTicket,
} from "@zcode/contracts";
import {
  combineModelRequestAdmissions,
  createReviewModelBudgetAdmission,
  resolveReviewTokenBudgetConfig,
} from "./review-budget.js";

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

function completedUsage(
  id: string,
  usage: Record<string, number>,
): ModelNetworkStatusEvent {
  return {
    type: "model_request_completed", requestId: id, attempt: 1, usage,
  } as unknown as ModelNetworkStatusEvent;
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

test("部署级审核预算默认跨会话共享一份账本并按总 token 计数", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-budget-env-"));
  try {
    const env = {
      KAYINGCODE_REVIEW_TOKEN_BUDGET: "10",
      KAYINGCODE_REVIEW_BUDGET_DIR: root,
    };
    const sessionA = resolveReviewTokenBudgetConfig({ env, sessionId: "session-a" })!;
    const sessionB = resolveReviewTokenBudgetConfig({ env, sessionId: "session-b" })!;
    assert.equal(sessionA.options.defaultBinding?.codeId, "app-review");
    assert.equal(sessionA.options.defaultBinding?.deviceId, "app-review");
    assert.equal(sessionA.options.countTotalTokens, true);

    const ticket = await createReviewModelBudgetAdmission(
      sessionA.root,
      "session-a",
      sessionA.options,
    ).acquire({ model: { providerId: "test", modelId: "test" } });
    // input 为 0 时按缓存输入计数：8 + 3 = 11，已达到 10 的上限。
    await ticket.publish(
      completedUsage("call-1", { inputTokens: 0, outputTokens: 3, cacheReadTokens: 8 }),
    );
    ticket.release();

    await assert.rejects(
      createReviewModelBudgetAdmission(sessionB.root, "session-b", sessionB.options).acquire({
        model: { providerId: "test", modelId: "test" },
      }),
      /审核用量已达上限/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("session 范围每个任务独立计数，新任务不会继承旧账本", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-budget-session-"));
  try {
    const env = {
      KAYINGCODE_REVIEW_TOKEN_BUDGET: "10",
      KAYINGCODE_REVIEW_BUDGET_DIR: root,
      KAYINGCODE_REVIEW_BUDGET_SCOPE: "session",
    };
    const sessionA = resolveReviewTokenBudgetConfig({ env, sessionId: "session-a" })!;
    const sessionB = resolveReviewTokenBudgetConfig({ env, sessionId: "session-b" })!;
    assert.equal(sessionA.options.defaultBinding?.deviceId, "session-a");

    const first = await createReviewModelBudgetAdmission(
      sessionA.root,
      "session-a",
      sessionA.options,
    ).acquire({ model: { providerId: "test", modelId: "test" } });
    await first.publish(completed("call-1", 10, 0));
    first.release();
    await assert.rejects(
      createReviewModelBudgetAdmission(sessionA.root, "session-a", sessionA.options).acquire({
        model: { providerId: "test", modelId: "test" },
      }),
      /审核用量已达上限/,
    );

    const other = await createReviewModelBudgetAdmission(
      sessionB.root,
      "session-b",
      sessionB.options,
    ).acquire({ model: { providerId: "test", modelId: "test" } });
    other.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("审核预算环境变量非法或越界时 fail fast", () => {
  assert.equal(resolveReviewTokenBudgetConfig({ env: {}, sessionId: "session-a" }), undefined);
  assert.throws(
    () =>
      resolveReviewTokenBudgetConfig({
        env: { KAYINGCODE_REVIEW_TOKEN_BUDGET: "0" },
        sessionId: "session-a",
      }),
    /positive integer/,
  );
  assert.throws(
    () =>
      resolveReviewTokenBudgetConfig({
        env: { KAYINGCODE_REVIEW_TOKEN_BUDGET: "10" },
        sessionId: "session-a",
      }),
    /absolute path/,
  );
  assert.throws(
    () =>
      resolveReviewTokenBudgetConfig({
        env: {
          KAYINGCODE_REVIEW_TOKEN_BUDGET: "10",
          KAYINGCODE_REVIEW_BUDGET_DIR: "relative/path",
        },
        sessionId: "session-a",
      }),
    /absolute path/,
  );
  assert.throws(
    () =>
      resolveReviewTokenBudgetConfig({
        env: {
          KAYINGCODE_REVIEW_TOKEN_BUDGET: "10",
          KAYINGCODE_REVIEW_BUDGET_DIR: process.cwd(),
          KAYINGCODE_REVIEW_BUDGET_SCOPE: "global",
        },
        sessionId: "session-a",
      }),
    /environment.*session/,
  );
});

test("失败请求报告的用量也进入审核账本", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-budget-failed-"));
  try {
    const options = {
      defaultBinding: { codeId: "app-review", deviceId: "app-review", tokenLimit: 10 },
      countTotalTokens: true,
    };
    const ticket = await createReviewModelBudgetAdmission(root, "session-a", options).acquire({
      model: { providerId: "test", modelId: "test" },
    });
    await ticket.publish({
      type: "model_request_failed",
      requestId: "failed-1",
      attempt: 1,
      usage: { totalTokens: 10 },
      reason: "unknown",
      retryable: false,
      message: "failed",
    } as ModelNetworkStatusEvent);
    ticket.release();
    await assert.rejects(
      createReviewModelBudgetAdmission(root, "session-a", options).acquire({
        model: { providerId: "test", modelId: "test" },
      }),
      /exhausted/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("组合准入同时转发事件和释放，并在第二段失败时归还预算票据", async () => {
  const calls: string[] = [];
  const ticket = (name: string): ModelRequestAdmissionTicket => ({
    publish: async (event) => {
      calls.push(`${name}:publish:${event.type}`);
    },
    release: () => {
      calls.push(`${name}:release`);
    },
  });
  const budget: ModelRequestAdmission = { acquire: async () => ticket("budget") };
  const other: ModelRequestAdmission = { acquire: async () => ticket("other") };
  const combined = combineModelRequestAdmissions(budget, other);
  const combinedTicket = await combined.acquire({
    model: { providerId: "test", modelId: "test" },
  });
  await combinedTicket.publish({ type: "model_request_started" } as ModelNetworkStatusEvent);
  combinedTicket.release();
  combinedTicket.release();
  assert.deepEqual(calls, [
    "budget:publish:model_request_started",
    "other:publish:model_request_started",
    "budget:release",
    "other:release",
  ]);

  calls.length = 0;
  const failingOther: ModelRequestAdmission = {
    acquire: async () => {
      throw new Error("other rejected");
    },
  };
  await assert.rejects(
    combineModelRequestAdmissions(budget, failingOther).acquire({
      model: { providerId: "test", modelId: "test" },
    }),
    /other rejected/,
  );
  assert.deepEqual(calls, ["budget:release"]);
});

test("审核模式允许无用量的失败请求重试，不把单次网络错误当成额度耗尽", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-budget-retry-"));
  try {
    const options = {
      defaultBinding: { codeId: "app-review", deviceId: "app-review", tokenLimit: 10 },
      countTotalTokens: true,
      failClosedOnUnknownFailure: false,
    };
    const ticket = await createReviewModelBudgetAdmission(root, "session-a", options).acquire({
      model: { providerId: "test", modelId: "test" },
    });
    await ticket.publish({
      type: "model_request_failed",
      requestId: "network-1",
      attempt: 1,
      reason: "proxy_error",
      retryable: true,
      message: "network down",
    } as ModelNetworkStatusEvent);
    ticket.release();
    const retry = await createReviewModelBudgetAdmission(root, "session-a", options).acquire({
      model: { providerId: "test", modelId: "test" },
    });
    retry.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
