import type {
  BoardId,
  Evidence,
  Insights,
  Metrics,
  Opportunity,
  Snapshot,
  Warning,
} from "../types.js";
import { BOARDS } from "../types.js";

export interface RenderInput {
  snapshot: Snapshot;
  metrics: Metrics;
  insights: Insights;
  publicBaseUrl: string;
  generatedAt?: string;
}

export interface RenderContext {
  snapshot: Snapshot;
  metrics: Metrics;
  insights: Insights;
  evidence: Map<string, Evidence>;
  reportUrl: string;
  generatedAt: string;
  warnings: Warning[];
}

function sanitizeEvidenceIds(
  ids: string[] | undefined,
  evidence: Map<string, Evidence>,
  counter: { unknown: number },
): string[] {
  const result: string[] = [];
  for (const id of ids ?? []) {
    if (evidence.has(id)) result.push(id);
    else counter.unknown += 1;
  }
  return result;
}

function sanitizeOpportunities(
  items: Opportunity[] | undefined,
  evidence: Map<string, Evidence>,
  counter: { unknown: number },
): Opportunity[] {
  return (items ?? [])
    .map(
      (item): Opportunity => ({
        text: String(item.text ?? "").trim(),
        kind: item.kind === "inference" ? "inference" : "fact",
        evidenceIds: sanitizeEvidenceIds(item.evidenceIds, evidence, counter),
      }),
    )
    .filter((item) => item.text.length > 0);
}

export function sanitizeInsights(
  insights: Insights,
  snapshot: Snapshot,
  metrics: Metrics,
  generatedAt: string,
  warnings: Warning[],
): Insights {
  const evidence = new Map(snapshot.evidence.map((item) => [item.id, item] as const));
  const knownApps = new Set<number>([
    ...metrics.boardUnion.map((item) => item.appId),
    ...snapshot.calendar.events.map((event) => event.appId),
  ]);
  const knownGenres = new Set<string>(metrics.genres.map((genre) => genre.id));
  const knownBoards = new Set<BoardId>(BOARDS.map((board) => board.id));
  const counter = { unknown: 0 };

  const newGames = (insights.newGames ?? [])
    .filter((item) => knownApps.has(item.appId))
    .map((item) => ({
      ...item,
      comparables: item.comparables ?? [],
      signals: (item.signals ?? []).map((signal) => ({
        label: String(signal.label ?? ""),
        value: String(signal.value ?? ""),
        evidenceIds: sanitizeEvidenceIds(signal.evidenceIds, evidence, counter),
      })),
      risks: item.risks ?? [],
      evidenceIds: sanitizeEvidenceIds(item.evidenceIds, evidence, counter),
    }));

  const boards = (insights.boards ?? [])
    .filter((item) => knownBoards.has(item.board))
    .map((item) => ({
      ...item,
      movers: item.movers ?? [],
      crossBoard: item.crossBoard ?? [],
      evidenceIds: sanitizeEvidenceIds(item.evidenceIds, evidence, counter),
    }));

  const tracks = (insights.tracks ?? [])
    .filter((item) => knownGenres.has(item.genreId))
    .map((item) => ({
      ...item,
      notableGames: (item.notableGames ?? [])
        .filter((game) => knownApps.has(game.appId))
        .map((game) => ({
          ...game,
          evidenceIds: sanitizeEvidenceIds(game.evidenceIds, evidence, counter),
        })),
      opportunities: item.opportunities ?? [],
      risks: item.risks ?? [],
      evidenceIds: sanitizeEvidenceIds(item.evidenceIds, evidence, counter),
    }));

  if (counter.unknown > 0) {
    warnings.push({
      code: "insights_evidence_unknown",
      message: `洞察中 ${counter.unknown} 个 evidenceId 不存在，已在渲染时移除`,
      details: { unknown: counter.unknown },
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: insights.generatedAt || generatedAt,
    summary: (insights.summary ?? [])
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 6),
    newGames,
    boards,
    tracks,
    opportunities: sanitizeOpportunities(insights.opportunities, evidence, counter),
    risks: sanitizeOpportunities(insights.risks, evidence, counter),
    dataNotes: (insights.dataNotes ?? []).map((item) => String(item).trim()).filter(Boolean),
  };
}

export function buildRenderContext(input: RenderInput): RenderContext {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const warnings: Warning[] = [];
  const insights = sanitizeInsights(
    input.insights,
    input.snapshot,
    input.metrics,
    generatedAt,
    warnings,
  );
  const reportUrl = input.publicBaseUrl
    ? `${input.publicBaseUrl.replace(/\/+$/, "")}/${input.snapshot.reportDate}/`
    : `${input.snapshot.reportDate}/`;
  return {
    snapshot: input.snapshot,
    metrics: input.metrics,
    insights,
    evidence: new Map(input.snapshot.evidence.map((item) => [item.id, item] as const)),
    reportUrl,
    generatedAt,
    warnings,
  };
}
