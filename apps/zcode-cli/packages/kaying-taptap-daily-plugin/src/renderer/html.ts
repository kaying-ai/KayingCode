import { readFileSync } from "node:fs";
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
  escapeHtml,
  evidenceRefsHtml,
  formatNumber,
  formatPercent,
  formatRankChange,
  formatRating,
  safeImageUrl,
} from "./format.js";
import { resolveSummary } from "./summary.js";

type Cell = string | { html: string };

/**
 * 客服二维码随报告内嵌为 data URL：源码测试走 plugin/assets，打包后走
 * dist/ 旁的 PNG（build.mjs 复制），报告因此不需要额外的静态文件。
 */
const CONTACT_QR_CANDIDATES = [
  new URL("../../assets/support-contact-qr.png", import.meta.url),
  new URL("./support-contact-qr.png", import.meta.url),
];

function loadContactQrDataUrl(): string {
  for (const url of CONTACT_QR_CANDIDATES) {
    try {
      return `data:image/png;base64,${readFileSync(url).toString("base64")}`;
    } catch {
      // 尝试下一个候选路径；全部失败时页脚仍保留邮箱。
    }
  }
  return "";
}

const contactQrDataUrl = loadContactQrDataUrl();

function contactQrMarkup(): string {
  return contactQrDataUrl
    ? `<img src="${escapeHtml(contactQrDataUrl)}" alt="客服二维码" width="200" height="200">`
    : `<p class="muted small">二维码暂不可用，请邮件联系。</p>`;
}

const BASE_CSS = `
:root{--bg:#f5f6f8;--card:#fff;--ink:#1f2329;--muted:#667085;--line:#e4e7ec;--accent:#0f766e;--accent-soft:#e6f4f1;--warn:#b45309;--bad:#b42318;--good:#067647}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:1120px;margin:0 auto;padding:28px 20px 64px}
.hero{background:linear-gradient(135deg,#0f766e,#115e59);color:#fff;border-radius:18px;padding:28px 28px 24px;box-shadow:0 10px 30px rgba(15,118,110,.18);display:flex;align-items:center;justify-content:space-between;gap:24px}
.hero-main{min-width:0;flex:1}
.hero h1{margin:0 0 8px;font-size:30px;line-height:1.25}
.hero p{margin:4px 0;color:#d1fae5;font-size:13px}
.badges{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600;background:rgba(255,255,255,.16);color:#fff}
.badge.ok{background:#dcfae6;color:#067647}
.badge.degraded{background:#fef0c7;color:#93370d}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:18px 0 4px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}
.card .label{color:var(--muted);font-size:12px}
.card .value{font-size:28px;font-weight:700;line-height:1.2;margin-top:4px}
.card .note{color:var(--muted);font-size:12px;margin-top:4px}
section{margin-top:26px}
h2{font-size:22px;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid var(--accent-soft)}
h3{font-size:17px;margin:22px 0 10px}
h4{font-size:15px;margin:18px 0 8px}
ul,ol{margin:8px 0 0;padding-left:22px}
li{margin:4px 0}
.muted{color:var(--muted)}
.small{font-size:12px}
.table-wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px;margin:10px 0 18px}
table{border-collapse:collapse;width:100%;min-width:680px;font-size:13px}
th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{background:#f9fafb;color:#475467;font-weight:600;white-space:nowrap}
tr:last-child td{border-bottom:0}
tbody tr:hover{background:#fcfcfd}
.game-icon{display:block;width:28px;height:28px;border-radius:7px;object-fit:cover;background:#eaecf0}
.tag{display:inline-block;border-radius:999px;padding:1px 8px;background:var(--accent-soft);color:#0f766e;font-size:12px;white-space:nowrap}
.level-high{background:#fee4e2;color:#b42318}
.level-medium{background:#fef0c7;color:#93370d}
.level-low{background:#dcfae6;color:#067647}
.level-unknown{background:#eaecf0;color:#475467}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.grid>*{min-width:0}
.insight{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;min-width:0;overflow-wrap:anywhere;word-break:break-word}
.insight h4{margin:0 0 6px}
.kv{display:grid;grid-template-columns:88px minmax(0,1fr);gap:4px 10px;font-size:13px;margin-top:8px}
.kv dt{color:var(--muted)}
.kv dd{margin:0;min-width:0;overflow-wrap:anywhere;word-break:break-word}
.notice{background:#fffaeb;border:1px solid #fedf89;color:#93370d;border-radius:10px;padding:10px 12px;margin:10px 0}
details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin:10px 0}
summary{cursor:pointer;font-weight:600}
.footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 10px;margin-top:36px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;text-align:center}
.footer-sep{color:#d0d5dd}
.hero-contact{flex:none;width:150px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.24);border-radius:14px;padding:9px;text-align:center;color:#fff}
.hero-contact .hero-contact-title{display:flex;align-items:center;justify-content:center;gap:5px;font-size:12px;font-weight:600}
.hero-contact img{display:block;width:100%;max-width:120px;height:auto;margin:6px auto 0;border-radius:7px;background:#fff}
.hero-contact p{margin:5px 0 0;color:#d1fae5;font-size:10px;line-height:1.35}
.hero-contact a{color:#fff}
.hero-contact .muted{color:#d1fae5}
.risk{border-left:4px solid var(--bad)}
.opportunity{border-left:4px solid var(--good)}
@media (max-width:720px){.hero{padding:22px 18px;flex-wrap:wrap;gap:14px}.hero h1{font-size:24px}.hero-main{flex-basis:100%}.hero-contact{width:132px;margin-left:auto}.hero-contact img{max-width:108px}.wrap{padding:18px 12px 48px}.footer{flex-direction:column;gap:3px}.footer-sep{display:none}}
@media print{body{background:#fff}.wrap{max-width:none;padding:0}.hero{box-shadow:none;background:#115e59}details{border:0;padding:0}summary{display:none}.table-wrap{overflow:visible}.hero-contact{display:none}}
`;

function link(url: string, text: string): string {
  return `<a href="${escapeHtml(url)}" rel="noreferrer" target="_blank">${escapeHtml(text)}</a>`;
}

function renderTable(headers: string[], rows: Cell[][]): string {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body = rows
    .map((row) => {
      const cells = row
        .map((cell) => `<td>${typeof cell === "string" ? escapeHtml(cell) : cell.html}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function levelBadge(level: string): string {
  return `<span class="tag level-${escapeHtml(level)}">${escapeHtml(crowdingLabel(level))}</span>`;
}

function genresOf(tags: string[]): string {
  return classifyGenres(tags).map(genreLabel).join("、");
}

function gameIconCell(iconUrl: string | null): Cell {
  const url = safeImageUrl(iconUrl);
  if (!url) return "—";
  return {
    html: `<img class="game-icon" src="${escapeHtml(url)}" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer">`,
  };
}

function gameCells(event: CalendarEvent): Cell[] {
  return [
    gameIconCell(event.iconUrl),
    event.eventDate,
    event.title,
    genresOf(event.tags),
    categoryLabel(event.category),
    formatNumber(event.reserveCount),
    formatRating(event.rating),
    event.developers[0] ?? "—",
    { html: link(event.sourceUrl, "来源") },
  ];
}

function boardCells(ctx: RenderContext, boardId: BoardId, limit?: number): Cell[][] {
  const items = ctx.metrics.boards[boardId].items.slice(0, limit ?? undefined);
  return items.map((item) => [
    gameIconCell(item.iconUrl),
    String(item.rank),
    item.title,
    genresOf(item.tags),
    formatRating(item.rating),
    formatNumber(item.reserveCount),
    formatRankChange(item.rankChange),
    { html: link(item.sourceUrl, "来源") },
  ]);
}

function summaryItems(ctx: RenderContext): string[] {
  return resolveSummary(ctx);
}

export function renderHtml(ctx: RenderContext): string {
  const { snapshot, metrics, insights } = ctx;
  const warnings = [...snapshot.warnings, ...metrics.warnings, ...ctx.warnings];
  const qualityClass = metrics.dataQuality === "ok" ? "ok" : "degraded";

  const cards = [
    {
      label: "近 7 日首发",
      value: metrics.newGames.releases7d,
      note: `30 日累计 ${metrics.counts.release30d}`,
    },
    {
      label: "近 7 日新开预约",
      value: metrics.newGames.reservations7d,
      note: `测试 ${metrics.newGames.tests7d} 款`,
    },
    { label: "三榜去重游戏", value: metrics.boardUnion.length, note: `下载/预约/热玩 Top50` },
    {
      label: "涉及新游",
      value: metrics.newGames.uniqueGames7d,
      note: `窗口 ${snapshot.calendar.windowDays} 天`,
    },
  ]
    .map(
      (card) =>
        `<div class="card"><div class="label">${escapeHtml(card.label)}</div><div class="value">${escapeHtml(card.value)}</div><div class="note">${escapeHtml(card.note)}</div></div>`,
    )
    .join("");

  const boardSections = BOARDS.map((board) => {
    const snapshotBoard = metrics.boards[board.id];
    const notice = snapshotBoard.degraded
      ? `<div class="notice">数据降级：本轮可用条目不足 30 条。</div>`
      : "";
    return `<h3>${escapeHtml(snapshotBoard.label)}</h3>${notice}${renderTable(
      ["图标", "名次", "游戏", "赛道", "评分", "预约", "变化", "来源"],
      boardCells(ctx, board.id, 20),
    )}<details><summary>展开完整 Top${snapshotBoard.items.length}</summary>${renderTable(
      ["图标", "名次", "游戏", "赛道", "评分", "预约", "变化", "来源"],
      boardCells(ctx, board.id),
    )}</details>`;
  }).join("");

  const newGameInsights = insights.newGames
    .map((insight) => {
      const event = snapshot.calendar.events.find((item) => item.appId === insight.appId);
      if (!event) return "";
      const signals =
        insight.signals.length > 0
          ? insight.signals
              .map((signal) => `${escapeHtml(signal.label)}=${escapeHtml(signal.value)}`)
              .join("；")
          : "—";
      return `<div class="insight"><h4>${escapeHtml(insight.title)}</h4><p>${escapeHtml(
        insight.oneLiner,
      )}</p><dl class="kv"><dt>目标用户</dt><dd>${escapeHtml(insight.audience)}</dd><dt>可比产品</dt><dd>${
        insight.comparables.length > 0
          ? insight.comparables
              .map((item) => `${escapeHtml(item.title)}（${escapeHtml(item.reason)}）`)
              .join("；")
          : "—"
      }</dd><dt>信号</dt><dd>${signals}</dd><dt>风险</dt><dd>${
        insight.risks.length > 0 ? insight.risks.map(escapeHtml).join("；") : "—"
      }</dd><dt>置信度</dt><dd>${escapeHtml(confidenceLabel(insight.confidence))}</dd><dt>证据</dt><dd>${evidenceRefsHtml(
        insight.evidenceIds,
        ctx.evidence,
      )}</dd></dl></div>`;
    })
    .filter(Boolean)
    .join("");

  const trackInsights = insights.tracks
    .map((insight) => {
      const metric = metrics.genres.find((genre) => genre.id === insight.genreId);
      if (!metric) return "";
      return `<div class="insight"><h4>${escapeHtml(metric.label)} ${levelBadge(
        metric.crowding.level,
      )} <span class="muted small">${metric.crowding.score ?? "—"}</span></h4><p>${escapeHtml(
        insight.rationale || "—",
      )}</p><dl class="kv"><dt>代表新游</dt><dd>${
        insight.notableGames.length > 0
          ? insight.notableGames
              .map((game) => `${escapeHtml(game.title)}（${escapeHtml(game.reason)}）`)
              .join("；")
          : "—"
      }</dd><dt>机会</dt><dd>${
        insight.opportunities.length > 0 ? insight.opportunities.map(escapeHtml).join("；") : "—"
      }</dd><dt>风险</dt><dd>${
        insight.risks.length > 0 ? insight.risks.map(escapeHtml).join("；") : "—"
      }</dd><dt>证据</dt><dd>${evidenceRefsHtml(insight.evidenceIds, ctx.evidence)}</dd></dl></div>`;
    })
    .filter(Boolean)
    .join("");

  const opportunityList = (
    items: { text: string; kind: string; evidenceIds: string[] }[],
    kind: "fact" | "inference",
  ): string =>
    items.length > 0
      ? `<ul>${items
          .map(
            (item) =>
              `<li class="${kind === "fact" ? "opportunity" : ""}">${escapeHtml(item.text)} <span class="muted small">（${escapeHtml(
                kind === "fact" ? "事实" : "推断",
              )}；证据：${evidenceRefsHtml(item.evidenceIds, ctx.evidence)}）</span></li>`,
          )
          .join("")}</ul>`
      : `<p class="muted">无。</p>`;

  const riskList =
    insights.risks.length > 0
      ? `<ul>${insights.risks
          .map(
            (item) =>
              `<li class="risk">${escapeHtml(item.text)} <span class="muted small">（${escapeHtml(
                item.kind === "fact" ? "事实" : "推断",
              )}；证据：${evidenceRefsHtml(item.evidenceIds, ctx.evidence)}）</span></li>`,
          )
          .join("")}</ul>`
      : `<p class="muted">无。</p>`;

  const genreRows: Cell[][] = metrics.genres.map((genre) => [
    genre.label,
    String(genre.newGames7d),
    String(genre.newGames30d),
    String(genre.newReservations7d),
    formatPercent(genre.boardShare),
    genre.crowding.score === null ? "—" : String(genre.crowding.score),
    { html: levelBadge(genre.crowding.level) },
    genre.crowding.components.supply === null ? "—" : genre.crowding.components.supply.toFixed(1),
    genre.crowding.components.list === null ? "—" : genre.crowding.components.list.toFixed(1),
    genre.crowding.components.reservation === null
      ? "—"
      : genre.crowding.components.reservation.toFixed(1),
  ]);

  const movers = metrics.boardUnion
    .filter((item) => item.boards.some((membership) => membership.rankChange !== null))
    .map((item) => ({
      item,
      score: Math.max(...item.boards.map((membership) => Math.abs(membership.rankChange ?? 0))),
    }))
    .sort((a, b) => b.score - a.score || a.item.appId - b.item.appId)
    .slice(0, 10);

  const crossBoard = metrics.boardUnion
    .filter((item) => item.boards.length > 1)
    .sort((a, b) => b.boards.length - a.boards.length || a.boards[0]!.rank - b.boards[0]!.rank)
    .slice(0, 10);

  const evidenceRows: Cell[][] = snapshot.evidence.map((item) => [
    item.id,
    item.kind,
    { html: link(item.url, item.url) },
    item.rawFile ?? "—",
  ]);

  const warningRows: Cell[][] = warnings.map((warning) => [warning.code, warning.message]);

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TapTap 游戏日报 · ${escapeHtml(snapshot.reportDate)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<main class="wrap">
<section class="hero">
<div class="hero-main">
<h1>TapTap 游戏日报 · ${escapeHtml(snapshot.reportDate)}</h1>
<p>数据截止 ${escapeHtml(formatBeijingDateTime(Date.parse(snapshot.capturedAt) / 1000))}（北京时间） · 来源：${escapeHtml(
    snapshot.source.kind === "web" ? "TapTap 公开页面" : "人工导入",
  )}</p>
<p>Snapshot ${escapeHtml(snapshot.contentHash.slice(0, 12))} · 对比基线 ${escapeHtml(
    metrics.previousReportDate ?? "无",
  )} · 生成 ${escapeHtml(formatBeijingDateTime(Date.parse(ctx.generatedAt) / 1000))}</p>
<div class="badges"><span class="badge ${qualityClass}">质量：${escapeHtml(
    dataQualityLabel(metrics.dataQuality),
  )}</span><span class="badge">新游 ${escapeHtml(metrics.newGames.uniqueGames7d)} 款</span><span class="badge">赛道 ${escapeHtml(
    metrics.genres.length,
  )} 个</span></div>
</div>
<aside class="hero-contact" aria-label="加群交流">
<div class="hero-contact-title"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>加群交流</div>
${contactQrMarkup()}
<p>微信扫码加群交流</p>
</aside>
</section>

<div class="cards">${cards}</div>

<section>
<h2>01 今日速览</h2>
<ul>${summaryItems(ctx)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul>
</section>

<section>
<h2>02 新游发现</h2>
<p class="muted">近 7 日首发 ${escapeHtml(metrics.newGames.releases7d)} 款，新开预约 ${escapeHtml(
    metrics.newGames.reservations7d,
  )} 款，测试 ${escapeHtml(metrics.newGames.tests7d)} 款；涉及游戏 ${escapeHtml(metrics.newGames.uniqueGames7d)} 款。</p>
<h3>首发 Top 20</h3>
${renderTable(["图标", "日期", "游戏", "赛道", "类型", "预约", "评分", "厂商", "来源"], metrics.newGames.topReleases.map(gameCells))}
<h3>新开预约 Top 20</h3>
${renderTable(["图标", "日期", "游戏", "赛道", "类型", "预约", "评分", "厂商", "来源"], metrics.newGames.topReservations.map(gameCells))}
<h3>深度解读</h3>
<div class="grid">${newGameInsights || '<p class="muted">本轮没有可用的新游深度解读。</p>'}</div>
</section>

<section>
<h2>03 热门游戏</h2>
${boardSections}
<h3>榜单洞察</h3>
${
  insights.boards.length > 0
    ? `<div class="grid">${insights.boards
        .map(
          (item) =>
            `<div class="insight"><h4>${escapeHtml(BOARD_LABELS[item.board])}</h4><p>${escapeHtml(
              item.summary,
            )}</p>${item.movers.length > 0 ? `<p class="small">变化：${item.movers.map(escapeHtml).join("；")}</p>` : ""}${
              item.crossBoard.length > 0
                ? `<p class="small">交叉上榜：${item.crossBoard.map(escapeHtml).join("；")}</p>`
                : ""
            }<p class="small">证据：${evidenceRefsHtml(item.evidenceIds, ctx.evidence)}</p></div>`,
        )
        .join("")}</div>`
    : '<p class="muted">本轮没有可用的榜单洞察。</p>'
}
<h3>排名变化 Top 10</h3>
${
  movers.length > 0
    ? renderTable(
        ["图标", "游戏", "变化"],
        movers.map(({ item }) => [
          gameIconCell(item.iconUrl),
          item.title,
          item.boards
            .filter((membership) => membership.rankChange !== null)
            .map(
              (membership) =>
                `${BOARD_LABELS[membership.board]} ${formatRankChange(membership.rankChange)}`,
            )
            .join("；"),
        ]),
      )
    : '<p class="muted">没有可用的上一份快照，排名变化为空。</p>'
}
<h3>交叉上榜</h3>
${
  crossBoard.length > 0
    ? renderTable(
        ["图标", "游戏", "上榜情况"],
        crossBoard.map((item) => [
          gameIconCell(item.iconUrl),
          item.title,
          item.boards
            .map((membership) => `${BOARD_LABELS[membership.board]} #${membership.rank}`)
            .join("；"),
        ]),
      )
    : '<p class="muted">本轮没有跨榜游戏。</p>'
}
</section>

<section>
<h2>04 题材赛道</h2>
<p class="muted">拥挤度是当日各赛道之间的相对指数（0–100），只用于横向比较，不代表绝对市场规模；多标签游戏会同时计入多个赛道。</p>
${renderTable(
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
)}
<h3>赛道解读 Top 8</h3>
<div class="grid">${trackInsights || '<p class="muted">本轮没有可用的赛道深度解读。</p>'}</div>
</section>

<section>
<h2>05 机会与风险</h2>
<h3>机会（事实）</h3>
${opportunityList(
  insights.opportunities.filter((item) => item.kind === "fact"),
  "fact",
)}
<h3>机会（推断）</h3>
${opportunityList(
  insights.opportunities.filter((item) => item.kind === "inference"),
  "inference",
)}
<h3>风险</h3>
${riskList}
</section>

<section>
<h2>06 数据说明</h2>
<ul>
<li>报告日期：${escapeHtml(snapshot.reportDate)}；采集时间：${escapeHtml(
    formatBeijingDateTime(Date.parse(snapshot.capturedAt) / 1000),
  )}（北京时间）。</li>
<li>榜单：下载/热门、预约、热玩 Top50；排名变化对比 ${escapeHtml(metrics.previousReportDate ?? "无")}。</li>
<li>新游窗口：最近 7 天；赛道供给窗口：最近 30 天；日历可用 ${escapeHtml(
    snapshot.calendar.daysAvailable,
  )}/${escapeHtml(snapshot.calendar.windowDays)} 天。</li>
<li>所有数字来自 snapshot/metrics；LLM 仅生成解读，且必须引用 evidenceId。</li>
${insights.dataNotes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
</ul>
<h3>质量警告</h3>
${warnings.length > 0 ? renderTable(["代码", "说明"], warningRows) : '<p class="muted">无。</p>'}
</section>

<section>
<h2>07 附录</h2>
<h3>完整榜单</h3>
${BOARDS.map((board) => {
  const snapshotBoard = metrics.boards[board.id];
  return `<details><summary>${escapeHtml(snapshotBoard.label)}（Top${snapshotBoard.items.length}）</summary>${renderTable(
    ["图标", "名次", "游戏", "赛道", "评分", "预约", "变化", "来源"],
    boardCells(ctx, board.id),
  )}</details>`;
}).join("")}
<details><summary>证据索引（${snapshot.evidence.length} 条）</summary>${renderTable(
    ["ID", "类型", "URL", "原始文件"],
    evidenceRows,
  )}</details>
</section>

<footer class="footer">
<span>更多报告联系 ${link("mailto:service@kayingai.com", "service@kayingai.com")}</span>
<span class="footer-sep" aria-hidden="true">·</span>
<span>由 KayingCode kaying-taptap-daily 生成</span>
<span class="footer-sep" aria-hidden="true">·</span>
<span>开源一站式游戏开发Harness ${link("https://kayingai.com", "https://kayingai.com")}</span>
</footer>
</main>
</body>
</html>`;
}

export interface ArchiveEntry {
  date: string;
  dataQuality: string;
  releases7d: number;
  reservations7d: number;
  topTrack?: string;
}

export function renderArchiveIndex(entries: ArchiveEntry[]): string {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const rows: Cell[][] = sorted.map((entry) => [
    { html: link(`./${entry.date}/`, entry.date) },
    String(entry.releases7d),
    String(entry.reservations7d),
    entry.topTrack ?? "—",
    {
      html: `<span class="badge ${entry.dataQuality === "ok" ? "ok" : "degraded"}">${escapeHtml(
        dataQualityLabel(entry.dataQuality),
      )}</span>`,
    },
  ]);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TapTap 游戏日报 · 历史归档</title>
<style>${BASE_CSS}</style>
</head>
<body>
<main class="wrap">
<section class="hero">
<div class="hero-main">
<h1>TapTap 游戏日报 · 历史归档</h1>
<p>共 ${escapeHtml(sorted.length)} 期 · 数据来自 TapTap 公开页面</p>
</div>
<aside class="hero-contact" aria-label="加群交流">
<div class="hero-contact-title"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>加群交流</div>
${contactQrMarkup()}
<p>微信扫码加群交流</p>
</aside>
</section>
<section>
<h2>全部日报</h2>
${renderTable(["日期", "近7日首发", "近7日预约", "最拥挤赛道", "质量"], rows)}
</section>
<footer class="footer">
<span>更多报告联系 ${link("mailto:service@kayingai.com", "service@kayingai.com")}</span>
<span class="footer-sep" aria-hidden="true">·</span>
<span>由 KayingCode kaying-taptap-daily 生成</span>
<span class="footer-sep" aria-hidden="true">·</span>
<span>开源一站式游戏开发Harness ${link("https://kayingai.com", "https://kayingai.com")}</span>
</footer>
</main>
</body>
</html>`;
}
