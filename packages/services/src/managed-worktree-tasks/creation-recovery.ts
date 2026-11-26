// 受管 worktree 创建失败后的恢复：确认上一次会话命令、放弃残留 worktree、改在项目主目录重试。
// 从 service.ts 拆出以控制单文件行数；状态与 emitters 仍由 service.ts 持有。
import { randomUUID } from "node:crypto";
import { type ManagedWorktreeCreationSettlement, type ManagedWorktreeError } from "@zcode/shared";
import { COMMAND_QUERY_UNAVAILABLE_REASON } from "@zcode/shared/zcode-protocol-v4";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import type { ManagedWorktreeServicePorts } from "#src/managed-worktree-tasks/ports.js";
import { errorOf } from "#src/managed-worktree-tasks/removal.js";
import {
  COMMAND_UNCONFIRMED_ERROR,
  REJECTED_ACTION_ERRORS,
  SESSION_CLOSE_FAILED_ERROR,
  SESSION_ID_PREFIX,
  WORKTREE_IN_USE_ERROR,
  isAccepted,
  startedSessionId,
  type CreationState,
} from "./creation-state.js";

const log = createServiceLogger("managed-worktree");

export interface WorktreeCreationRecoveryDeps {
  ports: ManagedWorktreeServicePorts;
  releaseCliSessionsUnder(
    projectId: string,
    workspacesInUse: readonly { workspacePath: string; workspaceIdentity?: string }[],
    directory: string,
  ): Promise<{ released: string[]; busy: string[] }>;
  fail(state: CreationState, error: ManagedWorktreeError): void;
  publish(): void;
  settle(state: CreationState, settlement: ManagedWorktreeCreationSettlement): void;
  settleStarted(state: CreationState, sessionId: string): void;
  run(state: CreationState): Promise<void>;
  getState(creationId: string): CreationState | undefined;
}

export function createWorktreeCreationRecovery(deps: WorktreeCreationRecoveryDeps) {
  function requireState(creationId: string): CreationState {
    const state = deps.getState(creationId);
    if (!state) throw new Error("worktree.creation-not-found");
    return state;
  }

  function assertFailed(state: CreationState): void {
    if (state.record.phase !== "failed" || state.running)
      throw new Error("worktree.creation-not-failed");
  }

  /**
   * 卸载这条创建记录的 worktree 中由失败的会话命令留下的驻留会话。worktree 是本次创建新建的，
   * 其中只有这条记录产生的会话。忙 → WORKTREE_IN_USE_ERROR；请求失败 → SESSION_CLOSE_FAILED_ERROR。
   */
  async function unloadFailedSessionsIn(state: CreationState, worktreePath: string): Promise<void> {
    let cli: { released: string[]; busy: string[] };
    try {
      cli = await deps.releaseCliSessionsUnder(
        state.record.projectId,
        [{ workspacePath: state.record.workspacePath }],
        worktreePath,
      );
    } catch (error) {
      log.warn(undefined, "卸载残留 worktree 中的会话失败", {
        creationId: state.record.id,
        error: String(error),
      });
      throw new Error(SESSION_CLOSE_FAILED_ERROR);
    }
    if (cli.busy.length > 0) throw new Error(WORKTREE_IN_USE_ERROR);
  }

  /**
   * 创建失败后残留的 worktree；它没有可见任务（只有尚无 CLI 事实的预留行），可以强制删除。
   * 预留行已有 CLI 事实时说明会话已存在：不删除 worktree，返回 false。
   */
  async function discardWorktree(state: CreationState): Promise<boolean> {
    // Bug 原因：预留行带着 worktree_root，曾在放弃后保留，删除检查把它当作使用中的任务，
    // 残留 worktree 无法在管理弹窗中清理。先撤销预留，再删除目录。
    const release = (await deps.ports.repository()).releaseReservedTask({
      task: {
        workspacePath: state.record.workspacePath,
        ...(state.workspaceIdentity ? { workspaceIdentity: state.workspaceIdentity } : {}),
        taskId: state.sessionId,
      },
    });
    // 修复原因：曾忽略返回值并强制删除目录；会话已由 CLI 创建时，这会删掉真实任务的 cwd 和改动。
    // 只有 kept（行已有 CLI 事实）说明会话已存在；absent（从未预留或已撤销）可以继续清理。
    if (release === "kept") return false;
    const path = state.created?.worktree.path ?? state.record.worktreePath;
    if (!path) return true;
    // 失败的 createSession 可能已在 CLI 中留下草稿会话（首条消息失败时 CLI 不清理记录）。删除目录前
    // 先请 CLI 卸载这个 worktree 内的驻留会话，避免会话驻留在已删除的目录上。
    await unloadFailedSessionsIn(state, path);
    const result = await deps.ports.git.remove({ path, force: true });
    if (!result.ok && result.error.code !== "not-managed")
      log.warn(undefined, "清理残留 worktree 失败，保留给管理弹窗处理", {
        creationId: state.record.id,
        code: result.error.code,
      });
    state.created = null;
    state.record.worktreePath = null;
    return true;
  }

  /**
   * 查询上一次会话命令的裁决。修复原因：查询请求本身抛错（连接中断等）时，曾在"不使用 worktree"中
   * 被记为会话启动失败，另外两个操作却原样抛出；三者统一为"无法确认"。
   */
  async function queryPreviousCommand(
    target: Parameters<ManagedWorktreeServicePorts["agent"]["queryCommandResult"]>[0],
  ) {
    try {
      return await deps.ports.agent.queryCommandResult(target);
    } catch (error) {
      log.warn(undefined, "查询会话命令结果失败", { error: String(error) });
      throw new Error(COMMAND_UNCONFIRMED_ERROR);
    }
  }

  /**
   * 放弃、"不使用 worktree"或重试之前，向 CLI 确认最后一次发出的会话命令是否已执行。
   * "会话启动失败"可能只是结果未知（请求异常、连接中断），CLI 是唯一能回答的一方；不用超时推断。
   * - 已执行：按"会话已启动"结束创建记录，返回 true。
   * - 无法确认：抛出，创建记录保持失败。
   * - 确认没有成功：撤销旧预留，换新的会话 ID 与命令 ID，返回 false。
   */
  async function resolvePreviousAttempt(state: CreationState): Promise<boolean> {
    const sent = state.sentCommand;
    if (!sent) return false;
    const result = await queryPreviousCommand({
      workspacePath: state.record.workspacePath,
      ...(state.workspaceIdentity ? { workspaceIdentity: state.workspaceIdentity } : {}),
      key: sent.key,
    });
    if (result !== "unknown" && isAccepted(result)) {
      deps.settleStarted(state, startedSessionId(result, sent.sessionId));
      return true;
    }
    // 修复原因：CLI 读取命令记录失败时返回 failed + queryUnavailable，而不是抛错；曾被当作"未执行"
    // 继续撤销预留并强制删除目录，可能删掉真实会话的 cwd。无法确认时不做破坏性清理。
    if (result !== "unknown" && result.reasonCode === COMMAND_QUERY_UNAVAILABLE_REASON)
      throw new Error(COMMAND_UNCONFIRMED_ERROR);
    // 确认没有成功：换新的会话 ID 与命令 ID。修复原因：CLI 的 createSession 先建会话记录、再发首条
    // 消息，首条消息失败时记录不清理；沿用旧会话 ID 重发会报会话已存在，记录永远无法恢复。
    // 旧 ID 的预留先撤销；行已有 CLI 事实说明会话已存在，按"会话已启动"结束。
    const release = (await deps.ports.repository()).releaseReservedTask({
      task: {
        workspacePath: state.record.workspacePath,
        ...(state.workspaceIdentity ? { workspaceIdentity: state.workspaceIdentity } : {}),
        taskId: state.sessionId,
      },
    });
    if (release === "kept") {
      deps.settleStarted(state, state.sessionId);
      return true;
    }
    // 确认不是真实任务之后，worktree 模式再卸载失败留下的草稿（与 discardWorktree 同一顺序）：
    // 否则它一直驻留在 worktree 中，之后的强制删除会被当作"有任务正在使用"拒绝。主目录中的会话
    // 不能按目录整体卸载，不处理。
    if (!state.localMode && state.created)
      await unloadFailedSessionsIn(state, state.created.worktree.path);
    state.sessionId = `${SESSION_ID_PREFIX}${randomUUID()}`;
    state.commandId = randomUUID();
    // 上一次命令已有结论，之后不再按它查询。
    state.sentCommand = null;
    return false;
  }

  /** 在项目主目录发送首条消息（"不使用 worktree"与它之后的重试）。 */
  async function sendLocal(state: CreationState): Promise<void> {
    const commandId = state.commandId;
    state.record.phase = "starting-session";
    state.record.error = null;
    deps.publish();
    state.sentCommand = { key: { sessionId: null, commandId }, sessionId: state.sessionId };
    const ack = await deps.ports.agent.sendCommand({
      workspacePath: state.record.workspacePath,
      projectId: state.record.projectId,
      envelope: {
        ...state.envelope,
        commandId,
        payload: {
          ...(state.envelope.payload as Record<string, unknown>),
          sessionId: state.sessionId,
        },
      },
    });
    if (!isAccepted(ack)) {
      deps.fail(state, errorOf("session-failed", ack.reasonCode ?? ack.status));
      return;
    }
    deps.settleStarted(state, startedSessionId(ack, state.sessionId));
  }

  async function retryCreation({ creationId }: { creationId: string }): Promise<void> {
    const state = requireState(creationId);
    assertFailed(state);
    // 重发前确认上一次命令：已执行则直接打开，确认未执行则换新命令 ID。
    state.running = true;
    try {
      if (await resolvePreviousAttempt(state)) return;
    } finally {
      state.running = false;
    }
    // 项目主目录模式下重试的是主目录发送，不再创建 worktree。
    if (!state.localMode) {
      await deps.run(state);
      return;
    }
    state.running = true;
    try {
      await sendLocal(state);
    } catch (error) {
      deps.fail(
        state,
        errorOf("session-failed", error instanceof Error ? error.message : String(error)),
      );
    } finally {
      state.running = false;
    }
  }

  async function continueWithoutWorktree({ creationId }: { creationId: string }): Promise<void> {
    const state = requireState(creationId);
    assertFailed(state);
    if (state.record.kind !== "new-task") throw new Error("worktree.invalid-command");
    state.running = true;
    try {
      // 会话其实已创建时不能再发一次首条消息。
      if (await resolvePreviousAttempt(state)) return;
      if (!(await discardWorktree(state))) {
        deps.settleStarted(state, state.sessionId);
        return;
      }
      // 切换为项目主目录模式：换新的会话 ID（旧 ID 的预留指向 worktree cwd）与命令 ID。
      // 修复原因：曾每次都生成新 ID 且不写回 state.sessionId，之后的放弃与重试作用在旧 ID 上。
      if (!state.localMode) {
        state.localMode = true;
        state.sessionId = `${SESSION_ID_PREFIX}${randomUUID()}`;
        state.commandId = randomUUID();
      }
      await sendLocal(state);
    } catch (error) {
      // 操作被拒绝（无法确认、worktree 正在使用、卸载会话失败）不是启动失败：原样抛给调用方
      // 按各自原因提示，记录保持原来的失败状态。
      if (error instanceof Error && REJECTED_ACTION_ERRORS.has(error.message)) throw error;
      deps.fail(
        state,
        errorOf("session-failed", error instanceof Error ? error.message : String(error)),
      );
    } finally {
      state.running = false;
    }
  }

  async function dismissCreation({ creationId }: { creationId: string }): Promise<void> {
    const state = requireState(creationId);
    assertFailed(state);
    state.running = true;
    try {
      if (await resolvePreviousAttempt(state)) return;
      if (!(await discardWorktree(state))) {
        deps.settleStarted(state, state.sessionId);
        return;
      }
    } finally {
      state.running = false;
    }
    deps.settle(state, {
      creationId,
      outcome: "dismissed",
      workspacePath: state.record.workspacePath,
      promptText: state.record.promptText,
    });
  }

  return { retryCreation, continueWithoutWorktree, dismissCreation };
}
