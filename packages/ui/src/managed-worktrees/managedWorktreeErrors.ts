// worktree 错误的本地化：只按结构化 code / detail 选择文案，不解析 git 原始报错文本
// （managed-worktrees/CONTRACT.md §4）。
import type { IntlInstance } from "@/i18n/IntlProvider.js";
import type { ManagedWorktreeRemovalFailure } from "./contract.js";

type Intl = Pick<IntlInstance, "formatMessage">;

/** Host 抛出的错误前缀：任务行守卫 `project.worktree-*` 与编排服务 `worktree.*`。 */
const ERROR_PREFIXES = ["project.worktree-", "worktree."];
const KNOWN_CODES = new Set([
  "not-repository",
  "invalid-start-ref",
  "start-ref-missing-subdir",
  "bucket-exhausted",
  "worktree-dirty",
  "worktree-in-use",
  "not-managed",
  "local-only",
  "git-failed",
  "copy-failed",
  "unsupported-agent",
  "session-failed",
  "carry-failed",
  "session-close-failed",
  "release-unsupported",
  "command-unconfirmed",
  "removing",
]);

/** 把 Host 抛出的 `project.worktree-<code>` 或结构化 code 映射为本地化提示。 */
export function formatManagedWorktreeError(intl: Intl, error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
  const prefix = ERROR_PREFIXES.find((item) => message.startsWith(item));
  const code = prefix ? message.slice(prefix.length) : message;
  return KNOWN_CODES.has(code)
    ? intl.formatMessage({ id: `managedWorktrees.error.${code}` })
    : intl.formatMessage({ id: "managedWorktrees.error.generic" });
}

export interface RemovalFailureDescription {
  message: string;
  detail?: string;
}

/** 入口禁用原因文案；可用时返回 null。 */
export function describeWorktreeSupportDisabledReason(
  intl: Intl,
  reason: "not-repository" | "unsupported" | "remote" | null,
): string | null {
  if (!reason) return null;
  const id =
    reason === "not-repository"
      ? "managedWorktrees.entry.notRepository"
      : reason === "unsupported"
        ? "managedWorktrees.entry.unsupported"
        : "managedWorktrees.entry.remote";
  return intl.formatMessage({ id });
}

/**
 * 删除失败的展示文案。`worktree-in-use` 说明“有会话/终端/创建驻留”，不提供重试语义；
 * `release-unsupported` / `session-close-failed` 说明 worktree 已保留。
 */
export function describeRemovalFailure(
  intl: Intl,
  failure: ManagedWorktreeRemovalFailure,
): RemovalFailureDescription {
  const msg = (id: string) => intl.formatMessage({ id: `managedWorktrees.dialog.error.${id}` });
  if (failure.code === "worktree-dirty") return { message: msg("dirty") };
  if (failure.code === "worktree-in-use") {
    switch (failure.detail) {
      case "running":
        return { message: msg("running") };
      case "terminal":
        return { message: msg("terminal") };
      case "creating":
        return { message: msg("creating") };
      case "tasks":
        return { message: msg("tasks") };
      case "removing":
        return { message: msg("removing") };
      default:
        return { message: msg("inUse"), ...(failure.detail ? { detail: failure.detail } : {}) };
    }
  }
  if (failure.code === "release-unsupported") return { message: msg("releaseUnsupported") };
  if (failure.code === "session-close-failed") return { message: msg("sessionClose") };
  if (failure.code === "not-managed") return { message: msg("notManaged") };
  if (failure.code === "git-failed") return { message: msg("gitFailed") };
  return { message: msg("generic"), detail: failure.detail || failure.code };
}
