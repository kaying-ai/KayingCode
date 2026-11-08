/**
 * 下载并校验 TapTap vendor 运行时（@taptap/maker + @taptap/instant-games-open-mcp）。
 * 以 vendor/instant-games-open-mcp/upstream-lock.json 为唯一版本源；
 * 拉取 tarball 后校验 npm integrity，抽出 dist 文件，打上 Kaying push 策略补丁，
 * 并回写逐文件 SHA-512，供 verify-assets.mjs 复核。
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = join(packageRoot, "vendor", "instant-games-open-mcp");
const vendorDistDir = join(vendorRoot, "dist");
const lockPath = join(vendorRoot, "upstream-lock.json");
const downloadTimeoutMs = 30_000;
const makerPushPolicyMarker = "KayingCode local-authoritative history policy";

function readLock() {
  if (!existsSync(lockPath)) {
    throw new Error(`TapTap upstream lock is missing: ${lockPath}`);
  }
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  if (lock.version !== 1 || !Array.isArray(lock.packages) || lock.packages.length === 0) {
    throw new Error(`Invalid TapTap upstream lock: ${lockPath}`);
  }
  return lock;
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(downloadTimeoutMs) });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw new Error(`Failed to download ${url} after 3 attempts: ${String(lastError)}`);
}

function verifyIntegrity(bytes, integrity) {
  const [algorithm, expected] = integrity.split("-", 2);
  if (algorithm !== "sha512" || !expected) {
    throw new Error(`Unsupported TapTap upstream integrity: ${integrity}`);
  }
  const actual = createHash("sha512").update(bytes).digest("base64");
  if (actual !== expected) {
    throw new Error(`TapTap upstream integrity mismatch: expected ${expected}, got ${actual}`);
  }
}

function sha512Hex(bytes) {
  return createHash("sha512").update(bytes).digest("hex");
}

/**
 * Maker 远端拒绝 non-fast-forward（含 --force）。TapTap Maker 工程在本插件里是
 * 单所有者工作区：本地文件快照（含删除与资源变更）权威。远端历史推进时只用 ours
 * 合并对齐历史，绝不让远端内容覆盖本地快照。
 */
async function patchMakerPushPolicy(bundlePath) {
  let source = await readFile(bundlePath, "utf8");
  if (source.includes(makerPushPolicyMarker)) return;
  const requiredReplace = (text, pattern, replacement, label) => {
    if (!pattern.test(text)) throw new Error(`Maker 0.0.38 patch could not find ${label}`);
    return text.replace(pattern, replacement);
  };
  const pushFunction =
    /\nasync function pushMakerProject\(options\d*\) \{[\s\S]*?(?=\n(?:async )?function \w+\()/;
  if (!pushFunction.test(source)) throw new Error("Maker push function missing");
  source = source.replace(pushFunction, (body) => {
    // 0.0.38 改用 gitStepWithTransientRetry 并增加云端修复；只移除会引入远端文件的路径。
    body = requiredReplace(
      body,
      /\n {2}const remoteSyncStatus = await inspectMakerRemoteSyncStatus\(cwd\);[\s\S]*?\n {2}const statusBefore/,
      `\n  // ${makerPushPolicyMarker}: local plugin files remain authoritative.\n  const statusBefore`,
      "remote sync preflight",
    );
    body = requiredReplace(
      body,
      /\n {2}if \(remoteSyncStatus.status === "diverged"\) \{[\s\S]*?\n {2}\}/,
      "",
      "diverged merge",
    );
    body = requiredReplace(
      body,
      /return gitStepWithTransientRetry\(\["push", "origin", `HEAD:\$\{branch\}`\], \{\n {6}cwd,\n {6}stage: "push",\n {6}onProgress: (options\d*)\.onProgress\n {4}\}\);/,
      (_match, optionsName) =>
        `return pushMakerProjectWithHistoryFallback(branch, cwd, ${optionsName}.onProgress);`,
      "push call",
    );
    body = requiredReplace(
      body,
      / {4}const mergeFailure = await mergeMakerRemote\(cwd, branch, (options\d*)\.onProgress\);\n {4}if \(mergeFailure\) return failed\(mergeFailure, cloudRepair\);/,
      (_match, optionsName) =>
        `    try {\n      await mergeMakerProjectHistoryPreservingLocal(cwd, branch, ${optionsName}.onProgress);\n    } catch (mergeError) {\n      return failed(toMakerGitFailure(mergeError, "merge"), cloudRepair);\n    }`,
      "cloud repair merge",
    );
    // ours 合并会生成新提交，成功回执必须报告最终 HEAD，不能继续返回合并前的 commit。
    return body.replaceAll(
      "transientRetries += await push();",
      'transientRetries += await push();\n    commitHash = (await readGit(["rev-parse", "--short", "HEAD"], cwd)).trim();',
    );
  });
  const helpers = [
    "",
    "async function mergeMakerProjectHistoryPreservingLocal(cwd, branch, onProgress) {",
    "  onProgress?.({ progress: 68, total: 100, phase: 'merge', message: 'Preserving the local Maker file snapshot' });",
    "  await gitStep(['-c', 'user.email=maker-mcp@local', '-c', 'user.name=taptap-maker', 'merge', '--no-ff', '-s', 'ours', '--allow-unrelated-histories', 'origin/' + branch, '-m', 'chore: reconcile Maker remote history'], { cwd, stage: 'merge' });",
    "}",
    "async function pushMakerProjectWithHistoryFallback(branch, cwd, onProgress) {",
    "  const push = () => gitStepWithTransientRetry(['push', 'origin', 'HEAD:' + branch], { cwd, stage: 'push', onProgress });",
    "  try { return await push(); } catch (error) {",
    "    const failure = toMakerGitFailure(error, 'push');",
    "    if (failure.classification !== 'remote_rejected') throw error;",
    "    const detail = [failure.message, failure.stdout, failure.stderr].filter(Boolean).join('\\n');",
    "    if (!/non-fast-forward|fetch first/i.test(detail)) throw error;",
    "    onProgress?.({ progress: 68, total: 100, phase: 'fetch', message: 'Remote history advanced; preserving local files' });",
    "    const retries = await gitStepWithTransientRetry(['fetch', 'origin', branch], { cwd, onProgress });",
    "    await mergeMakerProjectHistoryPreservingLocal(cwd, branch, onProgress);",
    "    return retries + await push();",
    "  }",
    "}",
  ].join("\n");
  source = source.replace(/\nasync function pushMakerProject\(/, (match) => `${helpers}${match}`);
  source = requiredReplace(
    source,
    /远端拒绝了本次推送。运行 `taptap-maker git sync --target-dir <项目目录>` 拉取并合并远端 main 后，再重试 maker_build_current_directory；不要新建分支。/,
    "远端拒绝了本次推送。历史推进时 Maker 自动获取历史并以 ours 策略保留本地文件；若仍失败，保留本地提交并报告 fetch/merge/push 详情，不要手动 pull/rebase。",
    "remote rejection guidance",
  );
  await writeFile(bundlePath, source, "utf8");
}

async function downloadAndExtract(source) {
  const scopedName = source.packageName.split("/")[1] ?? source.packageName;
  console.log(`  [download] ${source.packageName}@${source.version}`);
  const response = await fetchWithRetry(source.tarball);
  const tarball = Buffer.from(await response.arrayBuffer());
  verifyIntegrity(tarball, source.integrity);

  const temporaryTarName = `.tmp-vendor-${scopedName}.tgz`;
  const temporaryTar = join(packageRoot, temporaryTarName);
  const temporaryDirectoryName = `.tmp-vendor-${scopedName}`;
  const temporaryDirectory = join(packageRoot, temporaryDirectoryName);
  await writeFile(temporaryTar, tarball);
  try {
    await mkdir(temporaryDirectory, { recursive: true });
    // 修复原因：Windows 下向 GNU tar 传 `D:\...` 绝对路径时，盘符冒号会被当成远程主机
    // （Cannot connect to D:）；改用相对路径 + cwd，兼容 macOS bsdtar 与 Windows GNU tar。
    await execFileAsync("tar", ["xzf", temporaryTarName, "-C", temporaryDirectoryName], {
      cwd: packageRoot,
    });
    await mkdir(vendorDistDir, { recursive: true });
    for (const fileName of source.distFiles) {
      const sourcePath = join(temporaryDirectory, "package", "dist", fileName);
      const destinationPath = join(vendorDistDir, fileName);
      await copyFile(sourcePath, destinationPath);
      console.log(`  [ok] ${source.packageName}/dist/${fileName}`);
    }
    if (source.packageName === "@taptap/maker") {
      await patchMakerPushPolicy(join(vendorDistDir, "maker.js"));
      console.log("  [ok] maker.js push-policy patch applied");
    }
  } finally {
    await rm(temporaryTar, { force: true });
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function writeDistSha512(lock) {
  for (const source of lock.packages) {
    source.distSha512 = {};
    for (const fileName of source.distFiles) {
      const bytes = await readFile(join(vendorDistDir, fileName));
      source.distSha512[fileName] = sha512Hex(bytes);
    }
  }
  await writeFile(lockPath, `${JSON.stringify(lock, null, "\t")}\n`, "utf8");
  console.log(`  [ok] wrote distSha512 to upstream-lock.json`);
}

/** lock 里已记录的 dist 哈希是否与磁盘一致（缺文件或缺哈希都算不一致）。 */
function isVendorDistCurrent(lock) {
  for (const source of lock.packages) {
    for (const fileName of source.distFiles) {
      const expected = source.distSha512?.[fileName];
      if (!expected) return false;
      const filePath = join(vendorDistDir, fileName);
      if (!existsSync(filePath)) return false;
      const actual = sha512Hex(readFileSync(filePath));
      if (actual !== expected) return false;
    }
  }
  return true;
}

/**
 * 构建前置：vendor dist 已按 lock 校验通过则跳过下载（离线可复现）；
 * 缺失/不一致时下载、打补丁并回写哈希。
 */
export async function ensureVendorAssets({ force = false } = {}) {
  const lock = readLock();
  if (!force && isVendorDistCurrent(lock)) {
    return { status: "current" };
  }
  await mkdir(vendorDistDir, { recursive: true });
  for (const source of lock.packages) {
    await downloadAndExtract(source);
  }
  await writeDistSha512(lock);
  return { status: "synced" };
}

async function main() {
  console.log("\nSyncing integrity-locked TapTap vendor bundles...\n");
  const result = await ensureVendorAssets({ force: true });
  console.log(`\nDone (${result.status}).\n`);
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error("sync-vendor failed:", error);
    process.exit(1);
  });
}
