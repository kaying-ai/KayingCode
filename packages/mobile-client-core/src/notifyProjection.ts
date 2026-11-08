// 通知状态推导（阶段 4：通知域）。
//
// 对齐 Flutter lib/notifications/notify_state.dart：从 sessions-index 快照**纯推导**
// 「运行中任务 / 本轮新完成 / 待作答交互」，与平台通知投递解耦——H5 用页面内徽标与
// 横幅，weapp 无系统通知（只保留页内语义），原生壳（MOB-P-004）再决定是否送系统通知。
//
// dependency-free：只吃 SessionSummary，便于单测；不碰任何平台 API。
import type { SessionSummary } from "@zcode/shared/kayingcode-protocol-v4";

/** 视为「占用中」的相位（对齐 Dart `_runningPhases`）。 */
export const NOTIFY_RUNNING_PHASES: ReadonlySet<string> = new Set(["running", "prewarming"]);

/**
 * 终态相位（对齐 Dart `_terminalPhases`；多出来的 completed/cancelled/failed
 * 是旧 Node 的相位名，保留以兼容旧帧）。
 */
export const NOTIFY_TERMINAL_PHASES: ReadonlySet<string> = new Set([
  "completed",
  "completedSuccess",
  "completedInterrupted",
  "cancelled",
  "failed",
  "error",
]);

export interface RunningTask {
  taskId: string;
  title: string;
  preview: string;
}

/** 阻塞在待作答交互上的任务（权限请求 / 用户输入），由 sessions-index 摘要给出。 */
export interface AttentionEvent {
  taskId: string;
  title: string;
  interactionId: string;
  /** `permission` | `userInput`。 */
  kind: string;
  toolName: string;
}

/** running → 终态的一次跃迁；靠 previousPhases 去重，重跑会在下次完成时再触发。 */
export interface CompletionEvent {
  taskId: string;
  title: string;
  preview: string;
  phase: string;
  /** 单调活性标记；用于抑制陈旧重复（服务端缺省时为 0）。 */
  lastActivityAt: number;
}

export interface NotifyUpdate {
  running: RunningTask[];
  completed: CompletionEvent[];
  /** 全量快照（非边沿）：调用方自行与已播报过的 interactionId 对差。 */
  pendingInteractions: AttentionEvent[];
}

/**
 * 从会话索引快照推导通知状态。
 * `previousPhases` 是上一拍的 sessionId→phase；既用于判定「刚完成」，也兼作去重。
 */
export function computeNotifyUpdate(options: {
  sessions: readonly SessionSummary[];
  previousPhases: ReadonlyMap<string, string>;
}): NotifyUpdate {
  const running: RunningTask[] = [];
  const completed: CompletionEvent[] = [];
  const pendingInteractions: AttentionEvent[] = [];
  const nowPhases = new Map<string, string>();
  const nowEntries = new Map<string, SessionSummary>();

  for (const entry of options.sessions) {
    nowPhases.set(entry.sessionId, entry.phase);
    nowEntries.set(entry.sessionId, entry);
    if (NOTIFY_RUNNING_PHASES.has(entry.phase)) {
      running.push({
        taskId: entry.sessionId,
        title: entry.title.length > 0 ? entry.title : entry.sessionId,
        preview: entry.lastAssistantPreview ?? "",
      });
    }
    const interaction = entry.pendingInteraction;
    const interactionId = interaction?.interactionId ?? "";
    if (interaction && interactionId.length > 0) {
      pendingInteractions.push({
        taskId: entry.sessionId,
        title: entry.title.length > 0 ? entry.title : entry.sessionId,
        interactionId,
        kind: interaction.kind,
        toolName: interaction.toolName ?? "",
      });
    }
  }

  for (const [sessionId, wasPhase] of options.previousPhases) {
    if (!NOTIFY_RUNNING_PHASES.has(wasPhase)) continue;
    const now = nowPhases.get(sessionId);
    if (now === undefined || !NOTIFY_TERMINAL_PHASES.has(now)) continue;
    const entry = nowEntries.get(sessionId);
    completed.push({
      taskId: sessionId,
      title: entry && entry.title.length > 0 ? entry.title : sessionId,
      preview: entry?.lastAssistantPreview ?? "",
      phase: now,
      lastActivityAt: entry?.lastActivityAt ?? 0,
    });
  }

  return { running, completed, pendingInteractions };
}

/** 终态相位对应的通知标题——失败不能自我宣称为「完成」。 */
export function completionTitleFor(phase: string): string {
  if (phase === "failed" || phase === "error") return "任务失败";
  if (phase === "completedInterrupted" || phase === "cancelled") return "任务中断";
  return "任务完成";
}

/** 待作答交互的通知标题——任务会一直阻塞到用户答复。 */
export function attentionTitleFor(kind: string, toolName: string): string {
  if (kind !== "permission") return "等待你的输入";
  return toolName.length > 0 ? `权限请求 · ${toolName}` : "权限请求等待批准";
}

/** 运行中任务列表 → 持久提示文案。 */
export function formatRunningText(running: readonly RunningTask[]): string {
  if (running.length === 0) return "";
  const lines: string[] = [];
  for (const task of running) {
    const preview = task.preview.trim();
    lines.push(preview.length === 0 ? `• ${task.title}` : `• ${task.title}\n  ${preview}`);
  }
  return lines.join("\n\n");
}
