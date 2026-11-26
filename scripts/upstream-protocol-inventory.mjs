#!/usr/bin/env node
/**
 * 上游协议/共享层盘点（P0-1）。
 *
 * 对比 upstream 4.0.0 的 zcode-protocol* 与产品 kayingcode-protocol*：
 * - parity：品牌映射后完全一致
 * - patch：产品有本地改动，需要移入显式 patch 清单
 * - missing：上游存在、产品缺失
 * - product-only：产品独有文件
 *
 * 用法：
 *   node scripts/upstream-protocol-inventory.mjs
 *   node scripts/upstream-protocol-inventory.mjs --check
 *   node scripts/upstream-protocol-inventory.mjs --json-out /tmp/protocol.json
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyBrandMap, mapProtocolPath } from "./lib/kayingcode-brand-map.mjs";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_BASE = "fec975905a2abd4c07e35c40d51fa097a2258ec9";
const DEFAULT_UPSTREAM = "upstream/main";
const DEFAULT_OUT = "scripts/spec/upstream-protocol-4-0-0-inventory.md";

export const PROTOCOL_ROOTS = Object.freeze([
  "packages/shared/src/zcode-protocol",
  "packages/shared/src/zcode-protocol-v4",
  "packages/shared/src/zcode-protocol-legacy-types.ts",
  "apps/zcode-cli/packages/bootstrap/src/zcode-protocol",
  "apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4",
  "apps/zcode-cli/packages/bootstrap/src/zcode-protocol-entrypoint.ts",
]);

export function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

export function lineCount(text) {
  if (text === "") return 0;
  return normalize(text).replace(/\n$/, "").split("\n").length;
}

/** 对单个文件分类；导出供测试使用。 */
export function classifyProtocolFile({ baseContent, upstreamContent, productContent }) {
  const mappedUpstream = normalize(applyBrandMap(upstreamContent));
  const mappedBase = baseContent === null ? null : normalize(applyBrandMap(baseContent));
  const product = productContent === null ? null : normalize(productContent);

  const status =
    product === null ? "missing" : product === mappedUpstream ? "parity" : "patch";
  const productVsBase =
    product === null
      ? "missing"
      : mappedBase === null
        ? "no-base"
        : product === mappedBase
          ? "base"
          : "local-change";
  const upstreamChange =
    baseContent === null
      ? "added"
      : normalize(baseContent) === normalize(upstreamContent)
        ? "unchanged"
        : "modified";

  return { status, productVsBase, upstreamChange, mappedUpstream, mappedBase };
}

export function gitList(ref, root) {
  const output = execFileSync("git", ["ls-tree", "-r", "--name-only", ref, "--", root], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return output.split("\n").filter(Boolean);
}

export function gitShow(ref, path) {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

export function readProductFile(path) {
  try {
    return readFileSync(join(ROOT, path), "utf8");
  } catch {
    return null;
  }
}

function walkFiles(absPath, out) {
  let stat;
  try {
    stat = statSync(absPath);
  } catch {
    return;
  }
  if (stat.isFile()) {
    out.push(absPath);
    return;
  }
  for (const name of readdirSync(absPath)) {
    walkFiles(join(absPath, name), out);
  }
}

export function listProductFiles() {
  const files = [];
  for (const root of PROTOCOL_ROOTS) {
    const absolute = join(ROOT, mapProtocolPath(root));
    const before = files.length;
    walkFiles(absolute, files);
    if (files.length === before) continue;
  }
  return files.map((file) => file.slice(ROOT.length).replace(/^[/\\]/, "")).sort();
}

export function summarizeEntries(entries, productOnly) {
  const summary = {
    upstreamFiles: entries.length,
    parity: 0,
    patch: 0,
    missing: 0,
    productOnly: productOnly.length,
    upstreamAdded: 0,
    upstreamModified: 0,
  };
  for (const entry of entries) {
    summary[entry.status] += 1;
    if (entry.upstreamChange === "added") summary.upstreamAdded += 1;
    if (entry.upstreamChange === "modified") summary.upstreamModified += 1;
  }
  return summary;
}

export function buildInventory({
  base = DEFAULT_BASE,
  upstream = DEFAULT_UPSTREAM,
  withContents = false,
} = {}) {
  const upstreamSet = new Set();
  for (const root of PROTOCOL_ROOTS) {
    for (const file of gitList(upstream, root)) upstreamSet.add(file);
  }
  const upstreamFiles = [...upstreamSet].sort();

  const productFiles = listProductFiles();

  const entries = upstreamFiles.map((upstreamPath) => {
    const productPath = mapProtocolPath(upstreamPath);
    const upstreamContent = gitShow(upstream, upstreamPath);
    if (upstreamContent === null) {
      throw new Error(`upstream file missing: ${upstreamPath}`);
    }
    const baseContent = gitShow(base, upstreamPath);
    const productContent = readProductFile(productPath);
    const classified = classifyProtocolFile({
      baseContent,
      upstreamContent,
      productContent,
    });
    return {
      upstreamPath,
      productPath,
      upstreamLines: lineCount(upstreamContent),
      productLines: productContent === null ? 0 : lineCount(productContent),
      ...classified,
      ...(withContents
        ? {
            baseContent,
            upstreamContent,
            productContent,
          }
        : {}),
    };
  });

  const mappedUpstreamPaths = new Set(entries.map((entry) => entry.productPath));
  const productOnly = productFiles.filter((file) => !mappedUpstreamPaths.has(file));
  const summary = summarizeEntries(entries, productOnly);

  return {
    base,
    upstream,
    generatedAt: new Date().toISOString(),
    summary,
    entries,
    productOnly,
  };
}

function tableRows(rows) {
  return rows.join("\n");
}

export function renderMarkdown(inventory) {
  const { summary, entries, productOnly } = inventory;
  const missing = entries.filter((entry) => entry.status === "missing");
  const patches = entries.filter((entry) => entry.status === "patch");
  const upstreamChanges = entries
    .filter((entry) => entry.upstreamChange !== "unchanged")
    .sort((a, b) => a.upstreamPath.localeCompare(b.upstreamPath));

  const lines = [
    "# 上游协议/共享层盘点（4.0.0）",
    "",
    `生成时间：${inventory.generatedAt}`,
    `基线：\`${inventory.base}\``,
    `上游：\`${inventory.upstream}\``,
    "",
    "> 本文件由 `scripts/upstream-protocol-inventory.mjs` 生成，不要手改。",
    "> `patch` 不代表错误：它表示品牌映射后仍有产品本地改动，需要在 P0-2 移入显式 patch 清单并确认是否保留。",
    "> `missing` 也不代表必须补入：其中包含 CUA、permanent-deletion、plugin-host-queries 等产品边界项，需要逐项确认。",
    "",
    "## 汇总",
    "",
    "| 项目 | 数量 |",
    "| --- | --- |",
    `| 上游文件 | ${summary.upstreamFiles} |`,
    `| parity（映射后一致） | ${summary.parity} |`,
    `| patch（产品本地改动） | ${summary.patch} |`,
    `| missing（产品缺失） | ${summary.missing} |`,
    `| product-only（产品独有） | ${summary.productOnly} |`,
    `| 上游相对基线新增 | ${summary.upstreamAdded} |`,
    `| 上游相对基线修改 | ${summary.upstreamModified} |`,
    "",
    "## 产品缺失文件",
    "",
  ];

  if (missing.length === 0) {
    lines.push("无。", "");
  } else {
    lines.push(
      "| 上游文件 | 期望产品路径 | 上游行数 |",
      "| --- | --- | --- |",
      tableRows(
        missing.map(
          (entry) =>
            `| \`${entry.upstreamPath}\` | \`${entry.productPath}\` | ${entry.upstreamLines} |`,
        ),
      ),
      "",
    );
  }

  lines.push("## 产品本地改动（patch）", "");
  if (patches.length === 0) {
    lines.push("无。", "");
  } else {
    lines.push(
      "| 文件 | 上游行数 | 产品行数 | 产品相对基线 | 上游相对基线 |",
      "| --- | --- | --- | --- | --- |",
      tableRows(
        patches.map(
          (entry) =>
            `| \`${entry.upstreamPath}\` | ${entry.upstreamLines} | ${entry.productLines} | ${entry.productVsBase} | ${entry.upstreamChange} |`,
        ),
      ),
      "",
    );
  }

  lines.push("## 产品独有文件", "");
  if (productOnly.length === 0) {
    lines.push("无。", "");
  } else {
    lines.push(tableRows(productOnly.map((file) => `- \`${file}\``)), "");
  }

  lines.push("## 上游相对基线变化", "");
  if (upstreamChanges.length === 0) {
    lines.push("无。", "");
  } else {
    const shown = upstreamChanges.slice(0, 80);
    lines.push(
      "| 上游文件 | 变化 | 产品状态 |",
      "| --- | --- | --- |",
      tableRows(
        shown.map(
          (entry) =>
            `| \`${entry.upstreamPath}\` | ${entry.upstreamChange} | ${entry.status} |`,
        ),
      ),
      "",
    );
    if (upstreamChanges.length > shown.length) {
      lines.push(`其余 ${upstreamChanges.length - shown.length} 个文件省略。`, "");
    }
  }

  return lines.join("\n");
}

function parseArgs(argv) {
  const options = {
    base: DEFAULT_BASE,
    upstream: DEFAULT_UPSTREAM,
    out: DEFAULT_OUT,
    jsonOut: null,
    check: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") options.base = argv[++index];
    else if (arg === "--upstream") options.upstream = argv[++index];
    else if (arg === "--out") options.out = argv[++index];
    else if (arg === "--json-out") options.jsonOut = argv[++index];
    else if (arg === "--check") options.check = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "用法: node scripts/upstream-protocol-inventory.mjs [--base <ref>] [--upstream <ref>] [--out <file>] [--json-out <file>] [--check]",
      );
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return options;
}

function resolvePath(path) {
  return isAbsolute(path) ? path : join(ROOT, path);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inventory = buildInventory(options);
  const markdown = renderMarkdown(inventory);

  const outPath = resolvePath(options.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, markdown, "utf8");
  if (options.jsonOut) {
    const jsonPath = resolvePath(options.jsonOut);
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  }

  const { summary } = inventory;
  console.log(
    `protocol inventory: ${summary.upstreamFiles} upstream, parity ${summary.parity}, patch ${summary.patch}, missing ${summary.missing}, product-only ${summary.productOnly}`,
  );
  console.log(`written: ${options.out}`);

  if (options.check && summary.missing > 0) {
    console.error(`protocol inventory check failed: ${summary.missing} missing files`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
