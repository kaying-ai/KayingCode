import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type {
  ModelNetworkStatusEvent,
  ModelRequestAdmission,
  ModelRequestAdmissionTicket,
} from "@zcode/contracts";

export interface ReviewSessionBinding {
  codeId: string;
  deviceId: string;
  tokenLimit: number;
}

interface BudgetLedger {
  codeId?: string;
  deviceId?: string;
  usedTokens: number;
  events: Record<string, number>;
  pending: string | null;
  uncertain: boolean;
}

const EMPTY_LEDGER: BudgetLedger = { usedTokens: 0, events: {}, pending: null, uncertain: false };

export function reviewSessionBindingPath(root: string, sessionId: string): string {
  const key = createHash("sha256").update(sessionId).digest("hex");
  return join(root, "sessions", `${key}.json`);
}

function deviceKey(codeId: string, deviceId: string): string {
  return createHash("sha256").update(`${codeId}\0${deviceId}`).digest("hex");
}

async function writeAtomic(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function writeReviewSessionBinding(
  root: string,
  sessionId: string,
  binding: ReviewSessionBinding,
): Promise<void> {
  if (!Number.isSafeInteger(binding.tokenLimit) || binding.tokenLimit <= 0) {
    throw new Error("review.tokenLimit.invalid");
  }
  await mkdir(join(root, "sessions"), { recursive: true, mode: 0o700 });
  await writeAtomic(reviewSessionBindingPath(root, sessionId), binding);
}

async function readBinding(root: string, sessionId: string): Promise<ReviewSessionBinding> {
  const parsed = JSON.parse(await readFile(reviewSessionBindingPath(root, sessionId), "utf8")) as ReviewSessionBinding;
  if (!parsed.codeId || !parsed.deviceId || !Number.isSafeInteger(parsed.tokenLimit) || parsed.tokenLimit <= 0) {
    throw new Error("review.binding.invalid");
  }
  return parsed;
}

async function readLedger(path: string): Promise<BudgetLedger> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as BudgetLedger;
    if (!Number.isSafeInteger(value.usedTokens) || value.usedTokens < 0 || !value.events || typeof value.events !== "object") {
      throw new Error("review.ledger.invalid");
    }
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY_LEDGER, events: {} };
    throw error;
  }
}

/**
 * 进程间 mkdir 锁 + durable pending：崩溃留下的未结算调用会阻断后续请求，
 * 不把未知用量当作零。每次 provider attempt 的完成事件入账后才释放锁。
 */
export function createReviewModelBudgetAdmission(
  root: string,
  sessionId: string,
): ModelRequestAdmission {
  if (!isAbsolute(root)) throw new Error("KAYINGCODE_REVIEW_BUDGET_DIR must be absolute");
  return {
    async acquire({ signal }): Promise<ModelRequestAdmissionTicket> {
      const binding = await readBinding(root, sessionId);
      const key = deviceKey(binding.codeId, binding.deviceId);
      await mkdir(join(root, "devices"), { recursive: true, mode: 0o700 });
      const lockPath = join(root, "devices", `${key}.lock`);
      const ledgerPath = join(root, "devices", `${key}.json`);
      const deadline = Date.now() + 15_000;
      for (;;) {
        if (signal?.aborted) throw signal.reason;
        try {
          await mkdir(lockPath, { mode: 0o700 });
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          if (Date.now() >= deadline) throw new Error("review.budget.locked");
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
      let ledger: BudgetLedger;
      try {
        ledger = await readLedger(ledgerPath);
        if ((ledger.codeId && ledger.codeId !== binding.codeId) ||
            (ledger.deviceId && ledger.deviceId !== binding.deviceId)) {
          throw new Error("review.budget.ownerMismatch");
        }
        ledger.codeId = binding.codeId;
        ledger.deviceId = binding.deviceId;
        if (ledger.uncertain || ledger.pending !== null || ledger.usedTokens >= binding.tokenLimit) {
          throw new Error("review.budget.exhausted_or_uncertain");
        }
        ledger.pending = `${sessionId}:${randomUUID()}`;
        await writeAtomic(ledgerPath, ledger);
      } catch (error) {
        await rm(lockPath, { recursive: true, force: true });
        throw error;
      }
      let settled = false;
      return {
        async publish(event: ModelNetworkStatusEvent) {
          if (settled || event.type !== "model_request_completed") return;
          settled = true;
          const input = event.usage?.inputTokens;
          const output = event.usage?.outputTokens;
          const id = createHash("sha256")
            .update(`${sessionId}\0${event.requestId}\0${event.attempt}`)
            .digest("hex");
          if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input! < 0 || output! < 0) {
            ledger.uncertain = true;
          } else if (ledger.events[id] === undefined) {
            const total = input! + output!;
            if (!Number.isSafeInteger(total) || !Number.isSafeInteger(ledger.usedTokens + total)) {
              ledger.uncertain = true;
              ledger.pending = null;
              await writeAtomic(ledgerPath, ledger);
              return;
            }
            ledger.events[id] = total;
            ledger.usedTokens += total;
          }
          ledger.pending = null;
          await writeAtomic(ledgerPath, ledger);
        },
        release() {
          // 异常/取消/失败没有可确认的用量事件，pending 留在磁盘，后续准入失败关闭。
          void rm(lockPath, { recursive: true, force: true });
        },
      };
    },
  };
}
