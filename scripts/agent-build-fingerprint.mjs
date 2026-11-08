// Desktop Agent 构建输入指纹：供 build-desktop-agent-cli.mjs 在「源码未变」时跳过全量重建。
//
// 背景：dev:desktop 每次启动都会串行 tsc 全量构建 9 个 workspace 包 + 3 个插件 + esbuild，
// 实测约 23s，而日常开发大多并未改动 agent 侧代码。用内容指纹比对 stamp，未变则直接复用
// 已 stage 的 bundled-agents 产物，把「只启动 App」的路径压到亚秒级。
//
// 指纹输入与根 turbo.json 中 build:desktop-agent 的 inputs 对齐，
// 并补上 turbo 路径目前不覆盖的 3 个插件 runtime 及其构建脚本。任何会进入
// kayingcode.cjs 或插件 server.js 的源/配置变更都必须落在这些路径里。
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

/** 相对仓库根的输入根：目录递归收集，文件直接收录。 */
const INPUT_ROOTS = [
  // agent workspace：会被 tsc 编译进 dist，再被 esbuild 打进 kayingcode.cjs
  "apps/zcode-cli/packages/shared-types",
  "apps/zcode-cli/packages/contracts",
  "apps/zcode-cli/packages/dynamic-workflow",
  "apps/zcode-cli/packages/dynamic-workflow-runtime",
  "apps/zcode-cli/packages/core",
  "apps/zcode-cli/packages/adapters",
  "apps/zcode-cli/packages/i18n",
  "apps/zcode-cli/packages/telemetry",
  "apps/zcode-cli/packages/bootstrap",
  "apps/zcode-cli/packages/cli",
  // 独立 MCP plugin runtime（dev 必需，turbo build:desktop-agent 不覆盖）
  "apps/zcode-cli/packages",
  "apps/zcode-cli/packages/node-repl-host",
  // root workspace 被 alias 内联进 agent bundle 的包
  "packages/shared",
  "packages/provider",
  "packages/provider-node",
  "packages/model-option-map",
  // 构建期配置与脚本
  "config/provider",
  "config/official-plugins.json",
  ".oxfmtrc.json",
  "scripts/official-plugin-catalog.mjs",
  "scripts/generate-official-plugin-catalog.mjs",
  "scripts/builtin-provider-config.mjs",
  "scripts/load-endpoint-env.mjs",
  "scripts/build-desktop-agent-cli.mjs",
  "scripts/agent-build-fingerprint.mjs",
  "scripts/stage-agent-bundle.mjs",
  "packages/desktop/scripts/stage-agent-bundle.mjs",
  "scripts/third-party-notices.mjs",
  "scripts/native-search-tools-config.mjs",
  // 版本 / 依赖图 / 环境
  "package.json",
  "apps/zcode-cli/packages/cli/package.json",
  "pnpm-lock.yaml",
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.development.local",
];

const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "dist-types",
  "target",
  ".turbo",
  ".git",
  "bin",
  "coverage",
]);

const IGNORED_FILE_SUFFIXES = [".tsbuildinfo", ".map", ".log"];

function isIgnoredFile(fileName) {
  return IGNORED_FILE_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

function walkFiles(rootAbs, collected) {
  let stats;
  try {
    stats = statSync(rootAbs);
  } catch {
    return;
  }

  if (stats.isFile()) {
    collected.push(rootAbs);
    return;
  }
  if (!stats.isDirectory()) {
    return;
  }

  let entries;
  try {
    entries = readdirSync(rootAbs, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      if (IGNORED_DIR_NAMES.has(entry.name)) {
        continue;
      }
      walkFiles(resolve(rootAbs, entry.name), collected);
      continue;
    }
    if (entry.isFile() && !isIgnoredFile(entry.name)) {
      collected.push(resolve(rootAbs, entry.name));
    }
  }
}

/**
 * 收集全部参与 desktop agent 构建的源文件绝对路径（已排序）。
 * 只收录存在的路径；.env 等可选文件缺失时安静跳过。
 */
export function collectAgentBuildInputFiles(repoRoot) {
  const collected = [];
  for (const root of INPUT_ROOTS) {
    walkFiles(resolve(repoRoot, root), collected);
  }
  collected.sort();
  return collected;
}

/**
 * 计算输入指纹。对每个文件取 relpath + size + mtimeMs，再整体 sha256。
 * 用元数据而非内容哈希：本地 dev 更关心「是否变过」，且约 2k 文件内容哈希
 * 仍要读盘；元数据哈希亚 100ms，且与 make/turbo 的 mtime 语义一致。
 * 误判方向是「多构建一次」，不会漏掉真实变更导致陈旧产物。
 */
export function computeAgentBuildFingerprint(repoRoot) {
  const files = collectAgentBuildInputFiles(repoRoot);
  const hash = createHash("sha256");
  for (const absPath of files) {
    const relPath = relative(repoRoot, absPath).replaceAll("\\", "/");
    let stats;
    try {
      stats = statSync(absPath);
    } catch {
      continue;
    }
    hash.update(`${relPath}\0${stats.size}\0${stats.mtimeMs}\n`);
  }
  // 文件列表本身也进指纹：新增/删除文件即使 mtime 撞车也能被发现。
  hash.update(`count:${files.length}`);
  return hash.digest("hex");
}

export function resolveAgentBuildStampPath(repoRoot, platformKey) {
  return resolve(
    repoRoot,
    "packages/desktop/bundled-agents",
    platformKey,
    ".agent-build-stamp.json",
  );
}

export function readAgentBuildStamp(stampPath) {
  try {
    const parsed = JSON.parse(readFileSync(stampPath, "utf8"));
    if (typeof parsed?.fingerprint !== "string" || parsed.fingerprint.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeAgentBuildStamp(stampPath, fingerprint, extra = {}) {
  const payload = {
    fingerprint,
    builtAt: new Date().toISOString(),
    ...extra,
  };
  // 与 stage-agent-bundle 同级原子写语义：先写临时文件再 rename，避免中断留下半截 JSON。
  mkdirSync(dirname(stampPath), { recursive: true });
  const tmpPath = `${stampPath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  renameSync(tmpPath, stampPath);
  return payload;
}
