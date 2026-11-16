import { REPORT_TIMEZONE } from "../types.js";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function shanghaiDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isDateString(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function assertDateString(value: string, name = "date"): string {
  if (!isDateString(value)) {
    throw new Error(`${name} must be YYYY-MM-DD, got: ${value}`);
  }
  return value;
}

export function addDays(dateStr: string, delta: number): string {
  assertDateString(dateStr);
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function dateRange(endDate: string, days: number): string[] {
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error(`days must be a positive integer, got: ${days}`);
  }
  return Array.from({ length: days }, (_, index) => addDays(endDate, index - (days - 1)));
}

/**
 * TapTap 的 calendar day 参数按站点 SSR 的编码方式生成：
 * 北京时间的自然日标签，编码为同名 UTC 日期的零点秒级时间戳。
 */
export function calendarDayTimestamp(dateStr: string): number {
  assertDateString(dateStr);
  const [year, month, day] = dateStr.split("-").map(Number);
  return Math.floor(Date.UTC(year!, month! - 1, day!) / 1000);
}

export function formatBeijingDateTime(epochSeconds: number | null): string {
  if (!epochSeconds) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(epochSeconds * 1000));
}

export function formatBeijingDate(epochSeconds: number | null): string {
  if (!epochSeconds) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(epochSeconds * 1000));
}

export function nowIso(): string {
  return new Date().toISOString();
}
