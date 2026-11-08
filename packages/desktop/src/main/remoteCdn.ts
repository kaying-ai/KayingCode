import { KAYINGCODE_VERSION, type KayingCodeEnv } from "@zcode/shared";

declare const __KAYINGCODE_CDN_BASE_URL__: string | undefined;
// KayingCode.localrun：无官方 CDN。远程资源仅走本地 mock-cdn / 显式配置，不设公网默认值。
const DEFAULT_CDN_BASE_URL = "";

export interface ResolveRemoteCdnOptions {
  env?: KayingCodeEnv;
  locale?: string;
  timeZone?: string;
  overrideBaseUrl?: string;
  version?: string;
  now?: Date;
}

function isChineseLocale(locale?: string | null): boolean {
  return locale?.trim().toLowerCase().startsWith("zh") ?? false;
}

function resolveLocalTimeZone(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function isUtcPlusEightTimeZone(timeZone?: string | null, now: Date = new Date()): boolean {
  const normalizedTimeZone = timeZone?.trim();
  if (!normalizedTimeZone) {
    return false;
  }

  const offsetMinutes = resolveTimeZoneOffsetMinutes(normalizedTimeZone, now);
  return offsetMinutes === 8 * 60;
}

export function shouldPreferDomesticRemoteCdn(
  options: Pick<ResolveRemoteCdnOptions, "locale" | "timeZone" | "now">,
): boolean {
  const timeZone = options.timeZone ?? resolveLocalTimeZone();
  return isChineseLocale(options.locale) && isUtcPlusEightTimeZone(timeZone, options.now);
}

export function resolveRemoteCdnBaseUrls(options: ResolveRemoteCdnOptions = {}): string[] {
  const override = options.overrideBaseUrl?.trim();
  if (override) return [normalizeBaseUrl(override)];
  const baseUrl =
    process.env.KAYINGCODE_CDN_BASE_URL?.trim() ||
    (typeof __KAYINGCODE_CDN_BASE_URL__ === "undefined" ? "" : __KAYINGCODE_CDN_BASE_URL__) ||
    DEFAULT_CDN_BASE_URL;
  // KayingCode.localrun：CDN base 为空表示无远程资源源，应返回空列表，
  // 让部署走 mock-cdn / 本地上传。不能对空串 new URL，否则创建远程连接
  // 会在 resolveRemoteAssetDirs 直接 ERR_INVALID_URL（SSH/WSL/Docker 均入口即炸）。
  const trimmedBase = baseUrl.trim();
  if (!trimmedBase) {
    return [];
  }
  return [
    `${normalizeBaseUrl(trimmedBase)}/kayingcode/electron/releases/${options.version ?? KAYINGCODE_VERSION}`,
  ];
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function resolveTimeZoneOffsetMinutes(timeZone: string, now: Date): number | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(now);
    const values = Object.fromEntries(
      parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
    );
    const year = Number(values.year);
    const month = Number(values.month);
    const day = Number(values.day);
    const hour = Number(values.hour);
    const minute = Number(values.minute);
    const second = Number(values.second);
    if ([year, month, day, hour, minute, second].some((value) => Number.isNaN(value))) {
      return null;
    }

    // 这里把目标时区“格式化后的人类时间”反算成 UTC，得到该时区相对 UTC 的真实偏移。
    // 不能只按常见亚洲城市白名单判断，否则 UTC+8 但非中国命名的时区会被误判。
    const targetUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const currentUtcMs = now.getTime();
    return Math.round((targetUtcMs - currentUtcMs) / 60_000);
  } catch {
    return null;
  }
}
