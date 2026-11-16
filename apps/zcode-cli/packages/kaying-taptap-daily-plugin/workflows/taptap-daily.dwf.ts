/* kayingcode-workflow
description: 生成 TapTap 游戏日报，包含新游发现、三榜变化与题材赛道拥挤度。
whenToUse: 每日或补跑 TapTap 游戏日报时使用；需要 date 参数。
args:
  date:
    type: string
    required: true
    description: 报告日期，格式 YYYY-MM-DD。
  source:
    type: string
    required: false
    default: http
    description: http 采集或 import 人工导入。
  calendarDays:
    type: number
    required: false
    default: 30
  maxNewGames:
    type: number
    required: false
    default: 6
  maxTracks:
    type: number
    required: false
    default: 8
  publicBaseUrl:
    type: string
    required: false
  collector:
    type: string
    required: false
  metricsScript:
    type: string
    required: false
  renderer:
    type: string
    required: false
*/
/**
 * TapTap 游戏日报动态工作流。
 *
 * 数据与数字由 collector/metrics/renderer 三个确定性脚本产生；subagent 只负责解读、
 * 赛道判断和摘要，并且每条结论都必须引用 evidenceId。核验员独立复核后才进入报告。
 *
 * 运行方式（Linux 服务）：
 *   /taptap-daily 2026-11-16
 * 或 CreateWorkflow(saved: { name: "taptap-daily", args: { date: "2026-11-16" } })
 */

interface EvidenceLite {
  id: string;
  url: string;
}

interface WarningLite {
  code: string;
  message: string;
}

interface EventRaw {
  appId: number;
  title: string;
  tags: string[];
  developers: string[];
  rating: number | null;
  reserveCount: number;
  hitsTotal: number;
  playTotal: number;
  releasedTime: number | null;
  expectedLaunchTime: string | null;
  sourceUrl: string;
  eventId: number;
  eventDate: string;
  category: string;
  subEventTypeTitle: string;
  evidenceId: string;
}

interface SnapshotLite {
  reportDate: string;
  capturedAt: string;
  contentHash: string;
  calendar: {
    events: EventRaw[];
    daysAvailable: number;
    windowDays: number;
  };
  warnings: WarningLite[];
  evidence: EvidenceLite[];
}

interface BoardItemLite {
  appId: number;
  title: string;
  tags: string[];
  rating: number | null;
  reserveCount: number;
  rank: number;
  rankChange: number | null;
  sourceUrl: string;
}

interface BoardLite {
  id: string;
  label: string;
  degraded: boolean;
  total: number | null;
  items: BoardItemLite[];
}

interface BoardMembershipLite {
  board: string;
  rank: number;
  rankChange: number | null;
}

interface BoardUnionLite {
  appId: number;
  title: string;
  tags: string[];
  rating: number | null;
  reserveCount: number;
  boards: BoardMembershipLite[];
}

interface GenreTopLite {
  appId: number;
  title: string;
  eventDate: string;
  category: string;
  reserveCount: number;
  rating: number | null;
  sourceUrl: string;
  evidenceId: string;
}

interface GenreBoardLite {
  appId: number;
  title: string;
  rank: number;
  rankChange: number | null;
  sourceUrl: string;
}

interface CrowdingLite {
  score: number | null;
  level: string;
  components: {
    supply: number | null;
    list: number | null;
    reservation: number | null;
  };
}

interface GenreLite {
  id: string;
  label: string;
  newGames7d: number;
  newGames30d: number;
  newReservations7d: number;
  boardCount: number;
  boardShare: number;
  crowding: CrowdingLite;
  topNewGames: GenreTopLite[];
  boardTopGames: GenreBoardLite[];
}

interface MetricsLite {
  reportDate: string;
  snapshotHash: string;
  dataQuality: string;
  previousReportDate: string | null;
  boards: {
    download: BoardLite;
    reserve: BoardLite;
    pop: BoardLite;
  };
  boardUnion: BoardUnionLite[];
  newGames: {
    releases7d: number;
    reservations7d: number;
    tests7d: number;
    uniqueGames7d: number;
    topReleases: EventRaw[];
    topReservations: EventRaw[];
  };
  genres: GenreLite[];
  counts: {
    release7d: number;
    release30d: number;
    reservation7d: number;
    test7d: number;
    update7d: number;
    discount7d: number;
  };
  warnings: WarningLite[];
}

interface NewGameInsight {
  appId: number;
  title: string;
  oneLiner: string;
  audience: string;
  comparables: { title: string; reason: string }[];
  signals: { label: string; value: string; evidenceIds: string[] }[];
  risks: string[];
  confidence: "high" | "medium" | "low";
  evidenceIds: string[];
}

interface BoardInsight {
  board: string;
  summary: string;
  movers: string[];
  crossBoard: string[];
  evidenceIds: string[];
}

interface TrackInsight {
  genreId: string;
  crowdingLevel: "low" | "medium" | "high" | "unknown";
  rationale: string;
  notableGames: { appId: number; title: string; reason: string; evidenceIds: string[] }[];
  opportunities: string[];
  risks: string[];
  evidenceIds: string[];
}

interface Verdict {
  id: string;
  holds: boolean;
  note: string;
}

interface OpportunityDraft {
  text: string;
  kind: "fact" | "inference";
  evidenceIds: string[];
}

interface WriterOutput {
  summary: string[];
  opportunities: OpportunityDraft[];
  risks: OpportunityDraft[];
  dataNotes: string[];
}

interface InsightsDraft {
  summary: string[];
  newGames: NewGameInsight[];
  boards: BoardInsight[];
  tracks: TrackInsight[];
  opportunities: OpportunityDraft[];
  risks: OpportunityDraft[];
  dataNotes: string[];
}

interface ReportRunResult {
  conclusion: string;
  reportPath: string;
  htmlPath: string;
  reportJsonPath: string;
  dataQuality: string;
  releases7d: number;
  reservations7d: number;
  verifiedNewGames: number;
  verifiedBoards: number;
  verifiedTracks: number;
  notCovered: string[];
}

const date = String(args.date ?? "");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  throw new Error("taptap-daily requires args.date in YYYY-MM-DD form");
}
const collectorPath = String(args.collector ?? "tools/taptap-daily/collector.mjs");
const metricsPath = String(args.metricsScript ?? "tools/taptap-daily/metrics.mjs");
const rendererPath = String(args.renderer ?? "tools/taptap-daily/renderer.mjs");
const publicBaseUrl = String(args.publicBaseUrl ?? "");
const source = String(args.source ?? "http");
if (source !== "http" && source !== "import") {
  throw new Error("taptap-daily args.source must be http or import");
}
const calendarDays = Math.max(7, Math.min(30, Number(args.calendarDays ?? 30)));
const maxNewGames = Math.max(1, Math.min(10, Number(args.maxNewGames ?? 6)));
const maxTracks = Math.max(1, Math.min(12, Number(args.maxTracks ?? 8)));
const NO_TOOLS =
  "禁止调用任何工具（Bash、Read、Write、Edit、Glob、Grep、WebFetch、WebSearch 等）；不要读取工作区文件，不要访问网络；所有信息已在提示中，直接调用 submit_result。";

const dataDir = `data/daily/${date}`;
const snapshotPath = `${dataDir}/snapshot.json`;
const metricsFile = `${dataDir}/metrics.json`;
const rawDir = `${dataDir}/raw`;
const reportDir = `reports/${date}`;

phase("采集 TapTap 公开数据");
const collectRun = await world.run(
  "node",
  [
    collectorPath,
    "--date",
    date,
    "--out",
    snapshotPath,
    "--raw-dir",
    rawDir,
    "--calendar-days",
    String(calendarDays),
    "--board-limit",
    "50",
    "--source",
    source,
    "--import-dir",
    `${dataDir}/import`,
  ],
  { timeoutMs: 20 * 60_000 },
);
if (collectRun.exitCode !== 0) {
  throw new Error(
    `collector failed (exit ${collectRun.exitCode}): ${collectRun.stderr.slice(-1800)}`,
  );
}
const snapshot = JSON.parse(await files.read(snapshotPath)) as SnapshotLite;
log(`采集完成：三榜与 ${snapshot.calendar.events.length} 条日历事件`);

phase("计算榜单与赛道指标");
const metricsRun = await world.run(
  "node",
  [metricsPath, "--snapshot", snapshotPath, "--out", metricsFile, "--history-dir", "data/daily"],
  { timeoutMs: 120_000 },
);
if (metricsRun.exitCode !== 0) {
  throw new Error(
    `metrics failed (exit ${metricsRun.exitCode}): ${metricsRun.stderr.slice(-1800)}`,
  );
}
const metrics = JSON.parse(await files.read(metricsFile)) as MetricsLite;

const genreSummaries = metrics.genres.map((genre) => ({
  id: genre.id,
  label: genre.label,
  newGames7d: genre.newGames7d,
  newGames30d: genre.newGames30d,
  newReservations7d: genre.newReservations7d,
  boardShare: genre.boardShare,
  crowding: genre.crowding,
}));

const crossBoard = metrics.boardUnion
  .filter((item) => item.boards.length > 1)
  .sort((a, b) => b.boards.length - a.boards.length || a.boards[0].rank - b.boards[0].rank)
  .slice(0, 10)
  .map((item) => ({
    appId: item.appId,
    title: item.title,
    boards: item.boards,
  }));

const newGameCandidates = metrics.newGames.topReleases.slice(0, maxNewGames);
const trackCandidates = metrics.genres
  .filter((genre) => genre.id !== "other")
  .sort((a, b) => b.newGames30d - a.newGames30d)
  .slice(0, maxTracks);
const boardCandidates = [metrics.boards.download, metrics.boards.reserve, metrics.boards.pop];

phase("分析新游与榜单");

const newGameResults = await Promise.all(
  newGameCandidates.map(async (game) => {
    try {
      return await agent(
        `new-game-${game.appId}`,
        "你是 TapTap 游戏市场分析员。只依据提供的 JSON 数据写结论；数字必须与数据一致；不得编造游戏、日期、排名、预约量或证据。可比产品可以来自模型知识，但必须只写在 comparables 字段，不得为它编造 evidenceId。输出必须严格符合 submit_result 的结构。 + NO_TOOLS",
      ).ask<NewGameInsight>(
        [
          `分析 TapTap 新游并输出结构化解读。报告日期 ${date}。`,
          `新游数据：${JSON.stringify(game)}`,
          `赛道指标：${JSON.stringify(genreSummaries)}`,
          `近 7 日计数：${JSON.stringify(metrics.newGames)}`,
          "要求：oneLiner 不超过 60 字；audience 不超过 40 字；comparables 最多 3 个并说明原因；signals 最多 4 条，只写数据中能直接读出的预约/评分/首发状态/赛道供给，每条必须带 evidenceIds；risks 最多 3 条；confidence 只能是 high/medium/low；evidenceIds 至少包含该事件的 evidenceId。",
        ].join("\n"),
      );
    } catch (error) {
      log(`新游分析失败 ${game.title}: ${String(error)}`);
      return null;
    }
  }),
);
const newGameInsights: NewGameInsight[] = [];
for (const result of newGameResults) {
  if (result !== null) newGameInsights.push(result);
}

const boardResults = await Promise.all(
  boardCandidates.map(async (board) => {
    try {
      return await agent(
        `board-${board.id}`,
        "你是 TapTap 榜单分析师。只依据提供的榜单数据描述排名、变化和交叉上榜；数字必须与数据一致；不得编造游戏、名次或日期。输出必须严格符合 submit_result 的结构。 + NO_TOOLS",
      ).ask<BoardInsight>(
        [
          `分析 ${board.label} 本轮榜单。报告日期 ${date}，对比基线 ${metrics.previousReportDate ?? "无"}。`,
          `榜单数据：${JSON.stringify({ label: board.label, degraded: board.degraded, items: board.items.slice(0, 20) })}`,
          `交叉上榜：${JSON.stringify(crossBoard)}`,
          "要求：summary 不超过 120 字；movers 最多 5 条，写游戏名和名次变化；crossBoard 最多 5 条；evidenceIds 使用 app:<appId> 形式，只能引用榜单中出现的 appId。",
        ].join("\n"),
      );
    } catch (error) {
      log(`榜单分析失败 ${board.label}: ${String(error)}`);
      return null;
    }
  }),
);
const boardInsights: BoardInsight[] = [];
for (const result of boardResults) {
  if (result !== null) boardInsights.push(result);
}

phase("分析题材赛道");
const trackResults = await Promise.all(
  trackCandidates.map(async (track) => {
    try {
      return await agent(
        `track-${track.id}`,
        "你是游戏赛道分析师。只依据提供的赛道指标和新游数据判断供给与拥挤度；数字必须与数据一致；不得编造游戏、排名或日期。输出必须严格符合 submit_result 的结构。 + NO_TOOLS",
      ).ask<TrackInsight>(
        [
          `分析赛道 ${track.label}。报告日期 ${date}。`,
          `赛道数据：${JSON.stringify(track)}`,
          `近 7 日计数：${JSON.stringify(metrics.newGames)}`,
          "要求：crowdingLevel 必须与 track.crowding.level 一致（数据缺失时用 unknown）；rationale 不超过 120 字，解释供给/榜单/预约三个分量；notableGames 最多 3 个，只能从 track.topNewGames 或 track.boardTopGames 中选；opportunities/risks 各最多 3 条，明确是事实还是推断；evidenceIds 使用 topNewGames 的 evidenceId 或 app:<appId>。",
        ].join("\n"),
      );
    } catch (error) {
      log(`赛道分析失败 ${track.label}: ${String(error)}`);
      return null;
    }
  }),
);
const trackInsights: TrackInsight[] = [];
for (const result of trackResults) {
  if (result !== null) trackInsights.push(result);
}

phase("交叉核验");

const newGameEvidence = newGameCandidates.map((game) => ({
  appId: game.appId,
  evidenceId: game.evidenceId,
  title: game.title,
}));
const newGameVerdicts = await agent(
  "verifier-new-games",
  "你是独立核验员，没有参与写作。逐条检查新游解读：数字是否与提供的计数一致；evidenceIds 是否都在允许集合；是否编造了游戏、日期、排名或预约量；comparables 是否被误当成快照事实。只有全部检查通过才 holds=true。输出必须严格符合 submit_result 的结构。 + NO_TOOLS",
).ask<Verdict[]>(
  [
    `核验以下新游解读。报告日期 ${date}。`,
    `允许的证据：${JSON.stringify(newGameEvidence)}`,
    `确定性计数：${JSON.stringify(metrics.newGames)}`,
    `待核验解读：${JSON.stringify(newGameInsights)}`,
    '每个 Verdict 的 id 使用 "new:<appId>"；发现任何数字不一致、证据缺失或编造内容时 holds=false 并在 note 中说明。',
  ].join("\n"),
);

const boardEvidence = boardCandidates.map((board) => ({
  board: board.id,
  evidenceIds: board.items.slice(0, 20).map((item) => `app:${item.appId}`),
}));
const boardVerdicts = await agent(
  "verifier-boards",
  "你是独立核验员，没有参与写作。逐条检查榜单解读：名次、变化、交叉上榜是否与提供的数据一致；evidenceIds 是否有效；不得接受编造的游戏或名次。输出必须严格符合 submit_result 的结构。 + NO_TOOLS",
).ask<Verdict[]>(
  [
    `核验以下榜单解读。报告日期 ${date}。`,
    `允许的证据：${JSON.stringify(boardEvidence)}`,
    `榜单数据：${JSON.stringify({
      download: metrics.boards.download.items.slice(0, 20),
      reserve: metrics.boards.reserve.items.slice(0, 20),
      pop: metrics.boards.pop.items.slice(0, 20),
      crossBoard,
    })}`,
    `待核验解读：${JSON.stringify(boardInsights)}`,
    '每个 Verdict 的 id 使用 "board:<board>"。',
  ].join("\n"),
);

const trackEvidence = trackCandidates.map((track) => ({
  genreId: track.id,
  evidenceIds: [
    ...track.topNewGames.map((game) => game.evidenceId),
    ...track.boardTopGames.map((game) => `app:${game.appId}`),
  ],
}));
const trackVerdicts = await agent(
  "verifier-tracks",
  "你是独立核验员，没有参与写作。逐条检查赛道解读：crowdingLevel 是否与数据一致；供给/预约/榜单数字是否被篡改；notableGames 是否来自允许列表；evidenceIds 是否有效。输出必须严格符合 submit_result 的结构。 + NO_TOOLS",
).ask<Verdict[]>(
  [
    `核验以下赛道解读。报告日期 ${date}。`,
    `允许的证据：${JSON.stringify(trackEvidence)}`,
    `赛道确定性数据：${JSON.stringify(trackCandidates)}`,
    `待核验解读：${JSON.stringify(trackInsights)}`,
    '每个 Verdict 的 id 使用 "track:<genreId>"。',
  ].join("\n"),
);

const notCovered: string[] = [];
const newGameVerdictMap = new Map<string, Verdict>();
for (const verdict of newGameVerdicts) newGameVerdictMap.set(verdict.id, verdict);
const verifiedNewGames: NewGameInsight[] = [];
for (const insight of newGameInsights) {
  const verdict = newGameVerdictMap.get(`new:${insight.appId}`);
  if (verdict && verdict.holds) {
    verifiedNewGames.push(insight);
    report({
      kind: "new-game",
      appId: insight.appId,
      title: insight.title,
      oneLiner: insight.oneLiner,
      confidence: insight.confidence,
    });
  } else {
    notCovered.push(`新游 ${insight.title}: ${verdict ? verdict.note : "核验结果缺失"}`);
  }
}

const boardVerdictMap = new Map<string, Verdict>();
for (const verdict of boardVerdicts) boardVerdictMap.set(verdict.id, verdict);
const verifiedBoards: BoardInsight[] = [];
for (const insight of boardInsights) {
  const verdict = boardVerdictMap.get(`board:${insight.board}`);
  if (verdict && verdict.holds) {
    verifiedBoards.push(insight);
    report({ kind: "board", board: insight.board, summary: insight.summary });
  } else {
    notCovered.push(`榜单 ${insight.board}: ${verdict ? verdict.note : "核验结果缺失"}`);
  }
}

const trackVerdictMap = new Map<string, Verdict>();
for (const verdict of trackVerdicts) trackVerdictMap.set(verdict.id, verdict);
const verifiedTracks: TrackInsight[] = [];
for (const insight of trackInsights) {
  const verdict = trackVerdictMap.get(`track:${insight.genreId}`);
  if (verdict && verdict.holds) {
    verifiedTracks.push(insight);
    report({
      kind: "track",
      genreId: insight.genreId,
      crowdingLevel: insight.crowdingLevel,
      rationale: insight.rationale,
    });
  } else {
    notCovered.push(`赛道 ${insight.genreId}: ${verdict ? verdict.note : "核验结果缺失"}`);
  }
}

phase("撰写日报摘要");
const writer = await agent(
  "writer",
  "你是 TapTap 游戏日报主编。只使用已核验的材料和给定的确定性数字；不得新增或改写任何数字；summary 3-5 条；opportunities/risks 各最多 5 条并标注 fact 或 inference；evidenceIds 只能引用给定材料中出现的 ID。输出必须严格符合 submit_result 的结构。 + NO_TOOLS",
).ask<WriterOutput>(
  [
    `撰写 ${date} TapTap 游戏日报的摘要与机会风险。`,
    `确定性数字：${JSON.stringify({
      counts: metrics.counts,
      newGames: {
        releases7d: metrics.newGames.releases7d,
        reservations7d: metrics.newGames.reservations7d,
        tests7d: metrics.newGames.tests7d,
        uniqueGames7d: metrics.newGames.uniqueGames7d,
      },
      dataQuality: metrics.dataQuality,
      previousReportDate: metrics.previousReportDate,
      warnings: [...snapshot.warnings, ...metrics.warnings],
      genres: genreSummaries,
    })}`,
    `已核验的新游解读：${JSON.stringify(verifiedNewGames)}`,
    `已核验的榜单解读：${JSON.stringify(verifiedBoards)}`,
    `已核验的赛道解读：${JSON.stringify(verifiedTracks)}`,
    "要求：summary 3-5 条，每条不超过 80 字；opportunities/risks 各最多 5 条；dataNotes 最多 5 条，写清数据窗口、缺失和口径；不得把推断写成事实。",
  ].join("\n"),
);

const insights: InsightsDraft = {
  summary: writer.summary.slice(0, 5),
  newGames: verifiedNewGames,
  boards: verifiedBoards,
  tracks: verifiedTracks,
  opportunities: writer.opportunities.slice(0, 5),
  risks: writer.risks.slice(0, 5),
  dataNotes: writer.dataNotes.slice(0, 5),
};

phase("渲染并发布产物");
const renderRun = await world.run(
  "node",
  [
    rendererPath,
    "--snapshot",
    snapshotPath,
    "--metrics",
    metricsFile,
    "--insights-json",
    JSON.stringify(insights),
    "--out-dir",
    reportDir,
    "--reports-root",
    "reports",
    "--public-base-url",
    publicBaseUrl,
  ],
  { timeoutMs: 180_000 },
);
if (renderRun.exitCode !== 0) {
  throw new Error(`renderer failed (exit ${renderRun.exitCode}): ${renderRun.stderr.slice(-1800)}`);
}

const markdown = await files.read(`${reportDir}/report.md`);
const summaryMarkdown = insights.summary.map((item) => `- ${item}`).join("\n");
await artifact.markdown("taptap-daily-summary", summaryMarkdown, {
  title: `TapTap 游戏日报 ${date} 摘要`,
  description: `新游 ${metrics.newGames.releases7d} 款、预约 ${metrics.newGames.reservations7d} 款、赛道 ${metrics.genres.length} 个`,
});
await artifact.file("taptap-daily-markdown", `${reportDir}/report.md`, {
  title: `TapTap 游戏日报 ${date} Markdown`,
});
await artifact.file("taptap-daily-html", `${reportDir}/report.html`, {
  title: `TapTap 游戏日报 ${date} HTML`,
});
await artifact.file("taptap-daily-json", `${reportDir}/report.json`, {
  title: `TapTap 游戏日报 ${date} JSON`,
});
report({
  kind: "daily-report",
  date,
  dataQuality: metrics.dataQuality,
  counts: metrics.counts,
});

const result: ReportRunResult = {
  conclusion: `${date} TapTap 游戏日报已生成：首发 ${metrics.newGames.releases7d} 款，新开预约 ${metrics.newGames.reservations7d} 款，数据质量 ${metrics.dataQuality}。`,
  reportPath: `${reportDir}/report.md`,
  htmlPath: `${reportDir}/report.html`,
  reportJsonPath: `${reportDir}/report.json`,
  dataQuality: metrics.dataQuality,
  releases7d: metrics.newGames.releases7d,
  reservations7d: metrics.newGames.reservations7d,
  verifiedNewGames: verifiedNewGames.length,
  verifiedBoards: verifiedBoards.length,
  verifiedTracks: verifiedTracks.length,
  notCovered,
};
return result;
