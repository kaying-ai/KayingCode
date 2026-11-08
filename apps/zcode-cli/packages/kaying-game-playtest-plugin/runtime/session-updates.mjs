import { validateEvidence, validateReview } from "./review.mjs";

export function defaultGoals(kind, objective) {
  const entries =
    kind === "diagnostic"
      ? [
          ["environment", "确认运行环境", "记录实际 GLES 与 ABI，明确是否软件渲染"],
          ["operation", "验证真实操作", "输入造成可观察的游戏状态变化"],
          ["observation", "验证观察链路", "取得落定画面和实际操作耗时"],
        ]
      : [
          ["entry", "进入核心玩法", "出现可实际操作的核心游戏画面"],
          ["rules", "理解基本规则", "用实际操作验证目标、规则和反馈"],
          ["loop", "完成一个玩法循环", objective ?? "出现完整关卡或一轮游戏的结束反馈"],
          ["retry", "检查失败和重试", "观察失败反馈并验证重新开始路径"],
        ];
  return entries.map(([id, title, acceptance]) => ({ id, title, acceptance }));
}
export function initializeGoals(goals) {
  if (new Set(goals.map((g) => g.id)).size !== goals.length) throw new Error("Duplicate goal id");
  return goals.map((g) => ({
    ...g,
    status: "not-tested",
    reason: "尚未验证",
    evidenceIds: [],
    history: [],
  }));
}
export function updateGoal(session, args, now) {
  const goal = session.goals?.find((g) => g.id === args.goalId);
  if (!goal) throw new Error("Unknown goal id");
  if (!args.reason?.trim()) throw new Error("Goal reason required");
  validateEvidence(session, args.evidenceIds, ["partial", "verified"].includes(args.status));
  const update = {
    status: args.status,
    reason: args.reason,
    evidenceIds: args.evidenceIds,
    updatedAt: new Date(now).toISOString(),
  };
  goal.history ??= [];
  goal.history.push(update);
  Object.assign(goal, update);
  return goal;
}
export function applyReview(session, patch, mode, now) {
  validateReview(session, patch);
  const previous = session.review ?? {};
  // 原实现整体替换导致补充一个章节会丢失旧评价；默认按稳定 key 合并，显式 replace 才整体替换。
  const merge = (key) => {
    const values = new Map((previous[key] ?? []).map((x) => [x.key ?? x.dimension, x]));
    for (const item of patch[key] ?? []) values.set(item.key ?? item.dimension, item);
    return [...values.values()];
  };
  session.reviewRevisions ??= [];
  session.reviewRevisions.push({ at: new Date(now).toISOString(), mode, previous, patch });
  session.review =
    mode === "replace"
      ? patch
      : {
          ...previous,
          ...patch,
          sections: merge("sections"),
          scores: merge("scores"),
          issues: patch.issues ?? previous.issues ?? [],
        };
}
function distribution(values) {
  if (!values.length) return { count: 0, mean: null, median: null, p95: null };
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    count: values.length,
    mean: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}
export function sessionMetrics(session, now) {
  const end = session.endedAt ? Date.parse(session.endedAt) : now;
  const wallElapsedMs = Math.max(0, end - Date.parse(session.createdAt));
  const pausedMs =
    (session.pausedMs ?? 0) +
    (session.status === "paused" && session.pausedAt
      ? Math.max(0, end - Date.parse(session.pausedAt))
      : 0);
  const activeElapsedMs = Math.max(0, wallElapsedMs - pausedMs);
  const measuredToolMs = (session.toolTimings ?? []).reduce((n, x) => n + x.durationMs, 0);
  const measuredActionMs = session.actions.reduce((n, a) => n + (a.timings?.totalMs ?? 0), 0);
  const actions = Object.fromEntries(
    ["actionMs", "observationMs", "totalMs"].map((key) => [
      key,
      distribution(session.actions.map((a) => a.timings?.[key]).filter(Number.isFinite)),
    ]),
  );
  return {
    wallElapsedMs,
    pausedMs,
    activeElapsedMs,
    measuredToolMs,
    unattributedActiveMs: Math.max(0, activeElapsedMs - Math.max(measuredToolMs, measuredActionMs)),
    actions,
    timingSamples: session.toolTimings?.length ?? 0,
    caveat:
      "未归因时间包含模型判断、人工等待、宿主调度及其他工作，不能当作纯模型推理；历史会话未采集的计时不补造，少量样本不能证明 GPU 加速倍数。",
  };
}
