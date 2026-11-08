/**
 * 输入区上下文用量面板的纯计算层。
 *
 * 面板组件与单测共用这一份口径：百分比、占比、token 文案和缓存命中率阈值都在这里算，
 * 组件只做渲染，避免同一份用量在触发器、进度条和明细里各算一遍导致三者不一致。
 */
import type { CSSProperties } from "react";
import type { KayingCodeContextUsageBreakdownItem } from "@zcode/shared";
import { formatCompactTokenNumber } from "../lib/tokenNumberFormat.js";

type ContextUsageBreakdownSource = KayingCodeContextUsageBreakdownItem["source"];

export interface ComposerContextTaskUsage {
  used: number;
  size: number;
  cache?: { hitRate: number | null };
  breakdown?: KayingCodeContextUsageBreakdownItem[];
}

/** 结构化入参只需要 contextWindow，不绑定具体会话快照类型，便于单测直接构造。 */
interface ComposerContextUsageSource {
  contextWindow?: {
    usedTokens: number;
    maxTokens: number;
    cache?: { hitRate: number | null };
    breakdown?: KayingCodeContextUsageBreakdownItem[];
  } | null;
}

interface ContextUsageBreakdownSegment {
  chars: number;
  /** 0..1，占全部上下文来源字符数的比例。 */
  share: number;
  source: ContextUsageBreakdownSource;
}

interface ContextUsageProgressSegment {
  id: string;
  /** 0..1，Progress 的 flexBasis 口径。 */
  percent: number;
  style: CSSProperties;
}

export const CONTEXT_USAGE_PERCENT_MAX = 100;
/** 生产面板只展示明显缓存收益，低于该命中率的行在开发环境外隐藏。 */
const CONTEXT_CACHE_HIT_RATE_DISPLAY_THRESHOLD = 0.78;

const CONTEXT_PROGRESS_TONE_COLORS = [
  "var(--color-usage-chart-1)",
  "color-mix(in oklab, var(--color-usage-chart-1) 78%, var(--color-surface))",
  "color-mix(in oklab, var(--color-usage-chart-1) 58%, var(--color-surface))",
  "color-mix(in oklab, var(--color-usage-chart-1) 42%, var(--color-surface))",
  "color-mix(in oklab, var(--color-usage-chart-1) 28%, var(--color-surface))",
];

const BREAKDOWN_SOURCE_LABEL_ID: Record<ContextUsageBreakdownSource, string> = {
  messages: "chat.contextUsage.breakdown.messages",
  system_prompt: "chat.contextUsage.breakdown.systemPrompt",
  meta_user_context: "chat.contextUsage.breakdown.metaUserContext",
  skills: "chat.contextUsage.breakdown.skills",
  tool_prompt: "chat.contextUsage.breakdown.toolPrompt",
  system_tool_schemas: "chat.contextUsage.breakdown.systemTools",
  mcp_tool_schemas: "chat.contextUsage.breakdown.mcpTools",
};

/** 占比相同时的稳定次序；明细主序仍是占用从大到小。 */
const BREAKDOWN_SOURCE_ORDER: Record<ContextUsageBreakdownSource, number> = {
  messages: 0,
  system_prompt: 1,
  meta_user_context: 2,
  skills: 3,
  tool_prompt: 4,
  system_tool_schemas: 5,
  mcp_tool_schemas: 6,
};

export function getContextUsageBreakdownLabelId(source: ContextUsageBreakdownSource): string {
  return BREAKDOWN_SOURCE_LABEL_ID[source];
}

export function getBreakdownToneStyle(index: number): CSSProperties {
  return {
    backgroundColor:
      CONTEXT_PROGRESS_TONE_COLORS[Math.min(index, CONTEXT_PROGRESS_TONE_COLORS.length - 1)] ??
      CONTEXT_PROGRESS_TONE_COLORS[0],
  };
}

export function resolveComposerContextTaskUsage(
  usage: ComposerContextUsageSource | null | undefined,
): ComposerContextTaskUsage | null {
  const contextWindow = usage?.contextWindow;
  if (!contextWindow) return null;
  return {
    used: contextWindow.usedTokens,
    size: contextWindow.maxTokens,
    ...(contextWindow.cache ? { cache: contextWindow.cache } : {}),
    ...(contextWindow.breakdown ? { breakdown: contextWindow.breakdown } : {}),
  };
}

export function buildContextUsageBreakdownSegments(
  breakdown: readonly KayingCodeContextUsageBreakdownItem[] | undefined,
): ContextUsageBreakdownSegment[] {
  const charsBySource = new Map<ContextUsageBreakdownSource, number>();
  for (const item of breakdown ?? []) {
    if (!Number.isFinite(item.chars) || item.chars <= 0) continue;
    charsBySource.set(item.source, (charsBySource.get(item.source) ?? 0) + item.chars);
  }

  const totalChars = [...charsBySource.values()].reduce((sum, chars) => sum + chars, 0);
  if (totalChars <= 0) return [];

  return [...charsBySource.entries()]
    .map(([source, chars]) => ({ chars, share: chars / totalChars, source }))
    .sort(
      (left, right) =>
        right.chars - left.chars ||
        (BREAKDOWN_SOURCE_ORDER[left.source] ?? 99) - (BREAKDOWN_SOURCE_ORDER[right.source] ?? 99),
    );
}

export function buildContextUsageProgressSegments(
  segments: readonly ContextUsageBreakdownSegment[],
): ContextUsageProgressSegment[] {
  return segments.map((segment, index) => ({
    id: segment.source,
    percent: segment.share,
    style: getBreakdownToneStyle(index),
  }));
}

export function getRenderableTaskUsage<T extends { used: number; size: number }>(
  taskUsage: T | null | undefined,
): (T & { percent: number }) | null {
  if (!taskUsage) return null;
  // used=0 或非法值不代表可展示的上下文占用，避免把初始化兜底渲染成误导性的 0%。
  if (
    !Number.isFinite(taskUsage.used) ||
    !Number.isFinite(taskUsage.size) ||
    taskUsage.used <= 0 ||
    taskUsage.size <= 0
  ) {
    return null;
  }
  const percent = Math.min(
    CONTEXT_USAGE_PERCENT_MAX,
    Math.max(0, (taskUsage.used / taskUsage.size) * CONTEXT_USAGE_PERCENT_MAX),
  );
  return { ...taskUsage, percent };
}

function formatContextUsageTokenCount(
  value: number,
  _locale: string,
  options: { maximumFractionDigits?: number } = {},
): string {
  // token 数是技术规格，与 model context window badge 同口径用 K/M；
  // 不能随中文 locale 变成「万/亿」（1.3万/100万 读感错误）。
  return formatCompactTokenNumber("en-US", value, options);
}

export function formatContextUsageSummary({
  locale,
  percent,
  size,
  used,
}: {
  locale: string;
  percent: number;
  size: number;
  used: number;
}): string {
  const percentageFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    style: "percent",
  });
  return `${formatContextUsageTokenCount(used, locale)}/${formatContextUsageTokenCount(
    size,
    locale,
    {
      maximumFractionDigits: 0,
    },
  )} (${percentageFormatter.format(percent)})`;
}

export function formatContextUsageShare(share: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(Math.min(Math.max(share, 0), 1));
}

export function formatContextCacheHitRateLabel(
  hitRate: number | null | undefined,
  locale: string,
  options: { showBelowThreshold?: boolean } = {},
): string | null {
  if (hitRate === null || hitRate === undefined || !Number.isFinite(hitRate)) {
    return null;
  }
  if (!options.showBelowThreshold && hitRate < CONTEXT_CACHE_HIT_RATE_DISPLAY_THRESHOLD) {
    return null;
  }
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(Math.max(0, hitRate));
}
