import type { EventCategory, Evidence } from "../types.js";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeMarkdown(value: unknown): string {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .replaceAll("\r", " ");
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function formatRating(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatRankChange(value: number | null): string {
  if (value === null) return "—";
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return "0";
}

export function categoryLabel(category: EventCategory): string {
  switch (category) {
    case "release":
      return "首发";
    case "release-preload":
      return "预下载";
    case "reservation":
      return "新游预约";
    case "test":
      return "测试";
    case "update":
      return "版本更新";
    case "discount":
      return "折扣";
    default:
      return "其他";
  }
}

export function crowdingLabel(level: string): string {
  switch (level) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
    default:
      return "未知";
  }
}

export function confidenceLabel(value: string): string {
  switch (value) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
    default:
      return value;
  }
}

export function evidenceRefsMarkdown(ids: string[], evidence: Map<string, Evidence>): string {
  const refs = ids
    .map((id) => evidence.get(id))
    .filter((item): item is Evidence => Boolean(item))
    .map((item) => `[${escapeMarkdown(item.id)}](${item.url})`);
  return refs.length > 0 ? refs.join(" ") : "—";
}

export function evidenceRefsHtml(ids: string[], evidence: Map<string, Evidence>): string {
  const refs = ids
    .map((id) => evidence.get(id))
    .filter((item): item is Evidence => Boolean(item))
    .map(
      (item) =>
        `<a href="${escapeHtml(item.url)}" rel="noreferrer" target="_blank">${escapeHtml(item.id)}</a>`,
    );
  return refs.length > 0 ? refs.join(" ") : "—";
}

export function dataQualityLabel(value: string): string {
  return value === "ok" ? "正常" : "降级";
}
