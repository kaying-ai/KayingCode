import { classifyGenres, genreLabel } from "../collector/genres.js";
import { formatBeijingDateTime } from "../lib/date.js";
import type { BoardId, CalendarEvent } from "../types.js";
import { BOARD_LABELS, BOARDS } from "../types.js";
import type { RenderContext } from "./context.js";
import {
  categoryLabel,
  confidenceLabel,
  crowdingLabel,
  dataQualityLabel,
  escapeMarkdown,
  evidenceRefsMarkdown,
  formatNumber,
  formatPercent,
  formatRankChange,
  formatRating,
} from "./format.js";
import { resolveSummary } from "./summary.js";

function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.map(escapeMarkdown).join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(escapeMarkdown).join(" | ")} |`).join("\n");
  return `${head}\n${separator}\n${body}`;
}

function sourceLink(url: string): string {
  return `[来源](${url})`;
}

function genresOf(tags: string[]): string {
  return classifyGenres(tags).map(genreLabel).join("、");
}

function gameRow(event: CalendarEvent): string[] {
  return [
    event.eventDate,
    event.title,
    genresOf(event.tags),
    categoryLabel(event.category),
    formatNumber(event.reserveCount),
    formatRating(event.rating),
    event.developers[0] ?? "—",
    sourceLink(event.sourceUrl),
  ];
}

function boardRows(ctx: RenderContext, boardId: BoardId): string[][] {
  return ctx.metrics.boards[boardId].items.map((item) => [
    String(item.rank),
    item.title,
    genresOf(item.tags),
    formatRating(item.rating),
    formatNumber(item.reserveCount),
    formatRankChange(item.rankChange),
    sourceLink(item.sourceUrl),
  ]);
}

function markdownGenreInsights(ctx: RenderContext): string {
  const blocks: string[] = [];
  for (const insight of ctx.insights.tracks.slice(0, 8)) {
    const metric = ctx.metrics.genres.find((genre) => genre.id === insight.genreId);
    if (!metric) continue;
    blocks.push(
      [
        `#### ${metric.label} — ${crowdingLabel(metric.crowding.level)}（${metric.crowding.score ?? "—"}）`,
        "",
        `- 解读：${insight.rationale || "—"}`,
        `- 代表新游：${
          insight.notableGames.length > 0
            ? insight.notableGames.map((game) => `${game.title}（${game.reason}）`).join("；")
            : "—"
        }`,
        `- 机会：${insight.opportunities.length > 0 ? insight.opportunities.join("；") : "—"}`,
        `- 风险：${insight.risks.length > 0 ? insight.risks.join("；") : "—"}`,
        `- 证据：${evidenceRefsMarkdown(insight.evidenceIds, ctx.evidence)}`,
        "",
      ].join("\n"),
    );
  }
  if (blocks.length === 0) return "本轮没有可用的赛道深度解读。";
  return blocks.join("\n");
}

function markdownOpportunities(ctx: RenderContext): string {
  const facts = ctx.insights.opportunities.filter((item) => item.kind === "fact");
  const inferences = ctx.insights.opportunities.filter((item) => item.kind === "inference");
  const risks = ctx.insights.risks;
  const render = (items: { text: string; evidenceIds: string[] }[], empty: string): string =>
    items.length > 0
      ? items
          .map(
            (item) =>
              `- ${item.text}（证据：${evidenceRefsMarkdown(item.evidenceIds, ctx.evidence)}）`,
          )
          .join("\n")
      : `- ${empty}`;
  return [
    "### 事实",
    "",
    render(facts, "本轮没有额外事实型机会。"),
    "",
    "### 推断",
    "",
    render(inferences, "本轮没有额外推断型机会。"),
    "",
    "### 风险",
    "",
    render(risks, "本轮没有识别的风险。"),
  ].join("\n");
}

export function renderMarkdown(ctx: RenderContext): string {
  const { snapshot, metrics, insights } = ctx;
  const summary = resolveSummary(ctx);
  const warnings = [...snapshot.warnings, ...metrics.warnings, ...ctx.warnings];

  const releaseRows = metrics.newGames.topReleases.map(gameRow);
  const reservationRows = metrics.newGames.topReservations.map(gameRow);
  const genreRows = metrics.genres.map((genre) => [
    genre.label,
    String(genre.newGames7d),
    String(genre.newGames30d),
    String(genre.newReservations7d),
    formatPercent(genre.boardShare),
    genre.crowding.score === null ? "—" : String(genre.crowding.score),
    crowdingLabel(genre.crowding.level),
    genre.crowding.components.supply === null ? "—" : genre.crowding.components.supply.toFixed(1),
    genre.crowding.components.list === null ? "—" : genre.crowding.components.list.toFixed(1),
    genre.crowding.components.reservation === null
      ? "—"
      : genre.crowding.components.reservation.toFixed(1),
  ]);

  const movers = metrics.boardUnion
    .filter((item) => item.boards.some((membership) => membership.rankChange !== null))
    .map((item) => {
      const changes = item.boards
        .filter((membership) => membership.rankChange !== null)
        .map(
          (membership) =>
            `${BOARD_LABELS[membership.board]} ${formatRankChange(membership.rankChange)}`,
        );
      const score = Math.max(
        ...item.boards.map((membership) => Math.abs(membership.rankChange ?? 0)),
      );
      return { item, changes, score };
    })
    .sort((a, b) => b.score - a.score || a.item.appId - b.item.appId)
    .slice(0, 10);

  const crossBoard = metrics.boardUnion
    .filter((item) => item.boards.length > 1)
    .sort((a, b) => b.boards.length - a.boards.length || a.boards[0]!.rank - b.boards[0]!.rank)
    .slice(0, 10);

  const newGameInsights = insights.newGames
    .map((insight) => {
      const event = snapshot.calendar.events.find((item) => item.appId === insight.appId);
      if (!event) return "";
      return [
        `#### ${insight.title}`,
        "",
        `- 一句话：${insight.oneLiner}`,
        `- 目标用户：${insight.audience}`,
        `- 可比产品：${
          insight.comparables.length > 0
            ? insight.comparables.map((item) => `${item.title}（${item.reason}）`).join("；")
            : "—"
        }`,
        `- 信号：${
          insight.signals.length > 0
            ? insight.signals
                .map(
                  (signal) => `${signal.label}=${signal.value}（${signal.evidenceIds.join(" ")}）`,
                )
                .join("；")
            : "—"
        }`,
        `- 风险：${insight.risks.length > 0 ? insight.risks.join("；") : "—"}`,
        `- 置信度：${confidenceLabel(insight.confidence)}`,
        `- 来源：${sourceLink(event.sourceUrl)}`,
        "",
      ].join("\n");
    })
    .filter(Boolean)
    .join("\n");

  const boardSections = BOARDS.map((board) => {
    const snapshotBoard = metrics.boards[board.id];
    return [
      `### ${snapshotBoard.label}`,
      "",
      snapshotBoard.degraded ? "> 数据降级：本轮可用条目不足 30 条。" : "",
      table(
        ["名次", "游戏", "赛道", "评分", "预约", "变化", "来源"],
        boardRows(ctx, board.id).slice(0, 20),
      ),
      "",
    ]
      .filter(Boolean)
      .join("\n");
  }).join("\n");

  const boardInsights = insights.boards
    .map((item) => {
      const label = BOARD_LABELS[item.board];
      return [
        `- **${label}**：${item.summary}`,
        item.movers.length > 0 ? `  变化：${item.movers.join("；")}` : "",
        item.crossBoard.length > 0 ? `  交叉上榜：${item.crossBoard.join("；")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const evidenceRows = snapshot.evidence.map((item) => [
    item.id,
    item.kind,
    item.url,
    item.rawFile ?? "—",
  ]);

  const appendixBoards = BOARDS.map((board) => {
    const snapshotBoard = metrics.boards[board.id];
    return [
      `### ${snapshotBoard.label}（完整 Top${snapshotBoard.items.length}）`,
      "",
      table(["名次", "游戏", "赛道", "评分", "预约", "变化", "来源"], boardRows(ctx, board.id)),
      "",
    ].join("\n");
  }).join("\n");

  return [
    `# TapTap 游戏日报 · ${snapshot.reportDate}`,
    "",
    `> 数据截止：${formatBeijingDateTime(Date.parse(snapshot.capturedAt) / 1000)}（北京时间） · 来源：${
      snapshot.source.kind === "web" ? "TapTap 公开页面" : "人工导入"
    } · 质量：${dataQualityLabel(metrics.dataQuality)}`,
    `> Snapshot：\`${snapshot.contentHash.slice(0, 12)}\` · 报告生成：${formatBeijingDateTime(
      Date.parse(ctx.generatedAt) / 1000,
    )} · 对比基线：${metrics.previousReportDate ?? "无"}`,
    "",
    "## 01 今日速览",
    "",
    ...summary.map((item) => `- ${item}`),
    "",
    "## 02 新游发现",
    "",
    `近 7 日：首发 **${metrics.newGames.releases7d}** 款，新开预约 **${metrics.newGames.reservations7d}** 款，测试 **${metrics.newGames.tests7d}** 款；涉及游戏 **${metrics.newGames.uniqueGames7d}** 款。`,
    "",
    "### 首发 Top 20",
    "",
    releaseRows.length > 0
      ? table(["日期", "游戏", "赛道", "类型", "预约", "评分", "厂商", "来源"], releaseRows)
      : "本轮没有可用的首发记录。",
    "",
    "### 新开预约 Top 20",
    "",
    reservationRows.length > 0
      ? table(["日期", "游戏", "赛道", "类型", "预约", "评分", "厂商", "来源"], reservationRows)
      : "本轮没有可用的新开预约记录。",
    "",
    "### 深度解读",
    "",
    newGameInsights || "本轮没有可用的新游深度解读。",
    "",
    "## 03 热门游戏",
    "",
    boardSections,
    "### 榜单洞察",
    "",
    boardInsights || "本轮没有可用的榜单洞察。",
    "",
    "### 排名变化 Top 10",
    "",
    movers.length > 0
      ? table(
          ["游戏", "变化"],
          movers.map(({ item, changes }) => [item.title, changes.join("；")]),
        )
      : "没有可用的上一份快照，排名变化为空。",
    "",
    "### 交叉上榜",
    "",
    crossBoard.length > 0
      ? table(
          ["游戏", "上榜情况"],
          crossBoard.map((item) => [
            item.title,
            item.boards
              .map((membership) => `${BOARD_LABELS[membership.board]} #${membership.rank}`)
              .join("；"),
          ]),
        )
      : "本轮没有跨榜游戏。",
    "",
    "## 04 题材赛道",
    "",
    "> 拥挤度是当日各赛道之间的相对指数（0–100），只用于横向比较，不代表绝对市场规模；多标签游戏会同时计入多个赛道。",
    "",
    table(
      [
        "赛道",
        "7日新游",
        "30日新游",
        "7日预约",
        "三榜占比",
        "拥挤度",
        "等级",
        "供给分",
        "榜单分",
        "预约分",
      ],
      genreRows,
    ),
    "",
    "### 赛道解读 Top 8",
    "",
    markdownGenreInsights(ctx),
    "",
    "## 05 机会与风险",
    "",
    markdownOpportunities(ctx),
    "",
    "## 06 数据说明",
    "",
    `- 报告日期：${snapshot.reportDate}；采集时间：${formatBeijingDateTime(
      Date.parse(snapshot.capturedAt) / 1000,
    )}（北京时间）。`,
    `- 榜单：下载/热门、预约、热玩 Top50；排名变化对比 ${metrics.previousReportDate ?? "无"}。`,
    `- 新游窗口：最近 7 天；赛道供给窗口：最近 30 天；日历可用 ${snapshot.calendar.daysAvailable}/${snapshot.calendar.windowDays} 天。`,
    "- 所有数字来自 snapshot/metrics；LLM 仅生成解读，且必须引用 evidenceId。",
    ...(insights.dataNotes.length > 0 ? insights.dataNotes.map((item) => `- ${item}`) : []),
    "",
    "### 质量警告",
    "",
    warnings.length > 0
      ? table(
          ["代码", "说明"],
          warnings.map((warning) => [warning.code, warning.message]),
        )
      : "无。",
    "",
    "## 07 附录",
    "",
    "### 完整榜单",
    "",
    appendixBoards,
    "### 证据索引",
    "",
    table(["ID", "类型", "URL", "原始文件"], evidenceRows),
    "",
    `> 在线报告：${ctx.reportUrl}`,
    "",
  ].join("\n");
}
