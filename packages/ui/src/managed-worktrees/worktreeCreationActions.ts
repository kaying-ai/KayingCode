// worktree 任务的发起收口（managed-worktrees/CONTRACT.md §8）。
// 产品适配：会话首发信封必须与普通 "新建会话 + 首条消息" 完全同形，因此 payload 由
// 这里按产品 createSession 的形状组装，信封统一走 @zcode/v4 command factory；
// SessionPane 的普通首发路径也复用同一 payload builder，避免出现第二种信封形状。
import type {
  AttachmentRef,
  CommandEnvelope,
  CommandPayloadMap,
  ConversationRowTarget,
  SessionConfigState,
} from "@zcode/shared/kayingcode-protocol-v4";
import { createCommandEnvelope } from "@/v4/commandFactory.js";
import type { ComposerSubmissionConfig } from "@/v4/composer/composerSubmissionConfig.js";
import type { IManagedWorktreeService, ManagedWorktreeCreationKind } from "./contract.js";
import {
  beginWorktreeInitiation,
  endWorktreeInitiation,
  recordWorktreeCreationIntent,
} from "./worktreeCreationLifecycle.js";

export type WorktreeCreationStartOutcome =
  | { status: "started"; creationId: string }
  /** 服务拒绝或 transport 失败；调用方 toast 后保留草稿。 */
  | { status: "rejected"; error: unknown }
  /** 已有一笔同 workspace 的创建在提交中。 */
  | { status: "in-flight" }
  /** 缺少本机 worktree 服务或草稿项目。 */
  | { status: "unavailable" };

export interface WorktreeFirstInput {
  text: string;
  submission: ComposerSubmissionConfig;
  /** 已就绪附件引用；与普通 sendText 同一集合，不在点击时上传。 */
  attachments?: AttachmentRef[];
  /** 草稿 config 片段：沿用 buildDraftCreateConfigPayload 的结果。 */
  configPayload?: { config?: Partial<SessionConfigState> };
}

/**
 * createSession 首发 payload：与 SessionPane 普通首发同形
 * （workspaceId + firstInput{text,attachments,modelSelection,mode,planEnabled} + config）。
 * 注意工作区的协议 `context_refs` 只在 sendText 上存在；上下文引用已由 composer 序列化进正文。
 */
export function buildDraftCreateSessionPayload(params: {
  workspaceKey: string;
  firstInput: WorktreeFirstInput;
}): CommandPayloadMap["createSession"] {
  const { firstInput } = params;
  return {
    workspaceId: params.workspaceKey,
    firstInput: {
      text: firstInput.text,
      ...(firstInput.attachments && firstInput.attachments.length > 0
        ? { attachments: firstInput.attachments }
        : {}),
      modelSelection: firstInput.submission.modelSelection,
      mode: firstInput.submission.mode,
      planEnabled: firstInput.submission.planEnabled,
    },
    ...(firstInput.configPayload?.config ? { config: firstInput.configPayload.config } : {}),
  };
}

export function buildWorktreeCreateSessionEnvelope(params: {
  workspaceKey: string;
  firstInput: WorktreeFirstInput;
}): CommandEnvelope {
  return createCommandEnvelope({
    type: "createSession",
    sessionId: null,
    payload: buildDraftCreateSessionPayload(params),
  });
}

/**
 * Host 编排：先建 worktree，再在项目 workspace 下创建会话并发送首条消息。
 * 双击只提交一次：同 workspace 的提交在 RPC 返回前串行；服务端再按 commandId 幂等兜底。
 */
export async function startWorktreeTask(params: {
  service: IManagedWorktreeService | null | undefined;
  workspacePath: string;
  workspaceIdentity?: string;
  projectId: string | null | undefined;
  /** null = 从主目录当前 HEAD 检出。 */
  ref: string | null;
  firstInput: WorktreeFirstInput;
}): Promise<WorktreeCreationStartOutcome> {
  const { service, projectId } = params;
  if (!service || !projectId) return { status: "unavailable" };
  const kind: ManagedWorktreeCreationKind = "new-task";
  if (!beginWorktreeInitiation(params.workspacePath, params.workspaceIdentity, kind)) {
    return { status: "in-flight" };
  }
  try {
    const envelope = buildWorktreeCreateSessionEnvelope({
      workspaceKey: params.workspaceIdentity?.trim() || params.workspacePath,
      firstInput: params.firstInput,
    });
    const result = await service.startNewTask({
      workspacePath: params.workspacePath,
      ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
      projectId,
      ref: params.ref,
      envelope,
    });
    if (!result.ok) return { status: "rejected", error: result.error };
    recordWorktreeCreationIntent({
      creationId: result.creationId,
      kind,
      workspacePath: params.workspacePath,
      promptText: params.firstInput.text,
    });
    return { status: "started", creationId: result.creationId };
  } catch (error) {
    return { status: "rejected", error };
  } finally {
    endWorktreeInitiation(params.workspacePath, params.workspaceIdentity, kind);
  }
}

/** fork 到新 worktree：与原地分叉同一 CAS 语义，Host 建 worktree 并转发 forkAssistant。 */
export async function forkSessionToWorktree(params: {
  service: IManagedWorktreeService | null | undefined;
  workspacePath: string;
  workspaceIdentity?: string;
  sessionId: string;
  target: ConversationRowTarget;
  baseRevision: number;
  baseLogEpoch?: string;
}): Promise<WorktreeCreationStartOutcome> {
  const { service } = params;
  if (!service) return { status: "unavailable" };
  const kind: ManagedWorktreeCreationKind = "fork";
  if (!beginWorktreeInitiation(params.workspacePath, params.workspaceIdentity, kind)) {
    return { status: "in-flight" };
  }
  try {
    const envelope = createCommandEnvelope({
      type: "forkAssistant",
      sessionId: params.sessionId,
      payload: { target: params.target } as never,
      baseRevision: params.baseRevision,
      ...(params.baseLogEpoch ? { baseLogEpoch: params.baseLogEpoch } : {}),
    });
    const result = await service.forkToWorktree({
      workspacePath: params.workspacePath,
      ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
      envelope,
    });
    if (!result.ok) return { status: "rejected", error: result.error };
    recordWorktreeCreationIntent({
      creationId: result.creationId,
      kind,
      workspacePath: params.workspacePath,
      promptText: null,
    });
    return { status: "started", creationId: result.creationId };
  } catch (error) {
    return { status: "rejected", error };
  } finally {
    endWorktreeInitiation(params.workspacePath, params.workspaceIdentity, kind);
  }
}
