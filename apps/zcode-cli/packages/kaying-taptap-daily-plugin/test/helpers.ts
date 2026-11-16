import { buildSnapshot } from "../src/collector/snapshot.js";
import { addDays } from "../src/lib/date.js";
import type {
  BoardId,
  BoardItem,
  BoardSnapshot,
  CalendarEvent,
  EventCategory,
  GameRecord,
  Snapshot,
} from "../src/types.js";
import { BOARDS, BOARD_LABELS } from "../src/types.js";

export const CAPTURED_AT = "2026-11-16T01:00:00.000Z";
export const REPORT_DATE = "2026-11-16";

export function makeGame(
  appId: number,
  title: string,
  tags: string[],
  overrides: Partial<GameRecord> = {},
): GameRecord {
  return {
    appId,
    identifier: null,
    title,
    tags,
    developers: ["测试厂商"],
    rating: 8,
    reserveCount: 100,
    hitsTotal: 1_000,
    playTotal: 100,
    releasedTime: null,
    expectedLaunchTime: null,
    iconUrl: null,
    platforms: ["android"],
    sourceUrl: `https://www.taptap.cn/app/${appId}`,
    ...overrides,
  };
}

export function makeBoardItem(
  appId: number,
  title: string,
  tags: string[],
  rank: number,
  overrides: Partial<BoardItem> = {},
): BoardItem {
  return {
    ...makeGame(appId, title, tags, overrides),
    rank,
    rankChange: null,
    isAd: false,
    ...overrides,
  };
}

export function makeBoard(id: BoardId, items: BoardItem[], degraded = false): BoardSnapshot {
  return {
    id,
    label: BOARD_LABELS[id],
    total: items.length,
    degraded,
    items,
  };
}

export function makeEvent(
  appId: number,
  title: string,
  tags: string[],
  category: EventCategory,
  eventDate: string,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  const eventId = overrides.eventId ?? appId * 10;
  return {
    ...makeGame(appId, title, tags, overrides),
    eventId,
    eventDate,
    eventType: 0,
    subEventType: 0,
    subEventTypeTitle: overrides.subEventTypeTitle ?? title,
    category,
    startTime: null,
    endTime: null,
    evidenceId: overrides.evidenceId ?? `event:${eventId}`,
    ...overrides,
  };
}

export interface SnapshotOptions {
  reportDate?: string;
  boards?: Partial<Record<BoardId, BoardSnapshot>>;
  events?: CalendarEvent[];
  windowDays?: number;
  degradedBoards?: BoardId[];
  capturedAt?: string;
}

function defaultBoard(id: BoardId, base: number, degraded: boolean): BoardSnapshot {
  const items = Array.from({ length: 35 }, (_, index) => {
    const tags = index % 3 === 0 ? ["二次元"] : index % 3 === 1 ? ["模拟经营"] : ["射击"];
    return makeBoardItem(base + index, `${BOARD_LABELS[id]}游戏${index + 1}`, tags, index + 1, {
      reserveCount: 1_000 - index,
      rating: 9 - (index % 5) * 0.2,
    });
  });
  return makeBoard(id, items, degraded);
}

export function makeSnapshot(options: SnapshotOptions = {}): Snapshot {
  const reportDate = options.reportDate ?? REPORT_DATE;
  const windowDays = options.windowDays ?? 30;
  const degradedBoards = new Set(options.degradedBoards ?? []);
  const boards = {} as Record<BoardId, BoardSnapshot>;
  const evidence = [];
  for (const board of BOARDS) {
    const base = board.id === "download" ? 1_000 : board.id === "reserve" ? 2_000 : 3_000;
    boards[board.id] =
      options.boards?.[board.id] ?? defaultBoard(board.id, base, degradedBoards.has(board.id));
    for (const item of boards[board.id].items) {
      evidence.push({
        id: `app:${item.appId}`,
        url: item.sourceUrl,
        capturedAt: options.capturedAt ?? CAPTURED_AT,
        kind: "board" as const,
      });
    }
  }
  const events = options.events ?? [];
  for (const event of events) {
    evidence.push({
      id: event.evidenceId,
      url: event.sourceUrl,
      capturedAt: options.capturedAt ?? CAPTURED_AT,
      kind: "calendar" as const,
    });
  }
  return buildSnapshot({
    reportDate,
    capturedAt: options.capturedAt ?? CAPTURED_AT,
    source: {
      kind: "web",
      adapter: "http",
      baseUrl: "https://www.taptap.cn",
      capturedAt: options.capturedAt ?? CAPTURED_AT,
    },
    boards,
    calendar: {
      windowDays,
      fromDate: addDays(reportDate, -(windowDays - 1)),
      toDate: reportDate,
      daysAvailable: windowDays,
      gameTotal: events.length,
      degraded: false,
      events,
    },
    warnings: [],
    evidence,
  });
}
