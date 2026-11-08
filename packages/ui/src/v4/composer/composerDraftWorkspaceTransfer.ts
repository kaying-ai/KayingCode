import type { ChatComposerAttachment } from "@/lib/chatAttachments.js";
import { readComposerAttachmentScope } from "@/store/composerAttachmentUploadStore.js";
import {
  readV4ComposerDraft,
  readComposerWorkspaceScope,
  V4_DRAFT_SCOPE_ROOT,
  type V4ComposerDraft,
} from "@/v4/composer/composerDraftStore.js";

interface ComposerDraftWorkspaceTransferRequest {
  sourceWorkspacePath: string;
  sourceWorkspaceIdentity?: string;
  targetWorkspacePath: string;
  targetWorkspaceIdentity?: string;
}

/**
 * 项目创建/切换时的一次性草稿交接。
 * 只在 renderer 内存中传递；附件 File 不落盘，正文按目标项目 scope 重新写入。
 */
export interface ComposerDraftHandoff {
  sourceWorkspaceKey: string;
  draft: Omit<V4ComposerDraft, "updatedAt">;
  attachments: readonly ChatComposerAttachment[];
}

type DraftReader = () => Omit<ComposerDraftHandoff, "sourceWorkspaceKey">;
const draftReaders = new Map<string, DraftReader>();

let pendingRequest: ComposerDraftWorkspaceTransferRequest | null = null;

function getWorkspaceKey(path: string, identity?: string): string {
  return identity?.trim() || path;
}

/**
 * 读取编辑器当前值，避免把尚未到持久化时点的文字丢在旧工作区。
 * 返回的清理函数只能在仍是同一 reader 时移除，防止后挂载的编辑器被先卸载的实例清空。
 */
export function registerV4ComposerDraftReader(workspaceKey: string, read: DraftReader): () => void {
  draftReaders.set(workspaceKey, read);
  return () => {
    if (draftReaders.get(workspaceKey) === read) draftReaders.delete(workspaceKey);
  };
}

/**
 * 捕获当前草稿并在项目切换后交接。
 * 编辑器未挂载时回退到同一客户端的项目草稿；附件 scope 仍是工作区级（见 useComposerAttachments）。
 */
export function captureV4ComposerDraftHandoff(
  workspacePath: string,
  workspaceIdentity?: string,
  clientNamespace = "desktop",
): ComposerDraftHandoff {
  const sourceWorkspaceKey = getWorkspaceKey(workspacePath, workspaceIdentity);
  // 重建 Root 后编辑器可能尚未挂载；交接回退也要读取同一客户端的项目草稿。
  const scope = readComposerWorkspaceScope(workspacePath, workspaceIdentity, clientNamespace);
  return {
    sourceWorkspaceKey,
    ...(draftReaders.get(sourceWorkspaceKey)?.() ?? {
      draft: readV4ComposerDraft(workspacePath, workspaceIdentity, V4_DRAFT_SCOPE_ROOT, scope) ?? {
        text: "",
      },
      // 附件 scope 当前仍是 `<workspaceKey>\0<scopeId>`；项目级附件 key 等 U2 后续批次一起迁移。
      attachments: readComposerAttachmentScope(`${sourceWorkspaceKey}\0${V4_DRAFT_SCOPE_ROOT}`),
    }),
  };
}

export function requestV4ComposerDraftWorkspaceTransfer(
  request: ComposerDraftWorkspaceTransferRequest,
): void {
  pendingRequest = request;
}

export function consumeV4ComposerDraftWorkspaceTransferRequest(
  transition: ComposerDraftWorkspaceTransferRequest,
): boolean {
  if (!pendingRequest) {
    return false;
  }
  const matches =
    getWorkspaceKey(pendingRequest.sourceWorkspacePath, pendingRequest.sourceWorkspaceIdentity) ===
      getWorkspaceKey(transition.sourceWorkspacePath, transition.sourceWorkspaceIdentity) &&
    getWorkspaceKey(pendingRequest.targetWorkspacePath, pendingRequest.targetWorkspaceIdentity) ===
      getWorkspaceKey(transition.targetWorkspacePath, transition.targetWorkspaceIdentity);
  if (matches) {
    pendingRequest = null;
  }
  return matches;
}
