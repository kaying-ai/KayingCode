#!/usr/bin/env node
/**
 * 集成前检查 workstream 分支的范围与卫生。
 *
 * 用法：
 *   node scripts/kaying/check-branch-scope.mjs project-sidebar --allow packages/ui --allow packages/ui/spec
 *
 * 检查项：
 * - 与 origin/main 的 merge-base 之后的改动文件
 * - 禁止 pnpm-lock.yaml、dist/out/node_modules、日志等产物
 * - 可选 --allow 前缀，报告越界路径
 * - 冲突标记（<<<<<<< / ||||||| / >>>>>>>）
 */
import { execFileSync } from "node:child_process";

const [branch, ...rest] = process.argv.slice(2);
if (!branch) {
  console.error(
    "usage: node scripts/kaying/check-branch-scope.mjs <branch> [--allow <path-prefix>]... [--base <ref>]",
  );
  process.exit(2);
}

const allow = [];
let base = process.env.INTEGRATION_REF || "origin/main";
for (let index = 0; index < rest.length; index += 1) {
  const value = rest[index];
  if (value === "--allow") {
    allow.push(rest[++index]);
  } else if (value === "--base") {
    base = rest[++index];
  } else {
    console.error(`unknown argument: ${value}`);
    process.exit(2);
  }
}

function git(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...options }).trim();
}

const mergeBase = git(["merge-base", base, branch]);
const files = git(["diff", "--name-only", mergeBase, branch]).split("\n").filter(Boolean);

const forbidden = files.filter(
  (file) =>
    file === "pnpm-lock.yaml" ||
    /(^|\/)(dist|out|node_modules)\//u.test(file) ||
    /\.(log|tmp)$/u.test(file),
);

const outside = allow.length
  ? files.filter(
      (file) =>
        !allow.some(
          (prefix) => file === prefix || file.startsWith(`${prefix.replace(/\/$/u, "")}/`),
        ),
    )
  : [];

const withMarkers = [];
for (const file of files) {
  let content;
  try {
    content = execFileSync("git", ["show", `${branch}:${file}`], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    continue;
  }
  if (content.includes("\0")) continue;
  if (/^(<<<<<<< |\|\|\|\|\|\|\| |>>>>>>> )/mu.test(content)) {
    withMarkers.push(file);
  }
}

console.log(`branch: ${branch}`);
console.log(`base:   ${base} (${mergeBase.slice(0, 12)})`);
console.log(`files:  ${files.length}`);
if (allow.length) console.log(`allow:  ${allow.join(", ")}`);
if (forbidden.length) {
  console.error("forbidden artifacts:");
  for (const file of forbidden) console.error(`  - ${file}`);
}
if (outside.length) {
  console.error("outside owned paths:");
  for (const file of outside) console.error(`  - ${file}`);
}
if (withMarkers.length) {
  console.error("conflict markers:");
  for (const file of withMarkers) console.error(`  - ${file}`);
}

const failed = forbidden.length + outside.length + withMarkers.length > 0;
console.log(failed ? "RESULT: FAIL" : "RESULT: OK");
process.exit(failed ? 1 : 0);
