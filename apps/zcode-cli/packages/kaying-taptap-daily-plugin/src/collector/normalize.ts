import { shanghaiDateString } from "../lib/date.js";
import type { CalendarEvent, EventCategory, GameRecord, Warning } from "../types.js";

export interface RawTag {
  id?: number;
  value?: string;
  web_url?: string;
}

export interface RawDeveloper {
  name?: string;
  label?: string;
  type?: string;
}

export interface RawApp {
  id?: number;
  identifier?: string;
  title?: string;
  tags?: RawTag[];
  developers?: RawDeveloper[];
  stat?: {
    rating?: { score?: string | number };
    reserve_count?: number;
    hits_total?: number;
    play_total?: number;
  };
  released_time?: number;
  expected_launch_time?: string | null;
  icon?: { url?: string; small_url?: string; medium_url?: string };
  platform_info?: { supported_platforms?: { key?: string }[] };
}

export interface RawBoardItem {
  is_ad?: boolean;
  type?: string;
  identification?: string;
  app?: RawApp;
}

export interface RawHitsData {
  list?: RawBoardItem[];
  total?: number;
  next_page?: string | null;
}

export interface RawCalendarEvent {
  id?: number;
  game_id?: number;
  event_type?: number;
  sub_event_type?: number;
  sub_event_type_title?: string;
  start_time?: number | null;
  end_time?: number | null;
  landing_page_uri?: string | null;
  app_card_info?: RawApp;
}

export interface RawEventListData {
  game_total?: number;
  list_a?: RawCalendarEvent[];
  list_b?: RawCalendarEvent[];
  list_c?: RawCalendarEvent[];
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNonNegativeNumber(value: unknown): number {
  const parsed = toFiniteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : 0;
}

export function normalizeApp(app: RawApp | undefined, appIdHint?: number): GameRecord | null {
  const appId = toFiniteNumber(app?.id) ?? toFiniteNumber(appIdHint);
  const title = app?.title?.trim();
  if (!app || !appId || !title) return null;

  const tags = (app.tags ?? [])
    .map((tag) => tag.value?.trim())
    .filter((value): value is string => Boolean(value));
  const developers = (app.developers ?? [])
    .map((developer) => developer.name?.trim())
    .filter((value): value is string => Boolean(value));
  const platforms = (app.platform_info?.supported_platforms ?? [])
    .map((platform) => platform.key?.trim())
    .filter((value): value is string => Boolean(value));
  const rating = toFiniteNumber(app.stat?.rating?.score);

  return {
    appId,
    identifier: app.identifier?.trim() || null,
    title,
    tags,
    developers,
    rating: rating !== null && rating > 0 ? rating : null,
    reserveCount: toNonNegativeNumber(app.stat?.reserve_count),
    hitsTotal: toNonNegativeNumber(app.stat?.hits_total),
    playTotal: toNonNegativeNumber(app.stat?.play_total),
    releasedTime:
      typeof app.released_time === "number" && app.released_time > 0 ? app.released_time : null,
    expectedLaunchTime: app.expected_launch_time?.trim() || null,
    iconUrl:
      app.icon?.url?.trim() || app.icon?.medium_url?.trim() || app.icon?.small_url?.trim() || null,
    platforms,
    sourceUrl: `https://www.taptap.cn/app/${appId}`,
  };
}

export function classifyEvent(title: string | undefined): EventCategory {
  const value = (title ?? "").trim();
  if (!value) return "other";
  if (/预下载/.test(value)) return "release-preload";
  if (/首发|公测|正式上线|上线/.test(value)) return "release";
  if (/预约/.test(value)) return "reservation";
  if (/测试|招募/.test(value)) return "test";
  if (/更新|版本/.test(value)) return "update";
  if (/折扣|特惠|促销/.test(value)) return "discount";
  return "other";
}

export function normalizeCalendarEvent(
  event: RawCalendarEvent,
  fallbackDate: string,
): { event: CalendarEvent | null; warning?: Warning } {
  const app = normalizeApp(event.app_card_info, event.game_id);
  const eventId = toFiniteNumber(event.id);
  if (!app || eventId === null) {
    return {
      event: null,
      warning: {
        code: "calendar_event_invalid",
        message: `calendar event on ${fallbackDate} is missing app id/title or event id`,
        details: { eventId: event.id, appId: event.game_id, title: event.app_card_info?.title },
      },
    };
  }
  const title = event.sub_event_type_title?.trim() || "未分类事件";
  const startTime =
    typeof event.start_time === "number" && event.start_time > 0 ? event.start_time : null;
  // 事件可能横跨多天并在多天查询中重复出现；统一以开始时间的北京日期作为事件日期。
  const eventDate = startTime ? shanghaiDateString(new Date(startTime * 1000)) : fallbackDate;
  return {
    event: {
      ...app,
      eventId,
      eventDate,
      eventType: toFiniteNumber(event.event_type) ?? 0,
      subEventType: toFiniteNumber(event.sub_event_type) ?? 0,
      subEventTypeTitle: title,
      category: classifyEvent(title),
      startTime,
      endTime: typeof event.end_time === "number" && event.end_time > 0 ? event.end_time : null,
      evidenceId: `event:${eventId}`,
    },
  };
}

export function dedupeEvents(events: CalendarEvent[]): CalendarEvent[] {
  const byKey = new Map<string, CalendarEvent>();
  for (const event of events) {
    const key = `${event.eventDate}:${event.evidenceId}`;
    if (!byKey.has(key)) byKey.set(key, event);
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.eventDate !== b.eventDate) return a.eventDate.localeCompare(b.eventDate);
    return a.eventId - b.eventId;
  });
}

/**
 * 新游去重：同一游戏在窗口内只保留一条代表事件。
 * release 优先于 reservation；同类事件保留最早日期。
 */
export function selectRepresentativeEvents(events: CalendarEvent[]): CalendarEvent[] {
  const priority: Record<string, number> = {
    release: 0,
    "release-preload": 1,
    reservation: 2,
    test: 3,
    update: 4,
    discount: 5,
    other: 6,
  };
  const byApp = new Map<number, CalendarEvent>();
  for (const event of events) {
    const current = byApp.get(event.appId);
    if (!current) {
      byApp.set(event.appId, event);
      continue;
    }
    const currentPriority = priority[current.category] ?? 99;
    const nextPriority = priority[event.category] ?? 99;
    if (nextPriority < currentPriority) {
      byApp.set(event.appId, event);
    } else if (nextPriority === currentPriority && event.eventDate < current.eventDate) {
      byApp.set(event.appId, event);
    }
  }
  return [...byApp.values()];
}
