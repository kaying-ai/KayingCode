// 通知域的壳层服务（阶段 4）：把 core 的纯推导接上「未读计数 + 三重门控」。
//
// 与 Flutter `TaskNotifier` + `UnreadEvents` 对应，但平台投递按 Taro 语义落地：
// weapp 没有系统通知，H5 暂不申请 Notification 权限——本模块只产出**页内**告警与
// 未读徽标（底栏「会话」Tab 上的角标），不假装成系统通知。
//
// 纯 TS、不 import Taro：前台/可见会话由页面注入（`setAppResumed` / `setVisibleSession`），
// 因此可在 Node 里直接单测门控与去重。
import {
  attentionTitleFor,
  completionTitleFor,
  computeNotifyUpdate,
} from "@kayingcode/mobile-client-core";
import type { SessionSummary } from "@zcode/shared/kayingcode-protocol-v4";

export interface NotifyPrefs {
  completions: boolean;
  failures: boolean;
  approvals: boolean;
}

/** 页内告警（页面据此弹横幅/toast；不是系统通知）。 */
export interface NotifyAlert {
  kind: "completion" | "approval";
  taskId: string;
  title: string;
  text: string;
}

const DEFAULT_PREFS: NotifyPrefs = { completions: true, failures: true, approvals: true };

let prefs: NotifyPrefs = { ...DEFAULT_PREFS };
/** 应用是否在前台；后台/切走时必推（对齐 Flutter `_appResumed`）。 */
let appResumed = true;
/** 当前正在查看的会话 id（null = 不在会话页）。门控用。 */
let visibleSessionId: string | null = null;

let previousPhases = new Map<string, string>();
/** taskId → 已播报过的 lastActivityAt：抑制重连快照重放的旧 preview。 */
const lastNotifiedActivity = new Map<string, number>();
/** 已见过的 interactionId：前台看弹窗时也要学习，之后回放不再重复提醒。 */
const seenInteractionIds = new Set<string>();
const unreadByTask = new Map<string, number>();

const unreadListeners = new Set<() => void>();
const alertListeners = new Set<(alert: NotifyAlert) => void>();

export function setNotifyPrefs(next: Partial<NotifyPrefs>): void {
  prefs = { ...prefs, ...next };
}

export function setAppResumed(next: boolean): void {
  appResumed = next;
}

export function setVisibleSession(sessionId: string | null): void {
  visibleSessionId = sessionId;
}

export function subscribeUnread(listener: () => void): () => void {
  unreadListeners.add(listener);
  return () => {
    unreadListeners.delete(listener);
  };
}

export function subscribeNotifyAlerts(listener: (alert: NotifyAlert) => void): () => void {
  alertListeners.add(listener);
  return () => {
    alertListeners.delete(listener);
  };
}

export function unreadTotal(): number {
  let total = 0;
  for (const count of unreadByTask.values()) total += count;
  return total;
}

export function unreadFor(taskId: string): number {
  return unreadByTask.get(taskId) ?? 0;
}

/** 打开某会话即清它的未读（弹回的重复事件不再计入，见门控）。 */
export function markSessionRead(taskId: string): void {
  if (!unreadByTask.delete(taskId)) return;
  notifyUnread();
}

export function clearUnread(): void {
  if (unreadByTask.size === 0) return;
  unreadByTask.clear();
  notifyUnread();
}

function notifyUnread(): void {
  for (const listener of Array.from(unreadListeners)) listener();
}

function addUnread(taskId: string): void {
  if (taskId.length === 0) return;
  unreadByTask.set(taskId, (unreadByTask.get(taskId) ?? 0) + 1);
  notifyUnread();
}

/**
 * 三重门控（对齐 zremote/Flutter 同款语义）：后台必推；前台但正在看的是
 * 「别的会话」也推；前台且正看该会话不推（用户盯着聊天，再弹无意义）。
 */
function shouldNotify(taskId: string): boolean {
  return !appResumed || visibleSessionId !== taskId;
}

/**
 * 消费一拍会话索引快照：更新相位、按门控产生告警并累加未读。
 * 返回本拍真正发出的告警（测试与页面横幅都用这个返回值）。
 */
export function ingestSessionsIndex(sessions: readonly SessionSummary[]): NotifyAlert[] {
  const update = computeNotifyUpdate({ sessions, previousPhases });
  previousPhases = new Map(sessions.map((entry) => [entry.sessionId, entry.phase] as const));
  const alerts: NotifyAlert[] = [];

  for (const event of update.completed) {
    const isFailure = completionTitleFor(event.phase) !== "任务完成";
    if (isFailure ? !prefs.failures : !prefs.completions) continue;
    if (!shouldNotify(event.taskId)) continue;
    const marker = event.lastActivityAt;
    const last = lastNotifiedActivity.get(event.taskId);
    if (marker > 0 && last !== undefined && marker <= last) continue;
    if (marker > 0) lastNotifiedActivity.set(event.taskId, marker);
    addUnread(event.taskId);
    const preview = event.preview.trim();
    alerts.push({
      kind: "completion",
      taskId: event.taskId,
      title: completionTitleFor(event.phase),
      text: preview.length === 0 ? event.title : `${event.title}\n${preview}`,
    });
  }

  // 待作答交互：一个 interactionId 只提醒一次；已解决的从「已见」集合里释放。
  const liveInteractionIds = new Set<string>();
  for (const pending of update.pendingInteractions) {
    liveInteractionIds.add(pending.interactionId);
    if (seenInteractionIds.has(pending.interactionId)) continue;
    seenInteractionIds.add(pending.interactionId);
    if (!prefs.approvals) continue;
    if (!shouldNotify(pending.taskId)) continue;
    addUnread(pending.taskId);
    alerts.push({
      kind: "approval",
      taskId: pending.taskId,
      title: attentionTitleFor(pending.kind, pending.toolName),
      text: pending.title,
    });
  }
  for (const id of Array.from(seenInteractionIds)) {
    if (!liveInteractionIds.has(id)) seenInteractionIds.delete(id);
  }

  for (const alert of alerts) {
    for (const listener of Array.from(alertListeners)) listener(alert);
  }
  return alerts;
}

/** 测试隔离：清空所有跨拍状态（相位、去重、未读）。 */
export function resetNotifyStateForTest(): void {
  prefs = { ...DEFAULT_PREFS };
  appResumed = true;
  visibleSessionId = null;
  previousPhases = new Map();
  lastNotifiedActivity.clear();
  seenInteractionIds.clear();
  unreadByTask.clear();
  unreadListeners.clear();
  alertListeners.clear();
}
