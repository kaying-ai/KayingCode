// worktree 创建发起与结束的 renderer 侧账本（managed-worktrees/CONTRACT.md §1、§2、§8）。
// 只记录“本窗口发起过这次创建”，用于：
// 1. 双击/并发发送只提交一次创建（服务按 commandId 幂等，但每次点击都会生成新信封）；
// 2. 只处理本窗口发起过的结束事件，避免多窗口共用本机 Host 时重复打开或重复回填草稿。
// 创建进度与结果仍是 Host 的唯一事实，这里不保存状态机。
import { useKayingCodeSessionStore } from "@/store/kayingcodeSessionStore.js";
import type {
  ManagedWorktreeCreationKind,
  ManagedWorktreeCreationSettlement,
} from "./contract.js";

interface WorktreeCreationIntent {
  creationId: string;
  kind: ManagedWorktreeCreationKind;
  workspacePath: string;
  promptText: string | null;
}

/** 正在提交（RPC 未返回）的创建；按 workspace + kind 串行，避免双击建出两个 worktree。 */
const inFlightInitiations = new Set<string>();
/** 已受理但尚未结束的创建；结束事件只在命中时处理一次。 */
const creationIntents = new Map<string, WorktreeCreationIntent>();

function initiationKey(
  workspacePath: string,
  workspaceIdentity: string | undefined,
  kind: ManagedWorktreeCreationKind,
): string {
  return `${workspaceIdentity?.trim() ?? ""}\u0000${workspacePath}\u0000${kind}`;
}

/** 同步占用发起权；已有一笔在提交时返回 false（不允许排队第二笔）。 */
export function beginWorktreeInitiation(
  workspacePath: string,
  workspaceIdentity: string | undefined,
  kind: ManagedWorktreeCreationKind,
): boolean {
  const key = initiationKey(workspacePath, workspaceIdentity, kind);
  if (inFlightInitiations.has(key)) return false;
  inFlightInitiations.add(key);
  return true;
}

export function endWorktreeInitiation(
  workspacePath: string,
  workspaceIdentity: string | undefined,
  kind: ManagedWorktreeCreationKind,
): void {
  inFlightInitiations.delete(initiationKey(workspacePath, workspaceIdentity, kind));
}

/** 创建已被 Host 受理：登记结束事件归属。必须在服务返回 creationId 后调用。 */
export function recordWorktreeCreationIntent(intent: WorktreeCreationIntent): void {
  creationIntents.set(intent.creationId, intent);
}

/** 结束事件只消费一次；未知 creationId（其他窗口发起或已处理）返回 null。 */
export function takeWorktreeCreationIntent(creationId: string): WorktreeCreationIntent | null {
  const intent = creationIntents.get(creationId);
  if (!intent) return null;
  creationIntents.delete(creationId);
  return intent;
}

/**
 * 结束事件的产品语义（上游 Shell 的 `handleWorktreeSettlement`）：
 * - `session-started`：在 session store 里选中新会话（store 是唯一 owner），草稿正文已由
 *   composer 在发送 accepted 时清空，这里不再改写；
 * - `dismissed`：把首条消息放回当前草稿，不自动发送；
 * - 非本窗口发起、或已消费的结束事件一律忽略（stale settlement）。
 */
export function handleManagedWorktreeCreationSettlement(
  settlement: ManagedWorktreeCreationSettlement,
  workspaceIdentity?: string,
): boolean {
  const intent = takeWorktreeCreationIntent(settlement.creationId);
  if (!intent || intent.workspacePath !== settlement.workspacePath) return false;
  const store = useKayingCodeSessionStore.getState();
  if (settlement.outcome === "session-started") {
    // 与普通 createSession 同一选择路径：activeTaskId 是 Shell 的会话绑定来源。
    store.setActiveTaskId(intent.workspacePath, settlement.sessionId, workspaceIdentity);
    return true;
  }
  if (settlement.promptText || intent.promptText) {
    // 结束事件没带正文时回退到发起时记录的首条消息；只回填正文，附件不重建上传态。
    store.requestComposerTextInsert(
      intent.workspacePath,
      settlement.promptText ?? intent.promptText ?? "",
      workspaceIdentity,
    );
  }
  return true;
}

/** 仅测试清理；生产按创建自然结束回收。 */
export function resetWorktreeCreationLifecycleForTests(): void {
  inFlightInitiations.clear();
  creationIntents.clear();
}
