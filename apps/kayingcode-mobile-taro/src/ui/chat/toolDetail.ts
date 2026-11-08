// 工具行的展示派生：diff、工具族配色、目标路径、待办/搜索/MCP 摘要。
//
// 与 Flutter 保持同一口径（含它的取舍）：
// - 工具族的「专门视图」是名字子串启发式，不是白名单——新工具名不需要改这里就能落进
//   最接近的族里；
// - diff 只认 old/new 文本对与 structuredPatch，**不解析裸 unified diff**（`@@` 行会
//   被判成 context），也不显示行号；
// - todo / 搜索 / MCP 的载荷解析是 all-or-nothing：任一条目畸形则整段退回通用输出块。
import type { ConversationRow } from "@zcode/shared/kayingcode-protocol-v4";

export type DiffLineType = "context" | "added" | "removed";

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

export interface DiffData {
  filePath: string | null;
  lines: DiffLine[];
  /** 语义：来源是结构化 patch（带增删统计）时为真。 */
  structured: boolean;
}

const OLD_KEYS = ["oldText", "old_string", "oldString", "before", "old_content", "oldContent"];
const NEW_KEYS = ["newText", "new_string", "newString", "after", "new_content", "newContent", "content"];
const PATH_KEYS = ["filePath", "file_path", "path", "file"];
const DIFF_LINE_LIMIT = 400;

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Rec) : null;
}

function firstString(record: Rec | null, keys: readonly string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

/** 从工具行提取 diff；没有可识别结构时返回 null。 */
export function extractDiff(row: ConversationRow): DiffData | null {
  if (row.kind !== "toolCall") return null;
  const record = row as unknown as Rec;
  const output = asRecord(record.output);
  const display = asRecord(record.display);
  const displayIsDiff = display?.kind === "file_diff";
  const candidates: (Rec | null)[] = [
    asRecord(record.input),
    output,
    displayIsDiff ? display : null,
  ];
  const filePath =
    firstString(displayIsDiff ? display : null, PATH_KEYS) ??
    firstString(asRecord(record.input), PATH_KEYS) ??
    firstString(output, PATH_KEYS);

  for (const candidate of candidates) {
    const before = firstString(candidate, OLD_KEYS);
    const after = firstString(candidate, NEW_KEYS);
    if (before !== null && after !== null) {
      return { filePath, lines: buildLines(before, after), structured: false };
    }
  }

  const patch = displayIsDiff ? display?.structuredPatch : asRecord(record.output)?.structuredPatch;
  if (Array.isArray(patch)) {
    const lines: DiffLine[] = [];
    for (const hunk of patch) {
      const hunkRecord = asRecord(hunk);
      const hunkLines = hunkRecord?.lines;
      if (!Array.isArray(hunkLines)) continue;
      for (const entry of hunkLines) {
        lines.push(classifyDiffEntry(entry));
      }
      if (lines.length >= DIFF_LINE_LIMIT) break;
    }
    if (lines.length > 0) return { filePath, lines, structured: true };
  }
  return null;
}

function classifyDiffEntry(entry: unknown): DiffLine {
  const record = asRecord(entry);
  if (record) {
    const kind = String(record.type ?? "");
    const text = typeof record.content === "string" ? record.content : String(record.text ?? "");
    return { type: classifyKind(kind), text };
  }
  return classifyText(typeof entry === "string" ? entry : String(entry ?? ""));
}

function classifyKind(kind: string): DiffLineType {
  if (kind === "add" || kind === "added" || kind === "+") return "added";
  if (kind === "remove" || kind === "removed" || kind === "del" || kind === "-") return "removed";
  return "context";
}

function classifyText(line: string): DiffLine {
  if (line.startsWith("+")) return { type: "added", text: line };
  if (line.startsWith("-")) return { type: "removed", text: line };
  return { type: "context", text: line };
}

/** old/new 文本对的启发式 diff（无 LCS）：公共前缀/后缀之外的中间段整体算改。 */
function buildLines(before: string, after: string): DiffLine[] {
  const left = before.split("\n");
  const right = after.split("\n");
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const keepHead = Math.min(2, prefix);
  const keepTail = Math.min(2, suffix);
  const lines: DiffLine[] = [];
  for (let index = prefix - keepHead; index < prefix; index += 1) {
    lines.push({ type: "context", text: ` ${left[index] ?? ""}` });
  }
  if (prefix - keepHead > 0) lines.push({ type: "context", text: " ⋯" });
  for (let index = prefix; index < left.length - suffix; index += 1) {
    lines.push({ type: "removed", text: `-${left[index] ?? ""}` });
  }
  for (let index = prefix; index < right.length - suffix; index += 1) {
    lines.push({ type: "added", text: `+${right[index] ?? ""}` });
  }
  if (suffix - keepTail > 0) lines.push({ type: "context", text: " ⋯" });
  for (let index = left.length - keepTail; index < left.length; index += 1) {
    lines.push({ type: "context", text: ` ${left[index] ?? ""}` });
  }
  return lines.slice(0, DIFF_LINE_LIMIT);
}

export const DIFF_TRUNCATE_LIMIT = DIFF_LINE_LIMIT;

/** 工具族强调色 token（对应 CSS 的 .tool-tone-*）。 */
export function toolTone(toolName: string): string {
  const name = toolName.toLowerCase();
  if (name.includes("todo") || name.includes("plan")) return "primary";
  if (name === "bash" || name.includes("shell") || name.includes("terminal")) return "warn";
  if (name.includes("edit") || name.includes("write")) return "ok";
  if (
    name.includes("read") ||
    name.includes("grep") ||
    name.includes("glob") ||
    name.includes("search") ||
    name.includes("find")
  ) {
    return "run";
  }
  return "primary";
}

/** 只读类工具默认折叠（read 且不是 todo）。 */
export function isReadOnlyTool(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return name.includes("read") && !name.includes("todo");
}

export function toolTargetPath(row: ConversationRow): string | null {
  if (row.kind !== "toolCall") return null;
  const record = row as unknown as Rec;
  const input = asRecord(record.input);
  const direct = firstString(input, PATH_KEYS);
  if (direct) return direct;
  if (typeof row.inputText === "string" && row.inputText.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(row.inputText) as unknown;
      return firstString(asRecord(parsed), PATH_KEYS);
    } catch {
      return null;
    }
  }
  return null;
}

export function toolOutputText(row: ConversationRow): string {
  if (row.kind !== "toolCall") return "";
  const output = asRecord((row as unknown as Rec).output);
  return typeof output?.text === "string" ? output.text : "";
}

export function toolErrorText(row: ConversationRow): string | null {
  if (row.kind !== "toolCall" || !row.error) return null;
  return `${row.error.code} ${row.error.message}`.trim();
}

// ── 待办（TodoWrite / update_plan）──────────────────────────────────────────

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoStep {
  title: string;
  status: TodoStatus;
}

const TODO_PLAN_TOOL = /(?:^|[_\s-])(?:todo[_\s-]*(?:read|write)|update[_\s-]*plan)(?:$|[_\s-])/;
const PLAN_CONTAINER_KEYS = ["todos", "plan", "steps", "items"];

export function isTodoPlanTool(name: string, title = "", kind = ""): boolean {
  return TODO_PLAN_TOOL.test(`${name} ${title} ${kind}`.trim());
}

/** 从一段载荷值解析待办清单；格式不符返回 null（调用方继续看下一个候选）。 */
export function parseTodoSteps(value: unknown): TodoStep[] | null {
  const array = Array.isArray(value)
    ? value
    : PLAN_CONTAINER_KEYS.map((key) => asRecord(value)?.[key]).find((item) => Array.isArray(item));
  if (!Array.isArray(array)) return null;
  const steps: TodoStep[] = [];
  for (const entry of array) {
    const record = asRecord(entry);
    const rawTitle = firstString(record, ["content", "step", "title", "text", "activeForm"]);
    if (rawTitle === null) return null;
    const rawStatus = String(record?.status ?? "pending").replace(/-/g, "_");
    const status: TodoStatus =
      rawStatus === "completed" || rawStatus === "done"
        ? "completed"
        : rawStatus === "in_progress" || rawStatus === "inProgress" || rawStatus === "running"
          ? "in_progress"
          : "pending";
    steps.push({ title: rawTitle, status });
  }
  return steps.length > 0 ? steps : null;
}

/** 取最近一条 TodoWrite 行的清单（自底向上，命中即返回）。 */
export function latestTodoSteps(rows: readonly ConversationRow[]): TodoStep[] | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    if (row.kind !== "toolCall") continue;
    if (!isTodoPlanTool(row.toolName, "", row.kind)) continue;
    const record = row as unknown as Rec;
    const candidates = [
      asRecord(record.input),
      row.inputText,
      asRecord(record.output),
      toolOutputText(row),
    ];
    for (const candidate of candidates) {
      const parsed = parseTodoSteps(candidate);
      if (parsed) return parsed;
    }
  }
  return null;
}

// ── 搜索 / MCP 摘要 ────────────────────────────────────────────────────────

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export function isWebSearchTool(name: string): boolean {
  const lowered = name.toLowerCase();
  return lowered.includes("websearch") || lowered.includes("web_search");
}

/** 搜索摘要解析：兼容 JSON 数组 / 结果容器 / 带 URL 的纯文本 / answer 单段。 */
export function parseSearchSummary(text: string): { query: string; hits: SearchHit[] } | null {
  if (text.trim().length === 0) return null;
  const parsed = tryJson(text);
  const container = Array.isArray(parsed)
    ? parsed
    : ["results", "data", "items", "searchResults"]
        .map((key) => asRecord(parsed)?.[key])
        .find((item) => Array.isArray(item));
  if (Array.isArray(container)) {
    const hits: SearchHit[] = [];
    for (const entry of container) {
      const record = asRecord(entry);
      const url = firstString(record, ["url", "link"]);
      const title = firstString(record, ["title", "name"]) ?? url;
      if (title === null) return null;
      hits.push({
        title,
        url: url ?? "",
        snippet: firstString(record, ["snippet", "content", "description"]) ?? "",
      });
    }
    if (hits.length > 0) return { query: "", hits };
  }
  const answer = firstString(asRecord(parsed), ["answer", "content", "summary", "text"]);
  if (answer !== null) return { query: "", hits: [{ title: "", url: "", snippet: answer }] };
  const lines = text.split("\n").filter((line) => /^https?:\/\//.test(line.trim()));
  if (lines.length > 0) {
    return { query: "", hits: lines.map((line) => ({ title: line.trim(), url: line.trim(), snippet: "" })) };
  }
  return null;
}

export function isMcpTool(toolName: string, outputText: string): boolean {
  const lowered = toolName.toLowerCase();
  if (lowered.includes("bash") || isTodoPlanTool(toolName) || isWebSearchTool(toolName)) return false;
  return lowered.includes("mcp") || lowered.includes("skill") || outputText.includes('"content":[');
}

/** MCP content[].text 拼接；否则退化为顶层键值摘要。 */
export function parseMcpSummary(text: string): string | null {
  const parsed = tryJson(text);
  const content = asRecord(parsed)?.content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const entry of content) {
      const record = asRecord(entry);
      if (record?.type === "text" && typeof record.text === "string") parts.push(record.text);
    }
    if (parts.length > 0) return parts.join("\n");
  }
  const record = asRecord(parsed);
  if (record) {
    const lines = Object.entries(record).map(([key, value]) =>
      Array.isArray(value)
        ? `${key}: ${value.length} 项`
        : `${key}: ${typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}`,
    );
    if (lines.length > 0) return lines.join("\n");
  }
  return null;
}

function tryJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

// ── 文件变更条目 ───────────────────────────────────────────────────────────

export interface FileChangeEntry {
  path: string;
  additions: number;
  deletions: number;
}

export function parseFileChangeEntries(value: unknown): FileChangeEntry[] {
  const list = Array.isArray(value)
    ? value
    : ["files", "changes", "fileChanges", "entries", "items"]
        .map((key) => asRecord(value)?.[key])
        .find((item) => Array.isArray(item));
  const entries = Array.isArray(list)
    ? list
    : asRecord(value) && firstString(asRecord(value), PATH_KEYS)
      ? [value]
      : [];
  const out: FileChangeEntry[] = [];
  for (const item of entries) {
    const record = asRecord(item);
    const path = firstString(record, PATH_KEYS) ?? "文件";
    out.push({
      path,
      additions: numberOr(firstString(record, ["additions", "added"]) ?? record?.additions, 0),
      deletions: numberOr(firstString(record, ["deletions", "removed"]) ?? record?.deletions, 0),
    });
  }
  return out;
}

function numberOr(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}
