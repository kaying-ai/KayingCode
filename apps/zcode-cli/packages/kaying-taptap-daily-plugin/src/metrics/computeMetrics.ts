import { addDays } from "../lib/date.js";
import {
  METRICS_SCHEMA_VERSION,
  type BoardId,
  type BoardSnapshot,
  type BoardUnionItem,
  type CalendarEvent,
  type GenreBoardGame,
  type GenreId,
  type GenreMetric,
  type GenreTopGame,
  type Metrics,
  type Snapshot,
  type Warning,
} from "../types.js";
import { BOARDS, GENRE_TRACKS } from "../types.js";
import { classifyGenres } from "../collector/genres.js";

const WINDOW_7D = 7;
const WINDOW_30D = 30;

function inWindow(event: CalendarEvent, fromDate: string, toDate: string): boolean {
  return event.eventDate >= fromDate && event.eventDate <= toDate;
}

function uniqueAppIds(events: CalendarEvent[]): Set<number> {
  return new Set(events.map((event) => event.appId));
}

function dedupeByApp(events: CalendarEvent[]): CalendarEvent[] {
  const byApp = new Map<number, CalendarEvent>();
  for (const event of events) {
    const current = byApp.get(event.appId);
    if (!current) {
      byApp.set(event.appId, event);
      continue;
    }
    const currentHeat = [current.reserveCount, current.rating ?? 0, current.hitsTotal];
    const nextHeat = [event.reserveCount, event.rating ?? 0, event.hitsTotal];
    const compare =
      nextHeat[0]! - currentHeat[0]! ||
      nextHeat[1]! - currentHeat[1]! ||
      nextHeat[2]! - currentHeat[2]!;
    if (compare > 0) byApp.set(event.appId, event);
  }
  return [...byApp.values()];
}

function compareHeat(a: CalendarEvent, b: CalendarEvent): number {
  return (
    b.reserveCount - a.reserveCount ||
    (b.rating ?? 0) - (a.rating ?? 0) ||
    b.hitsTotal - a.hitsTotal ||
    b.playTotal - a.playTotal ||
    a.appId - b.appId
  );
}

function compareEventDateDesc(a: CalendarEvent, b: CalendarEvent): number {
  return compareHeat(a, b) || b.eventDate.localeCompare(a.eventDate) || a.appId - b.appId;
}

function percentileRanks(values: number[]): number[] {
  const n = values.length;
  return values.map((value) => {
    if (n === 0) return 0;
    let less = 0;
    let equal = 0;
    for (const other of values) {
      if (other < value) less += 1;
      else if (other === value) equal += 1;
    }
    return ((less + equal / 2) / n) * 100;
  });
}

function crowdingLevel(score: number | null): "low" | "medium" | "high" | "unknown" {
  if (score === null) return "unknown";
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function computeBoardDeltas(
  snapshot: Snapshot,
  previous: Snapshot | null,
): Record<BoardId, BoardSnapshot> {
  const result = {} as Record<BoardId, BoardSnapshot>;
  for (const board of BOARDS) {
    const current = snapshot.boards[board.id];
    const previousBoard = previous?.boards[board.id];
    const previousRanks = new Map<number, number>();
    for (const item of previousBoard?.items ?? []) previousRanks.set(item.appId, item.rank);
    result[board.id] = {
      ...current,
      items: current.items.map((item) => {
        const previousRank = previousRanks.get(item.appId);
        return {
          ...item,
          rankChange: previousRank === undefined ? null : previousRank - item.rank,
        };
      }),
    };
  }
  return result;
}

function computeBoardUnion(boards: Record<BoardId, BoardSnapshot>): BoardUnionItem[] {
  const byApp = new Map<number, BoardUnionItem>();
  for (const board of BOARDS) {
    for (const item of boards[board.id].items) {
      const current = byApp.get(item.appId);
      if (current) {
        current.boards.push({ board: board.id, rank: item.rank, rankChange: item.rankChange });
        continue;
      }
      byApp.set(item.appId, {
        appId: item.appId,
        identifier: item.identifier,
        title: item.title,
        tags: item.tags,
        developers: item.developers,
        rating: item.rating,
        reserveCount: item.reserveCount,
        hitsTotal: item.hitsTotal,
        playTotal: item.playTotal,
        releasedTime: item.releasedTime,
        expectedLaunchTime: item.expectedLaunchTime,
        iconUrl: item.iconUrl,
        platforms: item.platforms,
        sourceUrl: item.sourceUrl,
        boards: [{ board: board.id, rank: item.rank, rankChange: item.rankChange }],
      });
    }
  }
  return [...byApp.values()].sort((a, b) => {
    const aBest = Math.min(...a.boards.map((membership) => membership.rank));
    const bBest = Math.min(...b.boards.map((membership) => membership.rank));
    return aBest - bBest || a.appId - b.appId;
  });
}

function toGenreTopGame(event: CalendarEvent): GenreTopGame {
  return {
    appId: event.appId,
    title: event.title,
    eventDate: event.eventDate,
    category: event.category,
    reserveCount: event.reserveCount,
    rating: event.rating,
    sourceUrl: event.sourceUrl,
    evidenceId: event.evidenceId,
  };
}

export function computeMetrics(
  snapshot: Snapshot,
  previous: Snapshot | null,
  generatedAt: string,
): Metrics {
  const warnings: Warning[] = [...snapshot.warnings];
  for (const board of BOARDS) {
    const degraded = snapshot.boards[board.id].degraded;
    if (!degraded) continue;
    const alreadyReported = warnings.some(
      (warning) =>
        warning.code === "board_degraded" &&
        typeof warning.details === "object" &&
        warning.details !== null &&
        (warning.details as { board?: string }).board === board.id,
    );
    if (!alreadyReported) {
      warnings.push({
        code: "board_degraded",
        message: `${snapshot.boards[board.id].label} 数据降级`,
        details: { board: board.id, count: snapshot.boards[board.id].items.length },
      });
    }
  }
  const boards = computeBoardDeltas(snapshot, previous);
  const boardUnion = computeBoardUnion(boards);

  const from7d = addDays(snapshot.reportDate, -(WINDOW_7D - 1));
  const from30d = addDays(snapshot.reportDate, -(WINDOW_30D - 1));
  const events = snapshot.calendar.events;
  const events7d = events.filter((event) => inWindow(event, from7d, snapshot.reportDate));
  const events30d = events.filter((event) => inWindow(event, from30d, snapshot.reportDate));

  const releases7d = events7d.filter((event) => event.category === "release");
  const releases30d = events30d.filter((event) => event.category === "release");
  const reservations7d = events7d.filter((event) => event.category === "reservation");
  const tests7d = events7d.filter((event) => event.category === "test");
  const updates7d = events7d.filter((event) => event.category === "update");
  const discounts7d = events7d.filter((event) => event.category === "discount");

  const topReleases = [...dedupeByApp(releases7d)].sort(compareEventDateDesc).slice(0, 20);
  const topReservations = [...dedupeByApp(reservations7d)].sort(compareHeat).slice(0, 20);

  if (!previous) {
    warnings.push({
      code: "previous_snapshot_missing",
      message: "未找到上一份快照，榜单排名变化为空",
    });
  }
  if (boardUnion.length === 0) {
    warnings.push({
      code: "board_union_empty",
      message: "三榜没有可用条目，榜单占比与拥挤度榜单分不可用",
    });
  }
  if (events.length === 0) {
    warnings.push({
      code: "calendar_empty",
      message: "游戏日历没有可用事件，赛道供给与拥挤度不可用",
    });
  }
  if (snapshot.calendar.windowDays < WINDOW_30D) {
    warnings.push({
      code: "calendar_window_short",
      message: `游戏日历窗口仅 ${snapshot.calendar.windowDays} 天，30 日供给按现有窗口计算`,
      details: { windowDays: snapshot.calendar.windowDays, required: WINDOW_30D },
    });
  }

  const boardAvailability = boardUnion.length > 0;
  const calendarAvailability = events.length > 0;

  const rawGenres = GENRE_TRACKS.map((track) => {
    const trackEvents7d = events7d.filter((event) =>
      classifyGenres(event.tags).includes(track.id as GenreId),
    );
    const trackEvents30d = events30d.filter((event) =>
      classifyGenres(event.tags).includes(track.id as GenreId),
    );
    const trackReleases7d = dedupeByApp(
      trackEvents7d.filter((event) => event.category === "release"),
    );
    const trackReleases30d = trackEvents30d.filter((event) => event.category === "release");
    const trackReservations7d = dedupeByApp(
      trackEvents7d.filter((event) => event.category === "reservation"),
    );
    const boardItems = boardUnion.filter((item) =>
      classifyGenres(item.tags).includes(track.id as GenreId),
    );
    const boardTopGames: GenreBoardGame[] = boardItems
      .map((item) => {
        const best = item.boards.reduce(
          (current, membership) => (membership.rank < current.rank ? membership : current),
          item.boards[0]!,
        );
        return {
          appId: item.appId,
          title: item.title,
          rank: best.rank,
          rankChange: best.rankChange,
          sourceUrl: item.sourceUrl,
        };
      })
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 5);
    return {
      id: track.id as GenreId,
      label: track.label,
      newGames7d: uniqueAppIds(trackReleases7d).size,
      newGames30d: uniqueAppIds(trackReleases30d).size,
      newReservations7d: uniqueAppIds(trackReservations7d).size,
      boardCount: boardItems.length,
      boardShare: boardAvailability ? boardItems.length / boardUnion.length : 0,
      topNewGames: trackReleases7d
        .sort((a, b) => compareEventDateDesc(a, b))
        .slice(0, 3)
        .map(toGenreTopGame),
      boardTopGames,
    };
  });

  const supplyRanks = percentileRanks(rawGenres.map((genre) => genre.newGames30d));
  const listRanks = percentileRanks(rawGenres.map((genre) => genre.boardShare));
  const reservationRanks = percentileRanks(rawGenres.map((genre) => genre.newReservations7d));

  const genres: GenreMetric[] = rawGenres.map((genre, index) => {
    const supply = calendarAvailability ? supplyRanks[index]! : null;
    const list = boardAvailability ? listRanks[index]! : null;
    const reservation = calendarAvailability ? reservationRanks[index]! : null;
    const score =
      supply === null || list === null || reservation === null
        ? null
        : Math.round(0.45 * supply + 0.3 * list + 0.25 * reservation);
    return {
      ...genre,
      crowding: {
        score,
        level: crowdingLevel(score),
        components: {
          supply: supply === null ? null : Math.round(supply * 10) / 10,
          list: list === null ? null : Math.round(list * 10) / 10,
          reservation: reservation === null ? null : Math.round(reservation * 10) / 10,
        },
        ...(score === null ? { note: "数据不足，未计算拥挤度" } : {}),
      },
    };
  });

  const dataQuality =
    snapshot.calendar.degraded ||
    BOARDS.some((board) => snapshot.boards[board.id].degraded) ||
    warnings.some(
      (warning) =>
        /failed|degraded|partial|short|invalid|empty/.test(warning.code) &&
        warning.code !== "previous_snapshot_missing",
    )
      ? "degraded"
      : "ok";

  return {
    schemaVersion: METRICS_SCHEMA_VERSION,
    reportDate: snapshot.reportDate,
    generatedAt,
    snapshotHash: snapshot.contentHash,
    boards,
    boardUnion,
    newGames: {
      releases7d: uniqueAppIds(releases7d).size,
      reservations7d: uniqueAppIds(reservations7d).size,
      tests7d: uniqueAppIds(tests7d).size,
      uniqueGames7d: uniqueAppIds([
        ...releases7d,
        ...reservations7d,
        ...tests7d,
        ...events7d.filter((event) => event.category === "release-preload"),
      ]).size,
      topReleases,
      topReservations,
    },
    genres,
    counts: {
      release7d: uniqueAppIds(releases7d).size,
      release30d: uniqueAppIds(releases30d).size,
      reservation7d: uniqueAppIds(reservations7d).size,
      test7d: uniqueAppIds(tests7d).size,
      update7d: uniqueAppIds(updates7d).size,
      discount7d: uniqueAppIds(discounts7d).size,
    },
    previousReportDate: previous?.reportDate ?? null,
    warnings,
    dataQuality,
  };
}
