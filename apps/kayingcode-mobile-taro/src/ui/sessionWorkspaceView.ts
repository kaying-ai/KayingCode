import type { SessionSummary } from "@zcode/shared/kayingcode-protocol-v4";

const FENCED_CODE_LINE = /^(?:`{3,}|~{3,})/;
const HORIZONTAL_RULE_LINE = /^(?:[-*_]\s*){3,}$/;
const TABLE_SEPARATOR_LINE = /^\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/;
const ORPHAN_MARKDOWN_LINE = /^(?:[-+*]|>|\d{1,3}[.)])$/;
const BLOCK_PREFIX = /^(?:#{1,6}\s+|>\s?|(?:[-+*]|\d{1,3}[.)])\s+(?:\[[ xX]\]\s*)?)/;

/** 首项默认值只在未操作时生效，避免目录刷新把用户已收起的工作区重新展开。 */
export function isWorkspaceExpanded(
  choices: ReadonlyMap<string, boolean>,
  workspaceId: string,
  firstWorkspaceId: string | undefined,
): boolean {
  return choices.get(workspaceId) ?? workspaceId === firstWorkspaceId;
}

/** 把会话索引中的 Markdown 摘要投影为单行纯文本；原始摘要仍用于搜索。 */
export function normalizeSessionPreview(preview: string | null | undefined): string {
  if (!preview) return "";
  const lines = preview.replace(/\r\n?/g, "\n").split("\n");
  const visibleLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      FENCED_CODE_LINE.test(trimmed) ||
      HORIZONTAL_RULE_LINE.test(trimmed) ||
      TABLE_SEPARATOR_LINE.test(trimmed) ||
      ORPHAN_MARKDOWN_LINE.test(trimmed)
    ) {
      continue;
    }
    visibleLines.push(trimmed.replace(BLOCK_PREFIX, ""));
  }
  return visibleLines
    .join(" ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/`+/g, "")
    .replace(/\*\*|__|~~/g, "")
    .replace(/\|/g, " ")
    .replace(/\\([\\`*_[\]{}()#+\-.!>])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function getSessionPreviewLabel(
  session: Pick<SessionSummary, "lastAssistantPreview" | "phase">,
): string {
  return (
    normalizeSessionPreview(session.lastAssistantPreview) ||
    (session.phase === "running" ? "工作中" : "空闲")
  );
}

export function getWorkspaceSessionPreview(
  sessions: readonly SessionSummary[],
  activeWorkspaceId: string | null,
  workspaceId: string,
  showAll: boolean,
  search: string,
): {
  kind: "unavailable" | "available";
  sessions: SessionSummary[];
  total: number;
  isEmpty: boolean;
} {
  if (activeWorkspaceId !== workspaceId) {
    return { kind: "unavailable", sessions: [], total: 0, isEmpty: false };
  }
  const query = search.trim().toLowerCase();
  const matching = query
    ? sessions.filter((item) =>
        `${item.title} ${item.lastAssistantPreview ?? ""}`.toLowerCase().includes(query),
      )
    : [...sessions];
  return {
    kind: "available",
    sessions: showAll || query ? matching : matching.slice(0, 5),
    total: matching.length,
    // 搜索无结果不代表工作区为空，创建入口只根据完整索引决定是否强调。
    isEmpty: sessions.length === 0,
  };
}
