#!/usr/bin/env node
/**
 * 上游协议三方合并 POC（P0-2）。
 *
 * 对每个协议文件执行：
 *   产品当前 (ours) + 3.18.2 品牌映射 (base) + 4.0.0 品牌映射 (theirs)
 * 输出到临时目录并生成报告；不直接改写 packages/ 下的运行时文件。
 *
 * 用法：
 *   node scripts/upstream-protocol-merge.mjs
 *   node scripts/upstream-protocol-merge.mjs --out-dir /tmp/merged --report /tmp/report.md
 *   node scripts/upstream-protocol-merge.mjs --fail-on-conflict
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyBrandMap } from "./lib/kayingcode-brand-map.mjs";
import {
  buildInventory,
  normalize,
  readProductFile,
  ROOT,
} from "./upstream-protocol-inventory.mjs";

const DEFAULT_OUT_DIR = join(tmpdir(), "kayingcode-upstream-protocol-4.0.0");
const DEFAULT_REPORT = "scripts/spec/upstream-protocol-4-0-0-merge-report.md";

export function mergeThreeWay({ ours, base, theirs, tempDir }) {
  const oursPath = join(tempDir, "ours.ts");
  const basePath = join(tempDir, "base.ts");
  const theirsPath = join(tempDir, "theirs.ts");
  writeFileSync(oursPath, ours, "utf8");
  writeFileSync(basePath, base, "utf8");
  writeFileSync(theirsPath, theirs, "utf8");

  const result = spawnSync(
    "git",
    ["merge-file", "-p", oursPath, basePath, theirsPath],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  if (result.status === null) {
    throw new Error(`git merge-file terminated by signal ${result.signal}`);
  }
  // git merge-file 的退出码是冲突数量（0 = 干净，>127 视为错误），不是 0/1 二值。
  if (result.status > 127) {
    throw new Error(
      `git merge-file failed (${result.status}) ours=${ours.length}B base=${base.length}B theirs=${theirs.length}B stderr=${result.stderr || "<empty>"}`,
    );
  }
  return {
    status: result.status === 0 ? "merged-clean" : "conflict",
    conflicts: result.status,
    content: result.stdout,
  };
}

function resolvePath(path) {
  return isAbsolute(path) ? path : join(ROOT, path);
}

export function buildMergePlan(inventory, tempDir) {
  const results = [];
  const outputs = new Map();

  for (const entry of inventory.entries) {
    const {
      upstreamPath,
      productPath,
      status,
      productVsBase,
      baseContent,
      upstreamContent,
      productContent,
    } = entry;
    const mappedUpstream = normalize(applyBrandMap(upstreamContent));

    if (status === "parity") {
      outputs.set(productPath, productContent ?? mappedUpstream);
      results.push({ upstreamPath, productPath, status: "parity" });
      continue;
    }

    if (status === "missing") {
      outputs.set(productPath, mappedUpstream);
      results.push({ upstreamPath, productPath, status: "ported" });
      continue;
    }

    if (status === "patch") {
      if (baseContent === null) {
        results.push({ upstreamPath, productPath, status: "manual-no-base" });
        continue;
      }
      const mappedBase = normalize(applyBrandMap(baseContent));
      if (productVsBase === "base") {
        outputs.set(productPath, mappedUpstream);
        results.push({ upstreamPath, productPath, status: "clean-adopt" });
        continue;
      }
      let merged;
      try {
        merged = mergeThreeWay({
          ours: productContent ?? "",
          base: mappedBase,
          theirs: mappedUpstream,
          tempDir,
        });
      } catch (error) {
        throw new Error(`${upstreamPath}: ${error.message}`);
      }
      if (merged.status === "merged-clean") {
        outputs.set(productPath, merged.content);
      }
      results.push({
        upstreamPath,
        productPath,
        status: merged.status,
        content: merged.content,
      });
      continue;
    }

    results.push({ upstreamPath, productPath, status });
  }

  for (const productPath of inventory.productOnly) {
    const productContent = readProductFile(productPath);
    if (productContent !== null) outputs.set(productPath, productContent);
    results.push({ upstreamPath: productPath, productPath, status: "product-only" });
  }

  return { results, outputs };
}

export function summarizeMerge(results) {
  const summary = {
    total: results.length,
    parity: 0,
    ported: 0,
    cleanAdopt: 0,
    mergedClean: 0,
    conflict: 0,
    manualNoBase: 0,
    productOnly: 0,
  };
  for (const result of results) {
    if (result.status === "parity") summary.parity += 1;
    else if (result.status === "ported") summary.ported += 1;
    else if (result.status === "clean-adopt") summary.cleanAdopt += 1;
    else if (result.status === "merged-clean") summary.mergedClean += 1;
    else if (result.status === "conflict") summary.conflict += 1;
    else if (result.status === "manual-no-base") summary.manualNoBase += 1;
    else if (result.status === "product-only") summary.productOnly += 1;
  }
  return summary;
}

export function renderMergeReport({ summary, results, reportPath, outDir }) {
  const conflicts = results.filter((result) => result.status === "conflict");
  const merged = results.filter((result) => result.status === "merged-clean");
  const cleanAdopt = results.filter((result) => result.status === "clean-adopt");
  const ported = results.filter((result) => result.status === "ported");
  const manual = results.filter((result) => result.status === "manual-no-base");

  const lines = [
    "# 上游协议三方合并 POC（4.0.0）",
    "",
    "> 由 `scripts/upstream-protocol-merge.mjs` 生成，不要手改。",
    "> `merged-clean` 表示 4.0.0 变更可以自动合入产品本地改动；`conflict` 需要人工决策或进入显式 patch 清单。",
    "",
    "## 汇总",
    "",
    "| 结果 | 数量 |",
    "| --- | --- |",
    `| 总文件 | ${summary.total} |`,
    `| parity（无需处理） | ${summary.parity} |`,
    `| ported（上游有、产品缺失，需按产品边界确认） | ${summary.ported} |`,
    `| clean-adopt（产品等于基线，直接采用上游） | ${summary.cleanAdopt} |`,
    `| merged-clean（自动三方合并成功） | ${summary.mergedClean} |`,
    `| conflict（需人工处理） | ${summary.conflict} |`,
    `| manual-no-base（无共同基线，需人工处理） | ${summary.manualNoBase} |`,
    `| product-only | ${summary.productOnly} |`,
    "",
    `输出目录：\`${outDir}\``,
    `报告：\`${reportPath}\``,
    "",
    "## 冲突文件",
    "",
  ];

  if (conflicts.length === 0) {
    lines.push("无。", "");
  } else {
    lines.push(
      "| 上游文件 | 产品路径 |",
      "| --- | --- |",
      ...conflicts.map(
        (result) => `| \`${result.upstreamPath}\` | \`${result.productPath}\` |`,
      ),
      "",
    );
  }

  lines.push("## 无共同基线", "");
  if (manual.length === 0) {
    lines.push("无。", "");
  } else {
    lines.push(
      "| 上游/产品文件 | 产品路径 |",
      "| --- | --- |",
      ...manual.map(
        (result) => `| \`${result.upstreamPath}\` | \`${result.productPath}\` |`,
      ),
      "",
    );
  }

  for (const [title, items] of [
    ["上游有、产品缺失（ported，需确认）", ported],
    ["直接采用上游（clean-adopt）", cleanAdopt],
    ["自动合并（merged-clean）", merged],
  ]) {
    lines.push(`## ${title}`, "");
    if (items.length === 0) {
      lines.push("无。", "");
    } else {
      lines.push(
        "| 上游文件 | 产品路径 |",
        "| --- | --- |",
        ...items.map(
          (result) => `| \`${result.upstreamPath}\` | \`${result.productPath}\` |`,
        ),
        "",
      );
    }
  }

  return lines.join("\n");
}

function parseArgs(argv) {
  const options = {
    base: undefined,
    upstream: undefined,
    outDir: DEFAULT_OUT_DIR,
    report: DEFAULT_REPORT,
    failOnConflict: false,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") options.base = argv[++index];
    else if (arg === "--upstream") options.upstream = argv[++index];
    else if (arg === "--out-dir") options.outDir = argv[++index];
    else if (arg === "--report") options.report = argv[++index];
    else if (arg === "--fail-on-conflict") options.failOnConflict = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "用法: node scripts/upstream-protocol-merge.mjs [--base <ref>] [--upstream <ref>] [--out-dir <dir>] [--report <file>] [--fail-on-conflict] [--dry-run]",
      );
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inventory = buildInventory({
    base: options.base,
    upstream: options.upstream,
    withContents: true,
  });
  const tempDir = mkdtempSync(join(tmpdir(), "kayingcode-protocol-merge-"));
  try {
    const { results, outputs } = buildMergePlan(inventory, tempDir);
    const summary = summarizeMerge(results);
    const outDir = resolvePath(options.outDir);
    const reportPath = resolvePath(options.report);

    if (!options.dryRun) {
      for (const [productPath, content] of outputs) {
        const target = join(outDir, productPath);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content, "utf8");
      }
      for (const result of results) {
        if (result.status !== "conflict") continue;
        const target = join(outDir, "conflicts", result.productPath);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, result.content ?? "", "utf8");
      }
      mkdirSync(dirname(reportPath), { recursive: true });
      writeFileSync(
        reportPath,
        renderMergeReport({ summary, results, reportPath: options.report, outDir: options.outDir }),
        "utf8",
      );
    }

    console.log(
      `protocol merge: total ${summary.total}, parity ${summary.parity}, ported ${summary.ported}, clean-adopt ${summary.cleanAdopt}, merged-clean ${summary.mergedClean}, conflict ${summary.conflict}, manual ${summary.manualNoBase}, product-only ${summary.productOnly}`,
    );
    if (!options.dryRun) {
      console.log(`output: ${outDir}`);
      console.log(`report: ${reportPath}`);
    }
    if (options.failOnConflict && (summary.conflict > 0 || summary.manualNoBase > 0)) {
      process.exitCode = 1;
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
