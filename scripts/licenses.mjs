#!/usr/bin/env node
/* eslint-disable max-lines -- 三方 license 盘点/声明/门禁一体脚本，数据表与校验逻辑集中维护。 */
// 三方 license 盘点/声明/门禁 一体脚本
//
// 用法：
//   node scripts/licenses.mjs notices   生成 THIRD-PARTY-NOTICES.md（精确版本、原始版权和许可文本）
//   node scripts/licenses.mjs check     手动门禁：出现 allowlist 之外或许可未知的包即退出码 1
//
// 数据口径：
// - 实装清单 = 全 workspace node_modules 的递归集合，含嵌套版本与符号链接。
// - 声明生成：third-party-npm.mjs 按生产依赖的精确版本收集真实许可文件。
// - prod 判定按锁文件生产图中的精确版本。
// - 商用/半开放检查作用于全量实装包（prod+dev）
import { generateThirdPartyNotices } from "./generate-third-party-notices.mjs";
import { readVerifiedNotices } from "./third-party-notices.mjs";
import { readFile } from "node:fs/promises";
import {
  readWorkspaceProductionGraph,
  scanInstalledPackages,
  missingProductionPackages,
  productionPackages,
} from "./third-party-npm.mjs";
import {
  classifyLicense,
  decideReviewedLicense,
  verifyLicenseReviewEvidence,
} from "./license-identifiers.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "notices";
if (command === "notices") {
  await generateThirdPartyNotices(ROOT, {
    pruneStaleOverrides: process.argv.includes("--prune-stale-overrides"),
  });
  process.exit(0);
}

// 标识门禁与声明生成共用 workspace 图和递归扫描，不按包名猜测生产范围。
const { required, projects } = await readWorkspaceProductionGraph(ROOT);
const ownNames = new Set(projects.map((project) => project.name));
const installed = new Map();
function normLicense(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(normLicense).join(" OR ");
  return value?.type?.trim() || "(missing)";
}
const scanned = await scanInstalledPackages(ROOT, projects);
missingProductionPackages(required, scanned);
const reviews = JSON.parse(
  await readFile(path.join(ROOT, "third-party/license-reviews.json"), "utf8"),
);
const reviewByKey = new Map(reviews.map((review) => [review.package, review]));
if (reviewByKey.size !== reviews.length) throw new Error("Duplicate license review package");
const owners = new Map();
for (const project of projects) {
  for (const key of productionPackages([project]).keys()) {
    if (!required.has(key)) continue;
    const names = owners.get(key) ?? new Set();
    names.add(project.name);
    owners.set(key, names);
  }
}
const rootPackage = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
for (const [key, { pkg, directory }] of scanned) {
  if (ownNames.has(pkg.name)) continue;
  const review = reviewByKey.get(key);
  const evidenceVerified = await verifyLicenseReviewEvidence(ROOT, directory, review);
  const license = normLicense(pkg.license ?? pkg.licenses);
  installed.set(key, {
    name: pkg.name,
    version: pkg.version,
    license,
    isProd: required.has(key),
    owners: [...(owners.get(key) ?? [])],
    evidenceVerified,
    patched: Boolean(rootPackage.pnpm?.patchedDependencies?.[key]),
    bucket: classifyLicense(license),
    review,
  });
}

if (command === "check") {
  const bad = [];
  for (const r of installed.values()) {
    const decision = decideReviewedLicense(r, r.review);
    if (decision.allowed) continue;
    bad.push(r);
  }
  if (bad.length) {
    console.error(`✗ license 检查失败：${bad.length} 个包超出 allowlist：`);
    for (const r of bad.sort((a, b) => a.name.localeCompare(b.name)))
      console.error(`  [${r.bucket}] ${r.name}@${r.version} → ${r.license}`);
    console.error(
      "\n处置：替换依赖，或在 third-party/license-reviews.json 登记版本、原文及使用边界复核，不修改通用许可规则。",
    );
    process.exit(1);
  }
  await readVerifiedNotices(ROOT, { requireComplete: process.argv.includes("--strict") });
  const reviewRequired =
    JSON.parse(await readFile(path.join(ROOT, "third-party/inventory.json"), "utf8"))
      .reviewRequired ?? [];
  if (reviewRequired.length)
    console.warn(
      `待补齐/核验材料 ${reviewRequired.length} 项；发布前运行 node scripts/licenses.mjs check --strict，不得将基础检查通过视为合规完成。`,
    );
  const n = installed.size;
  console.log(
    `✓ 许可标识与声明新鲜度检查通过：${n} 个实装包（精确版本证据与用途复核 ${[...installed.values()].filter((r) => decideReviewedLicense(r, r.review).reason).length} 项）；材料限制见 third-party/README.md`,
  );
} else {
  console.error("用法: node scripts/licenses.mjs [notices|check]");
  process.exit(2);
}
