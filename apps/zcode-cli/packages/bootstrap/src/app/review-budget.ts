import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type {
  ModelNetworkStatusEvent,
  ModelRequestAdmission,
  ModelRequestAdmissionTicket,
  ModelUsage,
} from "@zcode/contracts";

export interface ReviewSessionBinding {
  codeId: string;
  deviceId: string;
  tokenLimit: number;
}

export interface ReviewModelBudgetOptions {
  /** 没有 session 绑定文件时使用的默认绑定；用于部署级审核额度。 */
  defaultBinding?: ReviewSessionBinding;
  /** 按 provider 报告的总 token（含缓存）计数；默认沿用 input+output。 */
  countTotalTokens?: boolean;
  /** 额度耗尽时抛出的用户可见文案。 */
  exhaustedMessage?: string;
  /** 用量无法确认时抛出的用户可见文案。 */
  uncertainMessage?: string;
  /**
   * 失败请求没有 usage 时是否保持 pending 并阻断后续请求。
   * 默认 true（代码审核模式）；审核环境可设为 false，按 0 结算以免单次网络错误卡死。
   */
  failClosedOnUnknownFailure?: boolean;
}

export interface ReviewTokenBudgetConfig {
  root: string;
  options: ReviewModelBudgetOptions;
}

/** provider 的 totalTokens 优先；否则按 input（为 0 时用 cache）加 output 计算。 */
function reviewUsageTotalTokens(usage: ModelUsage | undefined): number {
  if (!usage) return Number.NaN;
  if (Number.isSafeInteger(usage.totalTokens)) return usage.totalTokens!;
  const input =
    Number.isSafeInteger(usage.inputTokens) && usage.inputTokens! > 0
      ? usage.inputTokens!
      : (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
  const output = Number.isSafeInteger(usage.outputTokens) ? usage.outputTokens! : Number.NaN;
  return input + output;
}

function assertBinding(binding: ReviewSessionBinding, error: string): void {
  if (
    !binding.codeId ||
    !binding.deviceId ||
    !Number.isSafeInteger(binding.tokenLimit) ||
    binding.tokenLimit <= 0
  ) {
    throw new Error(error);
  }
}

/**
 * 从进程环境解析部署级审核预算。
 * `KAYINGCODE_REVIEW_TOKEN_BUDGET` 为正整数 token 上限；`KAYINGCODE_REVIEW_BUDGET_DIR` 必须为绝对路径。
 * `KAYINGCODE_REVIEW_BUDGET_SCOPE=environment`（默认）跨会话共享一份账本；`session` 每个会话独立计数。
 */
export function resolveReviewTokenBudgetConfig(input: {
  env?: NodeJS.ProcessEnv;
  sessionId: string;
}): ReviewTokenBudgetConfig | undefined {
  const env = input.env ?? process.env;
  const raw = env.KAYINGCODE_REVIEW_TOKEN_BUDGET?.trim();
  if (!raw) return undefined;
  const tokenLimit = Number(raw);
  if (!Number.isSafeInteger(tokenLimit) || tokenLimit <= 0) {
    throw new Error("KAYINGCODE_REVIEW_TOKEN_BUDGET must be a positive integer");
  }
  const root = env.KAYINGCODE_REVIEW_BUDGET_DIR?.trim();
  if (!root || !isAbsolute(root)) {
    throw new Error(
      "KAYINGCODE_REVIEW_BUDGET_DIR must be an absolute path when KAYINGCODE_REVIEW_TOKEN_BUDGET is set",
    );
  }
  const rawScope = env.KAYINGCODE_REVIEW_BUDGET_SCOPE?.trim() || "environment";
  if (rawScope !== "environment" && rawScope !== "session") {
    throw new Error('KAYINGCODE_REVIEW_BUDGET_SCOPE must be "environment" or "session"');
  }
  const binding: ReviewSessionBinding = {
    codeId: env.KAYINGCODE_REVIEW_CODE_ID?.trim() || "app-review",
    deviceId:
      rawScope === "session"
        ? input.sessionId
        : env.KAYINGCODE_REVIEW_DEVICE_ID?.trim() || "app-review",
    tokenLimit,
  };
  assertBinding(binding, "review.defaultBinding.invalid");
  return {
    root,
    options: {
      defaultBinding: binding,
      countTotalTokens: true,
      failClosedOnUnknownFailure: false,
      exhaustedMessage:
        "审核用量已达上限，请联系维护人（Review token budget exhausted; contact the maintainer）",
      uncertainMessage:
        "审核用量无法确认，已停止请求，请联系维护人（Review token usage uncertain; contact the maintainer）",
    },
  };
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
/**
 * 组合两个准入端口：先拿预算票据，再拿原有治理器票据；事件与释放同时转发。
 * 预算端口没有同步快路径，因此组合后 runner 统一走 `acquire`，不影响治理器语义。
 */
export function combineModelRequestAdmissions(
  budget: ModelRequestAdmission,
  other: ModelRequestAdmission,
): ModelRequestAdmission {
  return {
    async acquire(input): Promise<ModelRequestAdmissionTicket> {
      const budgetTicket = await budget.acquire(input);
      let otherTicket: ModelRequestAdmissionTicket;
      try {
        otherTicket = await other.acquire(input);
      } catch (error) {
        budgetTicket.release();
        throw error;
      }
      let released = false;
      return {
        async publish(event) {
          await budgetTicket.publish(event);
          await otherTicket.publish(event);
        },
        release() {
          if (released) return;
          released = true;
          budgetTicket.release();
          otherTicket.release();
        },
      };
    },
  };
}

export function createReviewModelBudgetAdmission(
  root: string,
  sessionId: string,
  options: ReviewModelBudgetOptions = {},
): ModelRequestAdmission {
  if (!isAbsolute(root)) throw new Error("KAYINGCODE_REVIEW_BUDGET_DIR must be absolute");
  if (options.defaultBinding) {
    assertBinding(options.defaultBinding, "review.defaultBinding.invalid");
  }
  const readEffectiveBinding = async (): Promise<ReviewSessionBinding> => {
    try {
      return await readBinding(root, sessionId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && options.defaultBinding) {
        return options.defaultBinding;
      }
      throw error;
    }
  };
  return {
    async acquire({ signal }): Promise<ModelRequestAdmissionTicket> {
      const binding = await readEffectiveBinding();
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
        if (ledger.uncertain || ledger.pending !== null) {
          throw new Error(options.uncertainMessage ?? "review.budget.exhausted_or_uncertain");
        }
        if (ledger.usedTokens >= binding.tokenLimit) {
          throw new Error(options.exhaustedMessage ?? "review.budget.exhausted_or_uncertain");
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
          if (settled) return;
          // 失败请求若 provider 报告了用量，也要入账；没有用量的失败按配置决定是否失败关闭。
          if (event.type !== "model_request_completed" && event.type !== "model_request_failed") return;
          if (event.type === "model_request_failed" && event.usage === undefined) {
            if (options.failClosedOnUnknownFailure !== false) return;
            settled = true;
            ledger.pending = null;
            await writeAtomic(ledgerPath, ledger);
            return;
          }
          settled = true;
          const usage = event.usage;
          const input = usage?.inputTokens;
          const output = usage?.outputTokens;
          const hasAnyUsage =
            usage !== undefined &&
            [
              usage.totalTokens,
              usage.inputTokens,
              usage.outputTokens,
              usage.cacheReadTokens,
              usage.cacheWriteTokens,
              usage.reasoningTokens,
            ].some((value) => Number.isSafeInteger(value));
          const total = options.countTotalTokens
            ? hasAnyUsage
              ? reviewUsageTotalTokens(usage)
              : Number.NaN
            : Number(input) + Number(output);
          const id = createHash("sha256")
            .update(`${sessionId}\0${event.requestId}\0${event.attempt}`)
            .digest("hex");
          if (
            !options.countTotalTokens &&
            (!Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input! < 0 || output! < 0)
          ) {
            ledger.uncertain = true;
          } else if (!Number.isSafeInteger(total) || total < 0) {
            ledger.uncertain = true;
          } else if (ledger.events[id] === undefined) {
            if (!Number.isSafeInteger(ledger.usedTokens + total)) {
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
