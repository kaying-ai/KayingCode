#!/usr/bin/env node
/**
 * 上游架构策略盘点（P0-3 前置）。
 *
 * 读取上游 architecture-policy.yaml，按产品路径检查模块 roots 是否存在：
 * - all-roots-exist：可直接纳入合并策略
 * - partial：部分 roots 缺失，需要逐项确认
 * - all-missing：上游模块在产品中已整体退役，应为显式例外
 * - product-only：产品策略额外登记的模块
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_UPSTREAM = "upstream/main";
const DEFAULT_OUT = "scripts/spec/upstream-architecture-policy-4-0-0-inventory.md";

/** 只映射协议目录段；产品保留 apps/zcode-cli、packages/zcode-* 等目录名。 */
export function mapPolicyPath(path) {
  return path
    .split("/")
    .map((segment) => (segment.startsWith("zcode-protocol") ? `kayingcode-${segment.slice(6)}` : segment))
    .join("/");
}

export function classifyPolicyModule(module, { rootExists }) {
  const roots = (module.roots ?? []).map((root) => {
    const mapped = mapPolicyPath(root);
    return { root, mapped, exists: rootExists(mapped) };
  });
  const existing = roots.filter((root) => root.exists).length;
  const status =
    existing === roots.length ? "all-roots-exist" : existing === 0 ? "all-missing" : "partial";
  return { status, roots };
}

function loadPolicy(source, label) {
  const raw = parseYaml(source);
  if (!raw || raw.version !== 1 || !Array.isArray(raw.modules)) {
    throw new Error(`${label} 不是合法的 architecture-policy.yaml`);
  }
  return raw;
}

function gitShow(ref, path) {
  return execFileSync("git", ["show", `${ref}:${path}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function rootExists(path) {
  return existsSync(join(ROOT, path));
}

export function buildInventory({ upstream = DEFAULT_UPSTREAM } = {}) {
  const upstreamPolicy = loadPolicy(gitShow(upstream, "architecture-policy.yaml"), "上游策略");
  const productPolicy = loadPolicy(readFileSync(join(ROOT, "architecture-policy.yaml"), "utf8"), "产品策略");
  const productById = new Map(productPolicy.modules.map((module) => [module.id, module]));

  const modules = upstreamPolicy.modules.map((module) => {
    const classification = classifyPolicyModule(module, { rootExists });
    const productModule = productById.get(module.id) ?? null;
    return {
      id: module.id,
      owner: module.owner ?? null,
      managed: module.managed === true,
      ...classification,
      productOverlap: productModule
        ? {
            managed: productModule.managed === true,
            owner: productModule.owner ?? null,
            roots: productModule.roots ?? [],
          }
        : null,
    };
  });

  const upstreamIds = new Set(modules.map((module) => module.id));
  const productOnly = productPolicy.modules
    .filter((module) => !upstreamIds.has(module.id))
    .map((module) => ({
      id: module.id,
      managed: module.managed === true,
      owner: module.owner ?? null,
      roots: module.roots ?? [],
    }));

  const summary = {
    upstreamModules: modules.length,
    allRootsExist: modules.filter((module) => module.status === "all-roots-exist").length,
    partial: modules.filter((module) => module.status === "partial").length,
    allMissing: modules.filter((module) => module.status === "all-missing").length,
    productModules: productPolicy.modules.length,
    productOnly: productOnly.length,
    overlap: modules.filter((module) => module.productOverlap).length,
  };

  return {
    upstream,
    generatedAt: new Date().toISOString(),
    summary,
    modules,
    productOnly,
    upstreamGlobal: upstreamPolicy.global ?? {},
    productGlobal: productPolicy.global ?? {},
    upstreamExceptions: upstreamPolicy.exceptions ?? [],
    productExceptions: productPolicy.exceptions ?? [],
  };
}

function renderMarkdown(inventory) {
  const { summary, modules } = inventory;
  const missing = modules.filter((module) => module.status !== "all-roots-exist");
  const overlaps = modules.filter((module) => module.productOverlap);

  const lines = [
    "# 上游架构策略盘点（4.0.0）",
    "",
    `生成时间：${inventory.generatedAt}`,
    `上游：\`${inventory.upstream}\``,
    "",
    "> 由 `scripts/upstream-architecture-policy-inventory.mjs` 生成，不要手改。",
    "",
    "## 汇总",
    "",
    "| 项目 | 数量 |",
    "| --- | --- |",
    `| 上游模块 | ${summary.upstreamModules} |`,
    `| roots 全部存在 | ${summary.allRootsExist} |`,
    `| 部分 roots 缺失 | ${summary.partial} |`,
    `| roots 全部缺失（候选例外） | ${summary.allMissing} |`,
    `| 产品模块 | ${summary.productModules} |`,
    `| 产品独有模块 | ${summary.productOnly} |`,
    `| 与产品同 ID | ${summary.overlap} |`,
    "",
    "## roots 缺失的模块",
    "",
  ];

  if (missing.length === 0) {
    lines.push("无。", "");
  } else {
    lines.push(
      "| 模块 | 状态 | 缺失 roots |",
      "| --- | --- | --- |",
      ...missing.map((module) => {
        const missingRoots = module.roots
          .filter((root) => !root.exists)
          .map((root) => `\`${root.mapped}\``)
          .join("<br>");
        return `| \`${module.id}\` | ${module.status} | ${missingRoots} |`;
      }),
      "",
    );
  }

  lines.push("## 与产品同 ID 的模块", "");
  if (overlaps.length === 0) {
    lines.push("无。", "");
  } else {
    lines.push(
      "| 模块 | 上游 managed | 产品 managed | 上游 owner | 产品 owner |",
      "| --- | --- | --- | --- | --- |",
      ...overlaps.map((module) => {
        const product = module.productOverlap;
        return `| \`${module.id}\` | ${module.managed} | ${product.managed} | ${module.owner ?? "—"} | ${product.owner ?? "—"} |`;
      }),
      "",
    );
  }

  lines.push("## 产品独有模块", "");
  if (inventory.productOnly.length === 0) {
    lines.push("无。", "");
  } else {
    lines.push(
      "| 模块 | managed | owner | roots |",
      "| --- | --- | --- | --- |",
      ...inventory.productOnly.map(
        (module) =>
          `| \`${module.id}\` | ${module.managed} | ${module.owner ?? "—"} | ${module.roots.map((root) => `\`${root}\``).join("<br>")} |`,
      ),
      "",
    );
  }

  lines.push("## global 差异", "");
  lines.push(
    "| 字段 | 上游 | 产品 |",
    "| --- | --- | --- |",
    ...Object.keys({ ...inventory.upstreamGlobal, ...inventory.productGlobal }).map(
      (key) =>
        `| \`${key}\` | ${JSON.stringify(inventory.upstreamGlobal[key]) ?? "—"} | ${JSON.stringify(inventory.productGlobal[key]) ?? "—"} |`,
    ),
    "",
  );

  return lines.join("\n");
}

function parseArgs(argv) {
  const options = { upstream: DEFAULT_UPSTREAM, out: DEFAULT_OUT, jsonOut: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--upstream") options.upstream = argv[++index];
    else if (arg === "--out") options.out = argv[++index];
    else if (arg === "--json-out") options.jsonOut = argv[++index];
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "用法: node scripts/upstream-architecture-policy-inventory.mjs [--upstream <ref>] [--out <file>] [--json-out <file>]",
      );
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

function resolvePath(path) {
  return isAbsolute(path) ? path : join(ROOT, path);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inventory = buildInventory(options);
  const outPath = resolvePath(options.out);
  writeFileSync(outPath, renderMarkdown(inventory), "utf8");
  if (options.jsonOut) {
    writeFileSync(resolvePath(options.jsonOut), `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  }
  const { summary } = inventory;
  console.log(
    `architecture policy inventory: upstream ${summary.upstreamModules}, existing ${summary.allRootsExist}, partial ${summary.partial}, missing ${summary.allMissing}, product-only ${summary.productOnly}`,
  );
  console.log(`written: ${options.out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
