import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  symlink,
  copyFile,
  writeFile,
  rm,
} from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { applyUpstreamBranding } from "./apply-upstream-branding.mjs";
import { applyMobileWebview, MOBILE_PROJECT_ADAPTERS } from "./apply-mobile-webview.mjs";
import { applyWorkspaceIdentity, WORKSPACE_IDENTITY_FILES } from "./apply-workspace-identity.mjs";

// 允许覆盖的账号适配文件：除这两个文件外，官方工作台源码不允许被本仓替换。
const ALLOWED_OVERRIDES = ["src/auth/webAuthService.ts", "src/auth/WebLoginPage.tsx"];
// staging 结果标记。web 和 web-share 共用同一份官方导出，构建时只需要导出一次。
const STAGE_STATE_FILE = ".stage-state.json";
// 同一份 stage 只允许一个进程抽取/打补丁；另一个进程等待标记出现后直接复用。
const LOCK_TIMEOUT_MS = 20 * 60_000;
const LOCK_STALE_MS = 10 * 60_000;

/**
 * 计算 staging 输入的指纹。
 *
 * 修复原因：web-share 与 web 共用固定官方导出后，不能再用“目录存在”判断是否可以复用：
 * 上游提交、覆盖文件、品牌替换脚本或本地 UI 资源任一变化都会改变导出内容。
 * 这些输入全部参与指纹，标记不一致时重新导出，避免构建使用过期的 stage。
 */
async function hashFile(path) {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

async function computeFingerprint({ webRoot, repoRoot, source, relayOrigin }) {
  const inputs = [
    resolve(webRoot, "upstream-web.json"),
    resolve(webRoot, "scripts/stage-upstream-web.mjs"),
    resolve(webRoot, "scripts/apply-upstream-branding.mjs"),
    resolve(webRoot, "scripts/apply-mobile-webview.mjs"),
    resolve(webRoot, "scripts/apply-workspace-identity.mjs"),
    resolve(webRoot, "src/mobileWebview.ts"),
    ...Object.values(MOBILE_PROJECT_ADAPTERS).map((path) => resolve(repoRoot, path)),
    ...WORKSPACE_IDENTITY_FILES.map((path) => resolve(repoRoot, path)),
    ...source.overrides.map((relative) => resolve(webRoot, relative)),
    // 品牌替换读取的仓库内资源；它们变化后必须重新应用品牌补丁。
    resolve(repoRoot, "packages/ui/src/assets/KayingCode-mark.png"),
    resolve(repoRoot, "public/logo/icons/32x32.png"),
    resolve(repoRoot, "packages/ui/src/components/ui/KayingCodeAboutLogo.tsx"),
    resolve(repoRoot, "packages/ui/src/root/RootStartupLoading.tsx"),
    resolve(repoRoot, "packages/ui/src/v4/ConversationDraftEmptyState.tsx"),
  ];
  const hashes = await Promise.all(inputs.map((path) => hashFile(path)));
  const hash = createHash("sha256");
  hash.update(JSON.stringify({ commit: source.commit, relayOrigin, inputs }));
  for (const value of hashes) hash.update(value);
  return hash.digest("hex");
}

async function readStageState(stage) {
  // 另一个进程可能正在写入标记：读到半截 JSON 时短暂重试，避免把并发构建当成损坏状态。
  for (let attempt = 0; ; attempt += 1) {
    try {
      return JSON.parse(await readFile(resolve(stage, STAGE_STATE_FILE), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      if (error instanceof SyntaxError && attempt < 4) {
        await delay(100);
        continue;
      }
      throw error;
    }
  }
}

function requiredStageFiles(stage) {
  return [
    resolve(stage, "packages/web/index.html"),
    resolve(stage, "packages/web/src/kaying-bootstrap.ts"),
    resolve(stage, "packages/web-share/package.json"),
    resolve(stage, "packages/web-share/src/main.tsx"),
  ];
}

async function stageIsUsable(stage, fingerprint) {
  const state = await readStageState(stage);
  if (!state?.workspaceIdentity || state.fingerprint !== fingerprint) return false;
  // 标记存在但文件被清理（例如手工删除 stage）时不能直接复用。
  for (const path of requiredStageFiles(stage)) {
    try {
      await stat(path);
    } catch {
      return false;
    }
  }
  for (const { path, sha256 } of state.workspaceIdentity) {
    const stagedSha256 = await hashFile(resolve(stage, path)).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stagedSha256 !== sha256) return false;
  }
  return true;
}

function command(bin, args, cwd) {
  return new Promise((done, reject) => {
    const child = spawn(bin, args, { cwd, env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? done() : reject(new Error(`${bin} exited ${code}`))));
  });
}

async function acquireLock(lockDir, stage, fingerprint) {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      await mkdir(lockDir);
      return true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      // 另一个进程可能已经完成导出：优先复用它的标记，而不是重复抽取。
      if (await stageIsUsable(stage, fingerprint)) return false;
      const info = await stat(lockDir).catch(() => null);
      if (info && Date.now() - info.mtimeMs > LOCK_STALE_MS) {
        // 上次导出异常退出留下的锁；清掉后重新竞争。
        await rm(lockDir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for upstream web staging lock: ${lockDir}`);
      }
      await delay(500);
    }
  }
}

async function extractSource({ source, stage, repoRoot }) {
  // 官方工作台与全部源码依赖在独立导出中构建，不能解析回本仓裁剪后的 UI。
  const available = await new Promise((done) => {
    const probe = spawn("git", ["cat-file", "-e", `${source.commit}^{commit}`], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    probe.on("exit", (code) => done(code === 0));
    probe.on("error", () => done(false));
  });
  if (!available) {
    await command("git", ["fetch", "--no-tags", "--depth=1", source.repo, source.commit], repoRoot);
  }
  await mkdir(stage, { recursive: true });
  // 中文上游文档不是编译输入；Windows tar 无法解码其路径时会使整个源码导出失败。
  // 修复原因：Git Bash 的 GNU tar 会把 `-C D:\...` 当成 POSIX 路径并报错，
  // 改为把 stage 设为子进程 cwd，避免跨 shell 的路径转换差异。
  const archive = spawn("git", ["archive", source.commit, "--", ".", ":(exclude)docs"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const untar = spawn("tar", ["-x"], { cwd: stage, stdio: ["pipe", "inherit", "inherit"] });
  const exit = (child) =>
    new Promise((done, reject) => {
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? done() : reject(new Error(`${child.spawnfile ?? "archive"} exited ${code}`)),
      );
    });
  await Promise.all([pipeline(archive.stdout, untar.stdin), exit(archive), exit(untar)]);
}

async function linkStageModules({ stage, repoRoot }) {
  const modules = resolve(stage, "node_modules");
  await mkdir(modules, { recursive: true });
  async function link(target, dest) {
    await rm(dest, { recursive: true, force: true });
    await symlink(target, dest, "dir");
  }
  for (const entry of await readdir(resolve(repoRoot, "node_modules"), { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "@zcode") continue;
    await link(resolve(repoRoot, "node_modules", entry.name), resolve(modules, entry.name));
  }
  await mkdir(resolve(modules, "@zcode"), { recursive: true });
  for (const entry of await readdir(resolve(stage, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const location = resolve(stage, "packages", entry.name);
    const raw = await readFile(resolve(location, "package.json"), "utf8").catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!raw) continue;
    const pkg = JSON.parse(raw);
    if (pkg.name?.startsWith("@zcode/")) await link(location, resolve(modules, pkg.name));
  }
}

async function applyOverrides({ webRoot, stage, source }) {
  for (const relative of source.overrides) {
    if (!ALLOWED_OVERRIDES.includes(relative)) throw new Error("Workbench overrides are forbidden");
    await copyFile(
      resolve(webRoot, "src/auth", relative.split("/").at(-1)),
      resolve(stage, "packages/web", relative),
    );
  }
}

/**
 * 将固定官方提交导出到 `.cache/upstream-web/<commit>` 并记录补丁结果。
 *
 * web（工作台）和 web-share（/cn/share 分享页）都从同一份导出构建，
 * 这样分享页继续使用官方 3.17.2 的 share/auth 源码，不需要把上游源码复制回产品目录。
 */
export async function stageUpstreamWeb({ webRoot, repoRoot, force = false }) {
  const rawSource = await readFile(resolve(webRoot, "upstream-web.json"), "utf8");
  const source = JSON.parse(rawSource);
  if (!/^[a-f0-9]{40}$/.test(source.commit)) throw new Error("Invalid upstream commit");
  if (source.repo !== "https://github.com/zai-org/ZCode")
    throw new Error("Official upstream required");
  const relayOrigin = new URL(process.env.KAYINGCODE_REMOTE_ORIGIN || source.relayOrigin).origin;
  const stage = resolve(repoRoot, ".cache/upstream-web", source.commit);
  const fingerprint = await computeFingerprint({ webRoot, repoRoot, source, relayOrigin });
  const lockDir = `${stage}.stage-lock`;

  if (!force && (await stageIsUsable(stage, fingerprint))) {
    return { ...(await readStageState(stage)), stage, source, webRoot, repoRoot };
  }

  // 锁目录与 stage 同级，父目录不存在时 mkdir(lockDir) 会失败。
  await mkdir(resolve(repoRoot, ".cache/upstream-web"), { recursive: true });
  const ownsLock = await acquireLock(lockDir, stage, fingerprint);
  if (!ownsLock) {
    return { ...(await readStageState(stage)), stage, source, webRoot, repoRoot };
  }

  try {
    // 拿到锁后再检查一次：等待期间另一个进程可能已经完成导出。
    if (!force && (await stageIsUsable(stage, fingerprint))) {
      return { ...(await readStageState(stage)), stage, source, webRoot, repoRoot };
    }

    await extractSource({ source, stage, repoRoot });
    const workbenchFiles = [
      "packages/web/src/main.tsx",
      "packages/ui/src/Root.tsx",
      "packages/ui/src/App.tsx",
    ];
    const workbenchHashes = Object.fromEntries(
      await Promise.all(
        workbenchFiles.map(async (path) => [
          path,
          createHash("sha256")
            .update(await readFile(resolve(stage, path)))
            .digest("hex"),
        ]),
      ),
    );
    await linkStageModules({ stage, repoRoot });
    await applyOverrides({ webRoot, stage, source });
    // 仅提前加载授权适配器并替换明确品牌展示；上游业务、连接与恢复逻辑保持不变。
    const branding = await applyUpstreamBranding({ stage, repoRoot });
    const mobileWebview = await applyMobileWebview({ stage, webRoot });
    const workspaceIdentity = await applyWorkspaceIdentity({ stage, repoRoot });
    const htmlPath = resolve(stage, "packages/web/index.html");
    let html = await readFile(htmlPath, "utf8");
    html = html.replace('src="/src/main.tsx"', 'src="/src/kaying-bootstrap.ts"');
    await writeFile(htmlPath, html);
    // HTML 同时包含品牌与授权 bootstrap 适配，记录最终 staged 源码哈希以便审计。
    branding.files.find((file) => file.path === "packages/web/index.html").sha256 =
      createHash("sha256").update(html).digest("hex");
    await writeFile(
      resolve(stage, "packages/web/src/kaying-bootstrap.ts"),
      'import { initializeAccount } from "./auth/webAuthService.js";\nawait initializeAccount();\nawait import("./main.js");\n',
    );

    const state = {
      fingerprint,
      relayOrigin,
      workbenchHashes,
      branding,
      mobileWebview,
      workspaceIdentity,
      stagedAt: new Date().toISOString(),
    };
    await writeFile(resolve(stage, STAGE_STATE_FILE), JSON.stringify(state, null, 2));
    return { ...state, stage, source, webRoot, repoRoot };
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}
