#!/usr/bin/env node
/**
 * KayingCode 机械改名工具（P3）。
 * 仅做计划 §3 权威映射表中的品牌替换；跳过 third-party / lockfile / 本文档。
 *
 * 用法：
 *   node scripts/rename-kayingcode.mjs --dry-run
 *   node scripts/rename-kayingcode.mjs --apply
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "third-party",
  "mock-cdn",
  ".turbo",
]);
const SKIP_FILES = new Set(["THIRD-PARTY-NOTICES.md", "pnpm-lock.yaml", "rename-kayingcode.mjs"]);
const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".css",
  ".html",
  ".txt",
  ".example",
  ".toml",
  ".sh",
]);

/** 计划 §3 权威映射；顺序敏感。 */
const REPLACEMENTS = [
  // 特例：CUA 包名不走机械双 kayingcode
  [/@zcode\//g, "@kayingcode/"],
  [/ZCode/g, "KayingCode"],
  // zcode 不会命中 kayingcode（无 z 子串），可安全全局替换
  [/zcode/g, "kayingcode"],
  [/ZCODE_/g, "KAYINGCODE_"],
  [/\.zcode/g, ".kayingcode"],
  [/dev\.zcode/g, "dev.kayingcode"],
  [/com\.zhipu\.zcode/g, "dev.kayingcode"],
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (st.isFile()) yield full;
  }
}

function shouldProcess(path) {
  const base = path.split("/").pop() ?? path;
  if (SKIP_FILES.has(base)) return false;
  if (path.includes("/third-party/")) return false;
  return TEXT_EXT.has(extname(path)) || base === ".env.example";
}

const apply = process.argv.includes("--apply");
let changed = 0;
for (const file of walk(ROOT)) {
  if (!shouldProcess(file)) continue;
  const before = readFileSync(file, "utf8");
  let after = before;
  for (const [pattern, to] of REPLACEMENTS) {
    after = after.replace(pattern, to);
  }
  if (after === before) continue;
  changed += 1;
  if (apply) writeFileSync(file, after);
  else console.log(`would change: ${file}`);
}

console.log(`${apply ? "applied" : "dry-run"}: ${changed} files`);
if (!apply) {
  console.log("Re-run with --apply to write changes.");
}
