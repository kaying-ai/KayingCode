import { join, relative } from "node:path";

import { calendarDayTimestamp, dateRange } from "../lib/date.js";
import { sha256, writeJsonAtomic } from "../lib/json.js";
import type { CalendarEvent, Evidence, Warning } from "../types.js";
import { TapTapHttpClient } from "./httpTransport.js";
import { dedupeEvents, normalizeCalendarEvent, type RawEventListData } from "./normalize.js";

export interface CalendarFetchResult {
  events: CalendarEvent[];
  evidence: Evidence[];
  warnings: Warning[];
  daysAvailable: number;
  gameTotal: number;
}

export async function fetchCalendar(
  client: TapTapHttpClient,
  endDate: string,
  days: number,
  capturedAt: string,
  rawDir: string | null,
): Promise<CalendarFetchResult> {
  const dates = dateRange(endDate, days);
  const fromDate = dates[0]!;
  const allEvents: CalendarEvent[] = [];
  const evidenceById = new Map<string, Evidence>();
  const warnings: Warning[] = [];
  let daysAvailable = 0;
  let gameTotal = 0;

  for (const date of dates) {
    let response;
    try {
      response = await client.getJson<RawEventListData>(
        "/webapiv2/calendar/v1/event-list",
        { day: calendarDayTimestamp(date) },
        "https://www.taptap.cn/app-calendar",
        { storeRaw: false },
      );
    } catch (error) {
      warnings.push({
        code: "calendar_day_failed",
        message: `${date} 的游戏日历采集失败`,
        details: { date, error: String(error) },
      });
      continue;
    }

    const data = response.data;
    const dayGameTotal = typeof data.game_total === "number" ? data.game_total : 0;
    if (dayGameTotal > 0) daysAvailable += 1;
    gameTotal += dayGameTotal;

    const rawEvents = [...(data.list_a ?? []), ...(data.list_b ?? []), ...(data.list_c ?? [])];
    const dayEvents: CalendarEvent[] = [];
    for (const rawEvent of rawEvents) {
      const normalized = normalizeCalendarEvent(rawEvent, date);
      if (normalized.warning) warnings.push(normalized.warning);
      if (normalized.event) dayEvents.push(normalized.event);
    }
    const deduped = dedupeEvents(dayEvents);

    let rawFile: string | null = null;
    const compact = {
      date,
      gameTotal: dayGameTotal,
      events: deduped,
    };
    const rawSha256 = sha256(JSON.stringify(compact));
    if (rawDir) {
      const file = join(rawDir, `calendar-${date}.json`);
      await writeJsonAtomic(file, compact);
      rawFile = relative(process.cwd(), file);
    }

    for (const event of deduped) {
      if (!evidenceById.has(event.evidenceId)) {
        evidenceById.set(event.evidenceId, {
          id: event.evidenceId,
          url: event.sourceUrl,
          capturedAt,
          kind: "calendar",
          ...(rawFile ? { rawFile } : {}),
          rawSha256,
        });
      }
    }
    allEvents.push(...deduped);
  }

  const events = dedupeEvents(allEvents).filter(
    (event) => event.eventDate >= fromDate && event.eventDate <= endDate,
  );

  if (daysAvailable < days) {
    warnings.push({
      code: "calendar_partial",
      message: `游戏日历可用 ${daysAvailable}/${days} 天`,
      details: { daysAvailable, windowDays: days },
    });
  }

  return {
    events,
    evidence: [...evidenceById.values()],
    warnings,
    daysAvailable,
    gameTotal,
  };
}
