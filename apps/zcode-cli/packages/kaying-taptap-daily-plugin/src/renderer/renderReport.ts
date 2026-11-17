import type {
  BoardId,
  CalendarEvent,
  GameRecord,
  GenreMetric,
  Insights,
  Metrics,
  Snapshot,
  Warning,
} from "../types.js";
import { BOARD_LABELS, BOARDS } from "../types.js";
import { buildRenderContext, type RenderContext, type RenderInput } from "./context.js";
import { renderHtml, type ArchiveEntry } from "./html.js";
import { renderMarkdown } from "./markdown.js";
import { resolveSummary } from "./summary.js";

export interface CompactGame {
  appId: number;
  title: string;
  tags: string[];
  rating: number | null;
  reserveCount: number;
  developers: string[];
  releasedTime: number | null;
  iconUrl: string | null;
  sourceUrl: string;
}

export interface CompactEvent extends CompactGame {
  eventId: number;
  eventDate: string;
  category: string;
  subEventTypeTitle: string;
  evidenceId: string;
}

export interface CompactBoardItem extends CompactGame {
  rank: number;
  rankChange: number | null;
}

export interface ReportJson {
  schemaVersion: 1;
  reportDate: string;
  capturedAt: string;
  generatedAt: string;
  snapshotHash: string;
  source: Snapshot["source"];
  dataQuality: string;
  previousReportDate: string | null;
  summary: string[];
  counts: Metrics["counts"];
  newGames: {
    releases7d: number;
    reservations7d: number;
    tests7d: number;
    uniqueGames7d: number;
    topReleases: CompactEvent[];
    topReservations: CompactEvent[];
  };
  boards: Record<
    BoardId,
    { label: string; degraded: boolean; total: number | null; items: CompactBoardItem[] }
  >;
  boardUnion: {
    appId: number;
    title: string;
    tags: string[];
    rating: number | null;
    reserveCount: number;
    iconUrl: string | null;
    boards: { board: BoardId; rank: number; rankChange: number | null }[];
  }[];
  genres: GenreMetric[];
  topGenres: {
    label: string;
    score: number;
    level: string;
    newGames7d: number;
    newGames30d: number;
  }[];
  topMovers: { title: string; changes: string[]; iconUrl: string | null; sourceUrl: string }[];
  insights: Insights;
  warnings: Warning[];
  reportUrl: string;
}

function compactGame(event: GameRecord): CompactGame {
  return {
    appId: event.appId,
    title: event.title,
    tags: event.tags,
    rating: event.rating,
    reserveCount: event.reserveCount,
    developers: event.developers,
    releasedTime: event.releasedTime,
    iconUrl: event.iconUrl,
    sourceUrl: event.sourceUrl,
  };
}

function compactEvent(event: CalendarEvent): CompactEvent {
  return {
    ...compactGame(event),
    eventId: event.eventId,
    eventDate: event.eventDate,
    category: event.category,
    subEventTypeTitle: event.subEventTypeTitle,
    evidenceId: event.evidenceId,
  };
}

export function buildReportJson(ctx: RenderContext): ReportJson {
  const { snapshot, metrics, insights } = ctx;
  const boards = {} as ReportJson["boards"];
  for (const board of BOARDS) {
    const source = metrics.boards[board.id];
    boards[board.id] = {
      label: source.label,
      degraded: source.degraded,
      total: source.total,
      items: source.items.map((item) => ({
        ...compactGame(item),
        rank: item.rank,
        rankChange: item.rankChange,
      })),
    };
  }

  const topGenres = [...metrics.genres]
    .filter((genre) => genre.crowding.score !== null)
    .sort((a, b) => (b.crowding.score ?? 0) - (a.crowding.score ?? 0))
    .slice(0, 5)
    .map((genre) => ({
      label: genre.label,
      score: genre.crowding.score!,
      level: genre.crowding.level,
      newGames7d: genre.newGames7d,
      newGames30d: genre.newGames30d,
    }));

  const topMovers = metrics.boardUnion
    .map((item) => {
      const changes = item.boards
        .filter((membership) => membership.rankChange !== null)
        .map(
          (membership) =>
            `${BOARD_LABELS[membership.board]} ${membership.rankChange! > 0 ? "+" : ""}${membership.rankChange}`,
        );
      const score = Math.max(
        ...item.boards.map((membership) => Math.abs(membership.rankChange ?? 0)),
      );
      return {
        title: item.title,
        changes,
        iconUrl: item.iconUrl,
        sourceUrl: item.sourceUrl,
        score,
      };
    })
    .filter((item) => item.changes.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ score: _score, ...item }) => item);

  return {
    schemaVersion: 1,
    reportDate: snapshot.reportDate,
    capturedAt: snapshot.capturedAt,
    generatedAt: ctx.generatedAt,
    snapshotHash: snapshot.contentHash,
    source: snapshot.source,
    dataQuality: metrics.dataQuality,
    previousReportDate: metrics.previousReportDate,
    summary: resolveSummary(ctx),
    counts: metrics.counts,
    newGames: {
      releases7d: metrics.newGames.releases7d,
      reservations7d: metrics.newGames.reservations7d,
      tests7d: metrics.newGames.tests7d,
      uniqueGames7d: metrics.newGames.uniqueGames7d,
      topReleases: metrics.newGames.topReleases.map(compactEvent),
      topReservations: metrics.newGames.topReservations.map(compactEvent),
    },
    boards,
    boardUnion: metrics.boardUnion.map((item) => ({
      appId: item.appId,
      title: item.title,
      tags: item.tags,
      rating: item.rating,
      reserveCount: item.reserveCount,
      iconUrl: item.iconUrl,
      boards: item.boards,
    })),
    genres: metrics.genres,
    topGenres,
    topMovers,
    insights,
    warnings: [...snapshot.warnings, ...metrics.warnings, ...ctx.warnings],
    reportUrl: ctx.reportUrl,
  };
}

export interface RenderedReport {
  markdown: string;
  html: string;
  reportJson: ReportJson;
}

export function renderReport(input: RenderInput): RenderedReport {
  const ctx = buildRenderContext(input);
  return {
    markdown: renderMarkdown(ctx),
    html: renderHtml(ctx),
    reportJson: buildReportJson(ctx),
  };
}

export function archiveEntryFromReport(report: ReportJson): ArchiveEntry {
  const topTrack = [...report.genres]
    .filter((genre) => genre.crowding.score !== null)
    .sort((a, b) => (b.crowding.score ?? 0) - (a.crowding.score ?? 0))[0];
  return {
    date: report.reportDate,
    dataQuality: report.dataQuality,
    releases7d: report.counts.release7d,
    reservations7d: report.counts.reservation7d,
    topTrack: topTrack?.label,
  };
}
