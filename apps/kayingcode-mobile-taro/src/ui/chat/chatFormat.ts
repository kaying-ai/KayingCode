// 聊天页的数值与时间格式化。
//
// 两条 token 格式化路径刻意分开（与 Flutter 一致）：用量面板用「万/百万/亿」中文
// 单位，消息区上下文条用 `k`。合成一个函数会让两处之一必然错。

const MINUTE = 60_000;
const HOUR = 3_600_000;

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function clockTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 行时间标签：今天只给时分，昨天/同年/跨年逐级补日期前缀。 */
export function formatRowTime(timestamp: number, now = Date.now()): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  const date = new Date(timestamp);
  const today = new Date(now);
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) return clockTime(timestamp);
  const yesterday = new Date(now - 24 * 60 * MINUTE);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return `昨天 ${clockTime(timestamp)}`;
  if (date.getFullYear() === today.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${clockTime(timestamp)}`;
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${clockTime(timestamp)}`;
}

/** 会话抽屉的相对时间（与 Flutter 的 _relativeDayLabel 同口径）。 */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  const delta = now - timestamp;
  if (delta < MINUTE) return "刚刚";
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)} 分钟前`;
  if (delta < 24 * HOUR) return `${Math.floor(delta / HOUR)} 小时前`;
  if (delta < 48 * HOUR) return `昨天 ${clockTime(timestamp)}`;
  if (delta < 7 * 24 * HOUR) return `${Math.floor(delta / (24 * HOUR))} 天前`;
  const date = new Date(timestamp);
  const today = new Date(now);
  if (date.getFullYear() === today.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 工作量时长：不足一分钟给秒，否则 m:ss（与 Flutter 的 _WorkingLabel 同口径）。 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${pad(totalSeconds % 60)}`;
}

/** 用量面板的 token 单位（万 / 百万 / 亿）。 */
export function formatTokensZh(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)} 亿`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} 百万`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)} 万`;
  return String(Math.round(value));
}

/** 消息区上下文条的紧凑单位（k）。 */
export function formatTokensCompact(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

/** 缓存命中率：优先 contextWindow.cache.hitRate，否则累计读写比。 */
export function cacheHitFraction(
  cache: { hitRate?: number | null } | undefined,
  cumulative: { inputTokens: number; cacheReadTokens: number },
): number | null {
  if (cache && typeof cache.hitRate === "number" && Number.isFinite(cache.hitRate)) {
    return cache.hitRate;
  }
  if (cumulative.inputTokens > 0) return cumulative.cacheReadTokens / cumulative.inputTokens;
  return null;
}

export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** 剩余额度重置时间：当天给「今天 HH:mm」，否则「M/D HH:mm」。 */
export function formatQuotaReset(resetAt: number, now = Date.now()): string {
  if (!Number.isFinite(resetAt) || resetAt <= 0) return "";
  const date = new Date(resetAt);
  const today = new Date(now);
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return sameDay ? `今天 ${clock}` : `${date.getMonth() + 1}/${date.getDate()} ${clock}`;
}

/** 协作模式的展示名、说明与是否高危（plan / yolo / full）。 */
export function modeLabel(mode: string): string {
  return MODE_META[mode.toLowerCase()]?.label ?? (mode || "模式");
}

export function modeDescription(mode: string): string {
  return MODE_META[mode]?.description ?? "";
}

export function modeIsHot(mode: string): boolean {
  return mode === "plan" || mode === "yolo" || mode === "full";
}

// 与 Flutter chat/composer.dart 的 _modeMeta 逐字对齐：build/ask 是「变更前确认」、
// edit/auto 是「自动编辑」——两侧曾把这两个名字写反，模式标签与选择器会一起错。
export const MODE_META: Record<string, { label: string; description: string }> = {
  plan: { label: "计划模式", description: "编辑前先出计划。" },
  build: { label: "变更前确认", description: "改文件前先问我。" },
  ask: { label: "变更前确认", description: "改文件前先问我。" },
  edit: { label: "自动编辑", description: "自动编辑文件。" },
  auto: { label: "自动编辑", description: "自动编辑文件。" },
  yolo: { label: "完全访问", description: "减少确认次数。" },
  full: { label: "完全访问", description: "减少确认次数。" },
};
