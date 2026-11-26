/**
 * 受管 worktree 的协议门禁：worktreeCwd 能力探测与目录级会话卸载。
 *
 * 旧 CLI 的 createSession / forkAssistant schema 会静默丢弃 cwd / worktreeCreation / targetCwd，
 * 把会话建在 workspace 目录；只有 runtime/capabilities 明确声明 worktreeCwd 的连接才能携带这些
 * 字段（docs/git/worktree.md §9.3）。session/releaseUnderDirectory 随同一能力提供，删除 worktree
 * 前必须由 CLI 按自己的驻留表判定会话忙闲。
 * 规则与验收见 packages/services/spec/managed-worktree.md。
 */
import {
  kayingcodeProtocolMethods,
  kayingcodeRuntimeCapabilitiesSchema,
  kayingcodeSessionReleaseUnderDirectoryParamsSchema,
  kayingcodeSessionReleaseUnderDirectoryResultSchema,
  type KayingCodeSessionReleaseUnderDirectoryResult,
} from "@zcode/shared";
import type { KayingCodeProtocolClient } from "./kayingcodeProtocolClient.js";

type WorktreeCapabilityClient = Pick<KayingCodeProtocolClient, "request">;

/** 每个物理 CLI 连接只探测一次；失败不缓存，连接换代后自然重新探测。 */
const worktreeCwdChecks = new WeakMap<object, Promise<boolean>>();

/**
 * 探测 CLI 是否声明 worktreeCwd。
 * 只有明确 `=== true` 才算支持；method-not-found、超时、解析失败都按不支持处理且不缓存失败。
 */
export function supportsWorktreeCwd(client: WorktreeCapabilityClient): Promise<boolean> {
  const cached = worktreeCwdChecks.get(client);
  if (cached) return cached;
  const check = client
    .request(kayingcodeProtocolMethods.runtimeCapabilities, {}, kayingcodeRuntimeCapabilitiesSchema)
    .then((result) => result.worktreeCwd === true)
    .catch(() => {
      worktreeCwdChecks.delete(client);
      return false;
    });
  worktreeCwdChecks.set(client, check);
  return check;
}

/** session/releaseUnderDirectory 的稳定失败码：调用方只认 code，不解析 CLI 文案。 */
export const KAYINGCODE_WORKTREE_RELEASE_FAILED_CODE = "KAYINGCODE_WORKTREE_RELEASE_FAILED";

/**
 * 卸载请求的 typed failure。旧 CLI 的 -32601、连接中断、结果解析失败都收敛到这里；
 * 删除流程据此 fail closed（`session-close-failed`），绝不把传输错误当成"没有驻留会话"。
 */
export class KayingCodeWorktreeReleaseFailedError extends Error {
  readonly code = KAYINGCODE_WORKTREE_RELEASE_FAILED_CODE;

  constructor(readonly cause?: unknown) {
    super("worktree.release-failed", { cause });
    this.name = "KayingCodeWorktreeReleaseFailedError";
  }
}

export function isKayingCodeWorktreeReleaseFailedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === KAYINGCODE_WORKTREE_RELEASE_FAILED_CODE
  );
}

/**
 * 请求 CLI 卸载 cwd 位于 directory 内的全部驻留会话。
 * 会话选择与忙闲由 CLI 判断；任一会话忙时 CLI 返回全部 busy 且不卸载任何会话。
 */
export async function requestSessionReleaseUnderDirectory(
  client: WorktreeCapabilityClient,
  directory: string,
): Promise<KayingCodeSessionReleaseUnderDirectoryResult> {
  try {
    return await client.request(
      kayingcodeProtocolMethods.sessionReleaseUnderDirectory,
      kayingcodeSessionReleaseUnderDirectoryParamsSchema.parse({ directory }),
      kayingcodeSessionReleaseUnderDirectoryResultSchema,
    );
  } catch (cause) {
    throw new KayingCodeWorktreeReleaseFailedError(cause);
  }
}
