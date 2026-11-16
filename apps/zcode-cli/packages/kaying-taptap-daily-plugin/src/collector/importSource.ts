import { join } from "node:path";

import { parseCsvObjects, splitList } from "../lib/csv.js";
import { dateRange, shanghaiDateString } from "../lib/date.js";
import { readJsonIfExists, readTextIfExists } from "../lib/json.js";
import type {
  BoardId,
  BoardItem,
  BoardSnapshot,
  CalendarEvent,
  Evidence,
  Warning,
} from "../types.js";
import { BOARDS, BOARD_LABELS } from "../types.js";
import { classifyEvent, dedupeEvents } from "./normalize.js";

export interface ImportResult {
  boards: Record<BoardId, BoardSnapshot>;
  calendar: {
    windowDays: number;
    fromDate: string;
    toDate: string;
    daysAvailable: number;
    gameTotal: number;
    degraded: boolean;
    events: CalendarEvent[];
  };
  evidence: Evidence[];
  warnings: Warning[];
}

type Row = Record<string, unknown>;

function pick(row: Row, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return undefined;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseNonNegative(value: unknown): number {
  const parsed = parseNumber(value);
  return parsed !== null && parsed > 0 ? parsed : 0;
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
      .filter(Boolean);
  }
  if (typeof value === "string") return splitList(value);
  return [];
}

function parseGameFields(row: Row): {
  appId: number;
  identifier: string | null;
  title: string;
  tags: string[];
  developers: string[];
  rating: number | null;
  reserveCount: number;
  hitsTotal: number;
  playTotal: number;
  releasedTime: number | null;
  expectedLaunchTime: string | null;
  iconUrl: string | null;
  platforms: string[];
  sourceUrl: string;
} | null {
  const appId = parseNumber(pick(row, "appId", "app_id", "id", "gameId", "game_id"));
  const title = String(pick(row, "title", "name") ?? "").trim();
  if (appId === null || !title) return null;
  const rating = parseNumber(pick(row, "rating", "score"));
  const releasedTime = parseNumber(pick(row, "releasedTime", "released_time"));
  const sourceUrl =
    String(pick(row, "sourceUrl", "source_url", "url") ?? "").trim() ||
    `https://www.taptap.cn/app/${appId}`;
  return {
    appId,
    identifier: String(pick(row, "identifier", "packageName", "package_name") ?? "").trim() || null,
    title,
    tags: parseStringList(pick(row, "tags", "tag_values")),
    developers: parseStringList(pick(row, "developers", "developer")),
    rating: rating !== null && rating > 0 ? rating : null,
    reserveCount: parseNonNegative(pick(row, "reserveCount", "reserve_count")),
    hitsTotal: parseNonNegative(pick(row, "hitsTotal", "hits_total")),
    playTotal: parseNonNegative(pick(row, "playTotal", "play_total")),
    releasedTime: releasedTime !== null && releasedTime > 0 ? releasedTime : null,
    expectedLaunchTime:
      String(pick(row, "expectedLaunchTime", "expected_launch_time") ?? "").trim() || null,
    iconUrl: String(pick(row, "iconUrl", "icon_url", "icon") ?? "").trim() || null,
    platforms: parseStringList(pick(row, "platforms", "supported_platforms")),
    sourceUrl,
  };
}

async function loadBoardRows(
  importDir: string,
): Promise<{ rows: Record<BoardId, Row[]>; warnings: Warning[] }> {
  const warnings: Warning[] = [];
  const rows: Record<BoardId, Row[]> = { download: [], reserve: [], pop: [] };
  const json = await readJsonIfExists<unknown>(join(importDir, "boards.json"));
  if (json && typeof json === "object") {
    const container =
      "boards" in (json as Record<string, unknown>)
        ? ((json as Record<string, unknown>).boards as Record<string, unknown>)
        : (json as Record<string, unknown>);
    for (const board of BOARDS) {
      const list = container[board.id];
      if (Array.isArray(list)) rows[board.id] = list as Row[];
    }
  }
  if (BOARDS.every((board) => rows[board.id].length === 0)) {
    const csv = await readTextIfExists(join(importDir, "boards.csv"));
    if (csv !== null) {
      for (const row of parseCsvObjects(csv) as Row[]) {
        const boardId = String(row.board ?? "").trim() as BoardId;
        if (boardId in rows) rows[boardId].push(row);
      }
    }
  }
  for (const board of BOARDS) {
    if (rows[board.id].length === 0) {
      warnings.push({
        code: "import_board_empty",
        message: `导入的 ${BOARD_LABELS[board.id]} 为空`,
        details: { board: board.id },
      });
    }
  }
  return { rows, warnings };
}

async function loadCalendarRows(importDir: string): Promise<Row[]> {
  const json = await readJsonIfExists<unknown>(join(importDir, "calendar.json"));
  if (Array.isArray(json)) return json as Row[];
  if (json && typeof json === "object" && Array.isArray((json as Record<string, unknown>).events)) {
    return (json as Record<string, unknown>).events as Row[];
  }
  const csv = await readTextIfExists(join(importDir, "calendar.csv"));
  if (csv !== null) return parseCsvObjects(csv) as Row[];
  return [];
}

export async function loadImportSource(
  importDir: string,
  reportDate: string,
  calendarDays: number,
  capturedAt: string,
): Promise<ImportResult> {
  const warnings: Warning[] = [];
  const evidence: Evidence[] = [];
  const { rows, warnings: boardWarnings } = await loadBoardRows(importDir);
  warnings.push(...boardWarnings);

  const boards = {} as Record<BoardId, BoardSnapshot>;
  for (const board of BOARDS) {
    const items: BoardItem[] = [];
    const seen = new Set<number>();
    let rank = 1;
    for (const row of rows[board.id]) {
      const game = parseGameFields(row);
      if (!game) {
        warnings.push({
          code: "import_board_row_invalid",
          message: `${BOARD_LABELS[board.id]} 导入行缺少 appId/title`,
          details: { board: board.id },
        });
        continue;
      }
      if (seen.has(game.appId)) continue;
      seen.add(game.appId);
      const explicitRank = parseNumber(pick(row, "rank"));
      items.push({
        ...game,
        rank: explicitRank !== null && explicitRank > 0 ? explicitRank : rank,
        rankChange: null,
        isAd: false,
      });
      rank += 1;
      evidence.push({
        id: `app:${game.appId}`,
        url: game.sourceUrl,
        capturedAt,
        kind: "board",
      });
    }
    boards[board.id] = {
      id: board.id,
      label: BOARD_LABELS[board.id],
      total: items.length,
      degraded: items.length < 30,
      items,
    };
    if (items.length < 30) {
      warnings.push({
        code: "import_board_degraded",
        message: `${BOARD_LABELS[board.id]} 导入数据仅 ${items.length} 条`,
        details: { board: board.id, count: items.length },
      });
    }
  }

  const calendarRows = await loadCalendarRows(importDir);
  if (calendarRows.length === 0) {
    throw new Error(`人工导入缺少可用的 calendar.json/calendar.csv: ${importDir}`);
  }
  const dates = dateRange(reportDate, calendarDays);
  const fromDate = dates[0]!;
  const toDate = dates[dates.length - 1]!;
  const events: CalendarEvent[] = [];
  for (const [index, row] of calendarRows.entries()) {
    const game = parseGameFields(row);
    if (!game) {
      warnings.push({
        code: "import_calendar_row_invalid",
        message: "日历导入行缺少 appId/title",
        details: { index },
      });
      continue;
    }
    const startTime = parseNumber(pick(row, "startTime", "start_time"));
    const explicitDate = String(pick(row, "eventDate", "event_date", "date") ?? "").trim();
    const eventDate =
      explicitDate || (startTime ? shanghaiDateString(new Date(startTime * 1000)) : reportDate);
    if (eventDate < fromDate || eventDate > toDate) continue;
    const title =
      String(
        pick(row, "subEventTypeTitle", "sub_event_type_title", "eventTitle", "event") ?? "",
      ).trim() || "未分类事件";
    const eventId = parseNumber(pick(row, "eventId", "event_id", "id")) ?? 0;
    const evidenceId =
      String(pick(row, "evidenceId", "evidence_id") ?? "").trim() ||
      (eventId > 0 ? `event:${eventId}` : `import:${game.appId}:${eventDate}:${index}`);
    events.push({
      ...game,
      eventId,
      eventDate,
      eventType: parseNumber(pick(row, "eventType", "event_type")) ?? 0,
      subEventType: parseNumber(pick(row, "subEventType", "sub_event_type")) ?? 0,
      subEventTypeTitle: title,
      category: classifyEvent(title),
      startTime: startTime !== null && startTime > 0 ? startTime : null,
      endTime: parseNumber(pick(row, "endTime", "end_time")),
      evidenceId,
    });
    evidence.push({
      id: evidenceId,
      url: game.sourceUrl,
      capturedAt,
      kind: "calendar",
    });
  }
  const deduped = dedupeEvents(events).filter(
    (event) => event.eventDate >= fromDate && event.eventDate <= toDate,
  );
  const daysAvailable = new Set(deduped.map((event) => event.eventDate)).size;
  if (daysAvailable < calendarDays) {
    warnings.push({
      code: "import_calendar_partial",
      message: `导入日历覆盖 ${daysAvailable}/${calendarDays} 天`,
      details: { daysAvailable, windowDays: calendarDays },
    });
  }

  return {
    boards,
    calendar: {
      windowDays: calendarDays,
      fromDate,
      toDate,
      daysAvailable,
      gameTotal: deduped.length,
      degraded: daysAvailable < calendarDays,
      events: deduped,
    },
    evidence,
    warnings,
  };
}
