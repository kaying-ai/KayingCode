// 会话正文的 Markdown 子集解析（纯函数，无平台依赖）。
//
// 对等 Flutter 的 flutter_markdown_plus + markdown 包：块级覆盖 h1–h6、围栏代码块
// （带语言）、有序/无序列表、引用、表格、分隔线；行内覆盖粗体/斜体/删除线/行内码/链接。
// 刻意不做 HTML 透传与图片块——weapp 的 rich-text 需要额外节点协议，而移动端
// assistant 正文里出现裸 HTML 的概率远低于收益。
//
// 渲染在 markdownView.tsx；本文件只产结构与文本，便于单测。

export type MdInline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "del"; text: string }
  | { kind: "link"; text: string; href: string };

export interface MdListItem {
  marker: string;
  depth: number;
  inlines: MdInline[];
}

export type MdBlock =
  | { kind: "heading"; level: number; inlines: MdInline[] }
  | { kind: "paragraph"; inlines: MdInline[] }
  | { kind: "code"; language: string; text: string }
  | { kind: "list"; ordered: boolean; items: MdListItem[] }
  | { kind: "quote"; blocks: MdBlock[] }
  | { kind: "hr" }
  | { kind: "table"; head: string[]; rows: string[][] };

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([^`\s]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** 解析整段 Markdown 文本。 */
export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  return parseBlocks(lines);
}

function parseBlocks(lines: string[]): MdBlock[] {
  const blocks: MdBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const [code, next] = readFence(lines, index, fence[1]!);
      blocks.push({ kind: "code", language: fence[2] ?? "", text: code });
      index = next;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1]!.length,
        inlines: parseInline(heading[2]!),
      });
      index += 1;
      continue;
    }
    if (HR.test(line)) {
      blocks.push({ kind: "hr" });
      index += 1;
      continue;
    }
    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (index < lines.length) {
        const matched = QUOTE.exec(lines[index]!);
        if (!matched) break;
        inner.push(matched[1]!);
        index += 1;
      }
      blocks.push({ kind: "quote", blocks: parseBlocks(inner) });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const [list, next] = readList(lines, index);
      blocks.push(list);
      index = next;
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && TABLE_SEPARATOR.test(lines[index + 1]!)) {
      const [table, next] = readTable(lines, index);
      blocks.push(table);
      index = next;
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && !isBlockStart(lines, index)) {
      paragraph.push(lines[index]!.trim());
      index += 1;
    }
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", inlines: parseInline(paragraph.join("\n")) });
    }
  }
  return blocks;
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index]!;
  if (line.trim().length === 0) return true;
  if (FENCE.test(line) || HEADING.test(line) || HR.test(line)) return true;
  if (QUOTE.test(line) || LIST_ITEM.test(line)) return true;
  return line.includes("|") && index + 1 < lines.length && TABLE_SEPARATOR.test(lines[index + 1]!);
}

function readFence(lines: string[], start: number, marker: string): [string, number] {
  const closing = new RegExp(`^\\s{0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`);
  const body: string[] = [];
  let index = start + 1;
  while (index < lines.length && !closing.test(lines[index]!)) {
    body.push(lines[index]!);
    index += 1;
  }
  return [body.join("\n"), Math.min(index + 1, lines.length)];
}

function readList(lines: string[], start: number): [MdBlock, number] {
  const items: MdListItem[] = [];
  let ordered = false;
  let index = start;
  while (index < lines.length) {
    const matched = LIST_ITEM.exec(lines[index]!);
    if (!matched) {
      // 续行（缩进对齐的折行）并进上一项。
      if (items.length > 0 && /^\s{2,}\S/.test(lines[index]!) && lines[index]!.trim().length > 0) {
        const last = items[items.length - 1]!;
        last.inlines = [
          ...last.inlines,
          { kind: "text", text: `\n${lines[index]!.trim()}` },
        ];
        index += 1;
        continue;
      }
      break;
    }
    ordered = ordered || /\d/.test(matched[2]!);
    items.push({
      marker: matched[2]!,
      depth: Math.floor(matched[1]!.replace(/\t/g, "  ").length / 2),
      inlines: parseInline(matched[3]!),
    });
    index += 1;
  }
  return [{ kind: "list", ordered, items }, index];
}

function readTable(lines: string[], start: number): [MdBlock, number] {
  const head = splitTableRow(lines[start]!);
  const rows: string[][] = [];
  let index = start + 2;
  while (index < lines.length && lines[index]!.includes("|") && lines[index]!.trim().length > 0) {
    rows.push(splitTableRow(lines[index]!));
    index += 1;
  }
  return [{ kind: "table", head, rows }, index];
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

/** 行内解析：单趟扫描，未闭合的标记按字面量保留。 */
export function parseInline(source: string): MdInline[] {
  const out: MdInline[] = [];
  let buffer = "";
  let index = 0;
  const flush = () => {
    if (buffer.length > 0) {
      out.push({ kind: "text", text: buffer });
      buffer = "";
    }
  };
  while (index < source.length) {
    const rest = source.slice(index);
    const consumed = matchInline(rest, out, flush);
    if (consumed > 0) {
      index += consumed;
      continue;
    }
    buffer += source[index]!;
    index += 1;
  }
  flush();
  return out;
}

function matchInline(rest: string, out: MdInline[], flush: () => void): number {
  const escape = /^\\([\\`*_{}[\]()#+\-.!~>|])/.exec(rest);
  if (escape) {
    flush();
    out.push({ kind: "text", text: escape[1]! });
    return escape[0].length;
  }
  const code = /^(`+)([\s\S]*?)\1/.exec(rest);
  if (code) {
    flush();
    out.push({ kind: "code", text: code[2]!.trim() });
    return code[0].length;
  }
  const link = /^!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest);
  if (link) {
    flush();
    out.push({ kind: "link", text: link[1]! || link[2]!, href: link[2]! });
    return link[0].length;
  }
  // 强调标记必须非空且不跨越空行，否则按字面量保留（`a * b` 不是斜体）。
  const strong = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(rest);
  if (strong) {
    flush();
    out.push({ kind: "strong", text: strong[2]! });
    return strong[0].length;
  }
  const del = /^~~(?=\S)([\s\S]*?\S)~~/.exec(rest);
  if (del) {
    flush();
    out.push({ kind: "del", text: del[1]! });
    return del[0].length;
  }
  const em = /^(\*|_)(?=\S)([^*_\n]*?\S)\1/.exec(rest);
  if (em) {
    flush();
    out.push({ kind: "em", text: em[2]! });
    return em[0].length;
  }
  const autoLink = /^<((?:https?|mailto):[^>\s]+)>/.exec(rest);
  if (autoLink) {
    flush();
    out.push({ kind: "link", text: autoLink[1]!, href: autoLink[1]! });
    return autoLink[0].length;
  }
  return 0;
}
