#!/usr/bin/env node
/**
 * 上游架构策略合并 POC（P0-3）。
 *
 * 合并规则：
 * - 产品已有模块保留（产品更严格的 global 也保留）。
 * - 上游模块 roots 全部存在的，按产品路径映射后纳入。
 * - 上游模块 roots 部分/全部缺失的，记为 deferred，不纳入候选。
 * - 上游 requires/publicEntrypoints 引用缺失模块或文件时剔除并记录。
 * - 上游 exceptions 中路径存在的保留。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_UPSTREAM = "upstream/main";
const DEFAULT_UPSTREAM_POLICY = "architecture-policy.yaml";
const DEFAULT_OUT = "scripts/spec/upstream-architecture-policy-4-0-0.candidate.yaml";
const DEFAULT_REPORT = "scripts/spec/upstream-architecture-policy-4-0-0-merge-report.md";

export function mapPolicyPath(path) {
  return path
    .split("/")
    .map((segment) => (segment.startsWith("zcode-protocol") ? `kayingcode-${segment.slice(6)}` : segment))
    .join("/");
}

function rootExists(path) {
  return existsSync(join(ROOT, path));
}

function moduleStatus(module) {
  const roots = (module.roots ?? []).map((root) => {
    const mapped = mapPolicyPath(root);
    return { mapped, exists: rootExists(mapped) };
  });
  const existing = roots.filter((root) => root.exists).length;
  return {
    status:
      existing === roots.length ? "all-roots-exist" : existing === 0 ? "all-missing" : "partial",
    roots,
  };
}

function cloneModule(module) {
  return {
    ...module,
    roots: (module.roots ?? []).map(mapPolicyPath),
    requires: [...(module.requires ?? [])],
    publicEntrypoints: (module.publicEntrypoints ?? []).map(mapPolicyPath),
  };
}

export function mergePolicies({ upstreamPolicy, productPolicy, manageAdded = false }) {
  const productById = new Map(productPolicy.modules.map((module) => [module.id, module]));
  const modules = productPolicy.modules.map((module) => ({ ...module }));
  const added = [];
  const deferred = [];
  const overlap = [];

  for (const upstreamModule of upstreamPolicy.modules) {
    if (productById.has(upstreamModule.id)) {
      overlap.push(upstreamModule.id);
      continue;
    }
    const status = moduleStatus(upstreamModule);
    if (status.status !== "all-roots-exist") {
      deferred.push({ id: upstreamModule.id, status: status.status, roots: status.roots });
      continue;
    }
    const module = cloneModule(upstreamModule);
    // 分阶段迁移：新增模块先登记边界，默认不立即启用 managed 检查；
    // 对应阶段把代码迁到上游结构并清零 violations 后再逐个打开。
    module.managed = manageAdded ? upstreamModule.managed === true : false;
    modules.push(module);
    added.push(module.id);
  }

  const ids = new Set(modules.map((module) => module.id));
  const removedRequires = [];
  const removedEntrypoints = [];
  for (const module of modules) {
    module.requires = module.requires ?? [];
    const requires = module.requires.filter((dependency) => ids.has(dependency));
    for (const dependency of module.requires) {
      if (!ids.has(dependency)) removedRequires.push({ module: module.id, dependency });
    }
    module.requires = requires;

    const entrypoints = (module.publicEntrypoints ?? []).filter((entry) => rootExists(entry));
    for (const entry of module.publicEntrypoints ?? []) {
      if (!entrypoints.includes(entry)) removedEntrypoints.push({ module: module.id, entry });
    }
    module.publicEntrypoints = entrypoints;
  }

  const exceptions = [];
  const removedExceptions = [];
  for (const exception of upstreamPolicy.exceptions ?? []) {
    const paths = (exception.paths ?? []).map(mapPolicyPath);
    if (paths.length === 0 || paths.some((path) => rootExists(path))) {
      exceptions.push({ ...exception, paths });
    } else {
      removedExceptions.push({ ...exception, paths });
    }
  }

  return {
    policy: {
      version: 1,
      modules,
      // 上游优先：采用上游阈值与新文件基线字段；产品更严格的阈值可作为后续独立决策。
      global: upstreamPolicy.global ?? productPolicy.global,
      exceptions,
    },
    added,
    deferred,
    overlap,
    removedRequires,
    removedEntrypoints,
    removedExceptions,
  };
}

function renderReport(result) {
  const { added, deferred, overlap, removedRequires, removedEntrypoints, removedExceptions, policy } =
    result;
  const lines = [
    "# 上游架构策略合并报告（4.0.0）",
    "",
    "> 由 `scripts/upstream-architecture-policy-merge.mjs` 生成，不要手改。",
    "> 新增上游模块默认 `managed: false`，先登记边界；各阶段切到上游结构并清零 violations 后再逐个启用。`--manage-added` 可直接生成启用版。",
    "",
    "## 汇总",
    "",
    "| 项目 | 数量 |",
    "| --- | --- |",
    `| 候选策略模块 | ${policy.modules.length} |`,
    `| 纳入的上游模块 | ${added.length} |`,
    `| 延后的上游模块（roots 缺失） | ${deferred.length} |`,
    `| 与产品同 ID（产品优先） | ${overlap.length} |`,
    `| 剔除的 requires | ${removedRequires.length} |`,
    `| 剔除的 publicEntrypoints | ${removedEntrypoints.length} |`,
    `| 剔除的 exceptions | ${removedExceptions.length} |`,
    "",
    "## 纳入的上游模块",
    "",
    added.length === 0 ? "无。" : added.map((id) => `- \`${id}\``).join("\n"),
    "",
    "## 延后的上游模块",
    "",
  ];

  if (deferred.length === 0) {
    lines.push("无。", "");
  } else {
    lines.push(
      "| 模块 | 状态 | 缺失 roots |",
      "| --- | --- | --- |",
      ...deferred.map((module) => {
        const missing = module.roots
          .filter((root) => !root.exists)
          .map((root) => `\`${root.mapped}\``)
          .join("<br>");
        return `| \`${module.id}\` | ${module.status} | ${missing} |`;
      }),
      "",
    );
  }

  for (const [title, items, format] of [
    ["剔除的 requires", removedRequires, (item) => `- \`${item.module}\` → \`${item.dependency}\``],
    ["剔除的 publicEntrypoints", removedEntrypoints, (item) => `- \`${item.entry}\` (${item.module})`],
  ]) {
    lines.push(`## ${title}`, "");
    lines.push(items.length === 0 ? "无。" : items.map(format).join("\n"), "");
  }

  return lines.join("\n");
}

function loadPolicy(source, label) {
  const raw = parseYaml(source);
  if (!raw || raw.version !== 1 || !Array.isArray(raw.modules)) {
    throw new Error(`${label} 不是合法的 architecture-policy.yaml`);
  }
  return raw;
}

function resolvePath(path) {
  return isAbsolute(path) ? path : join(ROOT, path);
}

function parseArgs(argv) {
  const options = {
    upstream: DEFAULT_UPSTREAM,
    upstreamPolicy: DEFAULT_UPSTREAM_POLICY,
    out: DEFAULT_OUT,
    report: DEFAULT_REPORT,
    manageAdded: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--upstream") options.upstream = argv[++index];
    else if (arg === "--upstream-policy") options.upstreamPolicy = argv[++index];
    else if (arg === "--manage-added") options.manageAdded = true;
    else if (arg === "--out") options.out = argv[++index];
    else if (arg === "--report") options.report = argv[++index];
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "用法: node scripts/upstream-architecture-policy-merge.mjs [--upstream <ref>] [--upstream-policy <path>] [--out <file>] [--report <file>]",
      );
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const upstreamPolicy = loadPolicy(
    execFileSync("git", ["show", `${options.upstream}:${options.upstreamPolicy}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }),
    "上游策略",
  );
  const productPolicy = loadPolicy(
    readFileSync(join(ROOT, "architecture-policy.yaml"), "utf8"),
    "产品策略",
  );
  const result = mergePolicies({
    upstreamPolicy,
    productPolicy,
    manageAdded: options.manageAdded,
  });
  const outPath = resolvePath(options.out);
  writeFileSync(outPath, stringifyYaml(result.policy), "utf8");
  writeFileSync(resolvePath(options.report), renderReport(result), "utf8");
  console.log(
    `architecture policy merge: modules ${result.policy.modules.length}, added ${result.added.length}, deferred ${result.deferred.length}, overlap ${result.overlap.length}`,
  );
  console.log(`written: ${options.out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
