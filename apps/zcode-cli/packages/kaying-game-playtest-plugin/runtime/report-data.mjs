import { SECTION_KEYS, DIMENSIONS } from "./tools.mjs";
import { sessionMetrics } from "./session-updates.mjs";

const TITLES = [
  "试玩摘要",
  "基础信息",
  "试玩覆盖",
  "核心玩法",
  "首次体验",
  "游戏性评价",
  "视听及 UI",
  "成长与留存",
  "创新性",
  "问题清单",
  "证据集",
  "改进建议",
];
const READER_CHAPTERS = [
  ["summary", "一句话认识这款游戏"],
  ["information", "游戏名片"],
  ["audiovisual", "设计风格与视听表现"],
  ["mechanics", "核心玩法：玩家具体做什么"],
  ["onboarding", "如何上手"],
  ["gameplay", "一局体验与策略空间"],
  ["innovation", "值得关注的亮点"],
  ["retention", "关卡之外的成长"],
  ["issues", "体验上的疑问与不足"],
  ["recommendations", "适合谁，以及是否值得继续了解"],
  ["evidence", "图解与玩法片段"],
  ["coverage", "这次了解到哪里"],
];
const EVENT_SECTION = {
  launch: "onboarding",
  mechanic: "mechanics",
  "first-success": "gameplay",
  failure: "gameplay",
  finding: "summary",
  blocked: "coverage",
  highlight: "gameplay",
  issue: "issues",
};
export const STATUS_LABELS = {
  verified: "已验证",
  partial: "部分验证",
  blocked: "受阻",
  "not-tested": "未测试",
  "not-applicable": "不适用",
};

export function reportData(session, now, relatedSessions = []) {
  const review = session.review ?? {};
  const diagnostic = session.reportKind === "diagnostic";
  const metrics = sessionMetrics(session, now);
  const goals = session.goals ?? [];
  const counts = Object.fromEntries(
    Object.keys(STATUS_LABELS).map((key) => [key, goals.filter((g) => g.status === key).length]),
  );
  const goalProgress = {
    total: goals.length,
    applicable: goals.length - counts["not-applicable"],
    ...counts,
  };
  const scores = DIMENSIONS.map(
    (dimension) =>
      review.scores?.find((item) => item.dimension === dimension) ?? {
        dimension,
        score: null,
        confidence: 0,
        reason: "证据不足，未评分",
        evidenceIds: [],
      },
  );
  const covered = scores.filter((item) => item.score !== null);
  const refs = session.artifacts.map((a) => a.id);
  const automatic = {
    information: {
      text: diagnostic
        ? `来源：${session.source.packageName ?? session.source.url}。设备：${session.device?.environment?.model ?? "浏览器"}；系统：${session.device?.environment?.android ?? "未记录"}；ABI：${session.device?.environment?.abi ?? "未记录"}。\n渲染器：${session.device?.environment?.renderer ?? "未记录，不能确认硬件加速"}。\n版本信息未记录时不推测。`
        : `游戏：${review.gameName ?? session.title}。体验入口：${session.source.kind === "android" ? "Android 安装包" : "网页游戏"}。类型、题材和版本以已观察材料为准。`,
      status: "verified",
      evidenceIds: [],
    },
    coverage: {
      text: `本轮 ${session.actions.length} 次输入，其中 ${session.actions.filter((a) => a.status === "succeeded").length} 次命令成功；${session.events.length} 条观察记录。\n目标已验证 ${counts.verified}/${goalProgress.applicable}，部分验证 ${counts.partial}，受阻 ${counts.blocked}。输入成功不等于通关。`,
      status: goals.length
        ? counts.verified === goalProgress.applicable
          ? "verified"
          : "partial"
        : "partial",
      evidenceIds: goals.flatMap((g) => g.evidenceIds ?? []),
    },
    evidence: {
      text: `已登记 ${session.artifacts.filter((a) => a.kind === "screenshot").length} 张截图、${session.artifacts.filter((a) => a.kind === "recording").length} 段录像、${session.artifacts.filter((a) => a.kind === "highlight").length} 段高光、${session.artifacts.filter((a) => a.kind === "log").length} 份日志。原图和原始记录保留；视频是否有时间基准见媒体元数据。`,
      status: refs.length ? "verified" : "not-tested",
      evidenceIds: refs,
    },
    issues: {
      text: review.issues?.length
        ? `已记录 ${review.issues.length} 个带复现步骤的问题。`
        : "本轮未提交可复现问题；这不等于游戏没有缺陷。",
      status: review.issues?.length ? "partial" : "not-tested",
      evidenceIds: review.issues?.flatMap((i) => i.evidenceIds) ?? [],
    },
  };
  const chapters = diagnostic ? SECTION_KEYS.map((key, i) => [key, TITLES[i]]) : READER_CHAPTERS;
  const sections = chapters.map(([key, title]) => {
    const events = session.events.filter(
      (e) => (e.section ?? EVENT_SECTION[e.kind]) === key && e.evidenceIds.length,
    );
    const facts = events.length
      ? {
          text: events
            .map((e) => `${e.summary}（${e.certainty === "observed" ? "观察" : "待复核"}）`)
            .join("\n"),
          status: "partial",
          evidenceIds: events.flatMap((e) => e.evidenceIds),
          certainty: events.every((e) => e.certainty === "observed") ? "observed" : "inferred",
        }
      : {};
    const submitted = review.sections?.find((s) => s.key === key);
    const base = automatic[key] ?? facts;
    return {
      key,
      title,
      text: "本轮未采集足够证据，尚未分析。",
      evidenceIds: [],
      ...base,
      certainty: automatic[key] ? "observed" : (facts.certainty ?? "unverified"),
      ...submitted,
      status:
        submitted?.status ??
        (submitted
          ? submitted.certainty === "unverified"
            ? "not-tested"
            : "partial"
          : (base.status ?? "not-tested")),
      origin: submitted
        ? "review"
        : automatic[key]
          ? "metadata"
          : events.length
            ? "events"
            : "missing",
    };
  });
  const qualityWarnings = [];
  if (!goals.length) qualityWarnings.push("历史会话未配置目标清单，不能计算目标完成率。");
  for (const dimension of session.focus ?? []) {
    const sectionKey =
      { visual: "audiovisual", controls: "gameplay", stability: "issues" }[dimension] ?? dimension;
    if (!review.sections?.some((s) => s.key === sectionKey))
      qualityWarnings.push(
        `${dimension}：有关注目标但尚未提交专项分析，请复核现有证据或说明未测试原因。`,
      );
  }
  if (session.reportKind !== "diagnostic" && !covered.length)
    qualityWarnings.push("本轮未评分；评分覆盖率不代表试玩覆盖率。");
  return {
    schemaVersion: 1,
    sessionId: session.id,
    title: diagnostic ? session.title : `${review.gameName ?? session.title}｜新游戏试玩报告`,
    sessionTitle: session.title,
    lede: review.lede ?? (diagnostic ? "" : "从设计风格、核心玩法和实际关卡，认识这款游戏。"),
    generatedAt: new Date(now).toISOString(),
    status: session.status,
    source: session.source,
    apk: session.apk,
    device: session.device,
    depth: session.depth,
    strategy: session.strategy,
    objective: session.objective,
    reportKind: session.reportKind ?? "evaluation",
    goals,
    metrics,
    qualityWarnings,
    relatedSessions,
    coverage: {
      actions: session.actions.length,
      succeededActions: session.actions.filter((a) => a.status === "succeeded").length,
      events: session.events.length,
      wallElapsedSeconds: metrics.wallElapsedMs / 1000,
      focus: session.focus,
      goals: goalProgress,
      limitation: "目标由真实证据验收；输入成功不等于通关，未测试不计低分。",
    },
    scoring: {
      total:
        session.reportKind !== "diagnostic" && covered.length
          ? Math.round((covered.reduce((n, x) => n + x.score, 0) / covered.length) * 10)
          : null,
      coverage: covered.length / DIMENSIONS.length,
      confidence: covered.length
        ? covered.reduce((n, x) => n + x.confidence, 0) / covered.length
        : 0,
      method: "评分维度覆盖率与目标进度独立；仅对已评分维度等权换算，未评分不是游戏质量为零。",
      dimensions: scores,
    },
    sections,
    issues: review.issues ?? [],
    artifacts: session.artifacts,
    events: session.events,
    limitations: session.limitations,
  };
}
