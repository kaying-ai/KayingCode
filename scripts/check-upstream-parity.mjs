#!/usr/bin/env node
/**
 * 上游协议 parity 门禁（P0-5）。
 *
 * 以 scripts/spec/upstream-protocol-4-0-0-expected.json 为基线：
 * - 不允许出现新的 missing / product-only 文件
 * - 允许清单里的 missing 一旦补入，需要同步更新基线
 * - parity 不得下降，patch 不得增加
 * - 上游文件数变化说明 upstream 已前进，需要重新评估
 *
 * 用法：
 *   node scripts/check-upstream-parity.mjs
 *   node scripts/check-upstream-parity.mjs --upstream upstream/main
 */
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildInventory } from "./upstream-protocol-inventory.mjs";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_EXPECTED = "scripts/spec/upstream-protocol-4-0-0-expected.json";

function resolvePath(path) {
  return isAbsolute(path) ? path : join(ROOT, path);
}

export function evaluateParity(inventory, expected) {
  const errors = [];
  const missing = inventory.entries.filter((entry) => entry.status === "missing");
  const allowedMissing = new Set(expected.allowedMissing ?? []);
  const actualMissing = new Set(missing.map((entry) => entry.upstreamPath));
  const allowedProductOnly = new Set(expected.allowedProductOnly ?? []);
  const actualProductOnly = new Set(inventory.productOnly);

  for (const path of actualMissing) {
    if (!allowedMissing.has(path)) errors.push(`新增 missing: ${path}`);
  }
  for (const path of allowedMissing) {
    if (!actualMissing.has(path)) errors.push(`allowlist 已过期（文件已补入）: ${path}`);
  }
  for (const path of actualProductOnly) {
    if (!allowedProductOnly.has(path)) errors.push(`新增 product-only: ${path}`);
  }
  for (const path of allowedProductOnly) {
    if (!actualProductOnly.has(path)) errors.push(`product-only 基线已过期: ${path}`);
  }

  if (inventory.summary.upstreamFiles !== expected.upstreamFiles) {
    errors.push(
      `上游文件数变化: ${inventory.summary.upstreamFiles}，基线 ${expected.upstreamFiles}；请重新评估并更新基线`,
    );
  }
  if (inventory.summary.parity < expected.minParity) {
    errors.push(
      `parity 下降: ${inventory.summary.parity}，基线 ${expected.minParity}`,
    );
  }
  if (inventory.summary.patch > expected.maxPatch) {
    errors.push(`patch 增加: ${inventory.summary.patch}，基线 ${expected.maxPatch}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      upstreamFiles: inventory.summary.upstreamFiles,
      parity: inventory.summary.parity,
      patch: inventory.summary.patch,
      missing: inventory.summary.missing,
      productOnly: inventory.summary.productOnly,
    },
  };
}

function parseArgs(argv) {
  const options = { expected: DEFAULT_EXPECTED, upstream: undefined, base: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--expected") options.expected = argv[++index];
    else if (arg === "--upstream") options.upstream = argv[++index];
    else if (arg === "--base") options.base = argv[++index];
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "用法: node scripts/check-upstream-parity.mjs [--expected <file>] [--upstream <ref>] [--base <ref>]",
      );
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const expected = JSON.parse(readFileSync(resolvePath(options.expected), "utf8"));
  const inventory = buildInventory({
    base: options.base ?? expected.base,
    upstream: options.upstream ?? expected.upstream,
  });
  const result = evaluateParity(inventory, expected);

  console.log(
    `upstream parity: files ${result.summary.upstreamFiles}, parity ${result.summary.parity}, patch ${result.summary.patch}, missing ${result.summary.missing}, product-only ${result.summary.productOnly}`,
  );
  if (!result.ok) {
    for (const error of result.errors) console.error(`- ${error}`);
    console.error("upstream parity check failed");
    process.exit(1);
  }
  console.log("upstream parity: OK");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
