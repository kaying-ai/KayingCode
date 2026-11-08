#!/usr/bin/env node
/* eslint-disable max-lines -- Electron E2E 的隔离启动、安装等待与冷启动断言放在同一脚本，便于单命令复跑。 */
/**
 * Desktop × WSL Source Server 安装 + 冷启动自动重连 Electron E2E。
 *
 * 目标（全部走生产代码）：
 * 1. 未安装的 WSL 目标首次连接返回 `source-server-install-required`（Host 只探测，不安装）；
 * 2. 带 `confirmSourceServerInstall: true` 重试后真实上传归档、安装、启动 daemon 并连接；
 * 3. 绑定 workspace 身份并取到 source-settings attachment；
 * 4. 退出应用后用同一数据目录重启，Host 的启动重连批次把 Source 拉回在线，
 *    再次连接同一目标会复用已建立的物理连接（`reusedConnectionTarget`）。
 *
 * 测试注入（未修改生产代码）：
 * - 仅把已构建的 `kayingcode.cjs` 复制到隔离 data dir 的 `.kayingcode/server/agents/glm/`，
 *   满足 Host storage-preparation 对 Agent runtime 的前置要求。
 * - 其余连接、安装、身份绑定、attachment 全部通过 preload 暴露的真实 IPC 调用，
 *   与设备面板/向导使用的是同一条链路；本脚本不点击 UI。
 *
 * 前置：
 * - `pnpm --filter @zcode/desktop run build:no-runtime-assets`
 * - `pnpm --filter @zcode/server-cli stage:remote-assets --linux`（生成 mock-cdn 归档）
 * - 可用 Agent bundle（`KAYINGCODE_E2E_AGENT_BUNDLE` 或仓库内已构建产物）
 * - 本机可用 WSL，且目标发行版存在（默认 Ubuntu-22.04）
 *
 * 用法：
 *   KAYINGCODE_E2E_WSL_DISTRO=Ubuntu-22.04 pnpm --filter @zcode/desktop run smoke:source-install
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(desktopRoot, "../..");
const require = createRequire(new URL("../package.json", import.meta.url));
const { _electron } = require("playwright-core");
const electronPath = require("electron");

const platformKey = `${process.platform}-${process.arch}`;
const desktopMain = join(desktopRoot, "out/main/index.js");
const mockCdnReleaseDir = join(desktopRoot, "mock-cdn", "releases");
const LOG_PREFIX = "[smoke:source-install]";
const WSL_DISTRO = process.env.KAYINGCODE_E2E_WSL_DISTRO?.trim() || "Ubuntu-22.04";
/** 显式清理目标 WSL 的 ~/.kayingcode/server，保证“首次安装”断言可重复。 */
const RESET_WSL_SOURCE = process.env.KAYINGCODE_E2E_WSL_RESET === "1";

function runWsl(commandArgs) {
  return new Promise((resolveRun, rejectRun) => {
    // 必须用 --exec：部分 wsl.exe 构建会把命令交给默认 shell 并提前展开 `$VAR`。
    const child = spawn(
      "wsl.exe",
      ["-d", WSL_DISTRO, "--exec", ...commandArgs],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else rejectRun(new Error(`wsl ${commandArgs.join(" ")} exited ${code}: ${stderr.trim()}`));
    });
  });
}

async function resetWslSource() {
  if (!RESET_WSL_SOURCE) return;
  log(`resetting WSL ${WSL_DISTRO} ~/.kayingcode/server (explicit KAYINGCODE_E2E_WSL_RESET=1)`);
  // stop 失败（未安装/无 daemon）不能阻断清理。
  await runWsl([
    "bash",
    "-lc",
    "~/.kayingcode/server/bin/kayingcode stop --server-root ~/.kayingcode/server >/dev/null 2>&1 || true",
  ]).catch(() => undefined);
  await runWsl(["bash", "-lc", "rm -rf ~/.kayingcode/server"]);
}

function log(message) {
  console.log(`${LOG_PREFIX} ${message}`);
}

function assertBuildArtifacts() {
  if (!existsSync(desktopMain)) {
    throw new Error(
      `缺少桌面构建产物：${desktopMain}\n先运行 pnpm --filter @zcode/desktop run build:no-runtime-assets`,
    );
  }
  if (!existsSync(mockCdnReleaseDir)) {
    throw new Error(
      `缺少 mock-cdn 发行资产：${mockCdnReleaseDir}\n先运行 pnpm --filter @zcode/server-cli stage:remote-assets --linux`,
    );
  }
}

function resolveAgentBundle() {
  const candidates = [
    process.env.KAYINGCODE_E2E_AGENT_BUNDLE,
    join(repoRoot, "apps/zcode-cli/packages/cli/dist/kayingcode.cjs"),
    join(desktopRoot, "bundled-agents", platformKey, "glm", "kayingcode.cjs"),
  ].filter((candidate) => typeof candidate === "string" && candidate.trim());
  for (const candidate of candidates) {
    if (existsSync(candidate)) return resolve(candidate);
  }
  throw new Error(
    [
      "未找到可用的桌面 Agent bundle（kayingcode.cjs），Host 会以 unsupported_runtime 拒绝启动。",
      "先运行 `pnpm run prepare:desktop-runtime` 或 `pnpm --filter @zcode/desktop run prepare:agent-bundle`，",
      "或设置 KAYINGCODE_E2E_AGENT_BUNDLE 指向已构建的 kayingcode.cjs。",
    ].join("\n"),
  );
}

async function seedDesktopSettings({ homeDir, workspacePath }) {
  const settingsDir = join(homeDir, ".kayingcode", "v2");
  await mkdir(settingsDir, { recursive: true });
  await writeFile(
    join(settingsDir, "setting.json"),
    JSON.stringify(
      {
        locale: "en-US",
        localePreference: "en-US",
        lastWorkspaceSession: [{ kind: "local", workspacePath }],
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function skipOnboardingIfPresent(page) {
  const onboarding = page.getByTestId("onboarding-page");
  await onboarding.waitFor({ timeout: 90_000 }).catch(() => undefined);
  if ((await onboarding.count()) === 0) return false;
  for (let step = 0; step < 2; step += 1) {
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    await page.waitForTimeout(200);
  }
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await onboarding.waitFor({ state: "detached", timeout: 30_000 });
  return true;
}

async function launchApp(env) {
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [desktopRoot],
    env,
    timeout: 120_000,
  });
  const window = await app.firstWindow({ timeout: 120_000 });
  const pageErrors = [];
  window.on("pageerror", (error) => {
    pageErrors.push(error.message);
    log(`[renderer:pageerror] ${error.message}`);
  });
  await window.waitForLoadState("domcontentloaded");
  const skipped = await skipOnboardingIfPresent(window);
  log(`onboarding skipped=${skipped}`);
  return { app, page: window, pageErrors };
}

/** 通过 preload 的真实 IPC 调用连接；context 与设备面板使用的是同一个入口。 */
async function connectWsl(page, context) {
  return await page.evaluate(
    async ({ distro, confirmSourceServerInstall }) => {
      const result = await window.kayingcode.connectRemote(
        { kind: "wsl", distro },
        undefined,
        confirmSourceServerInstall ? { confirmSourceServerInstall: true } : undefined,
      );
      return result;
    },
    { distro: WSL_DISTRO, confirmSourceServerInstall: context?.confirmSourceServerInstall === true },
  );
}

/**
 * 冷启动断言读取 Main 的按日日志：Host 的启动重连结果会经 hostLogRelay 落到同一文件。
 * 只有日志里出现 online=1 才证明是“启动批次”重连，而不是手动连接后的复用。
 */
async function readNewestLogText(logDir) {
  const entries = await readdir(logDir).catch(() => []);
  const logs = entries.filter((name) => name.endsWith(".log")).sort();
  if (logs.length === 0) return "";
  return await readFile(join(logDir, logs.at(-1)), "utf8").catch(() => "");
}

async function waitForLogLine(logDir, needle, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await readNewestLogText(logDir);
    if (text.includes(needle)) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
  }
  return false;
}

const tempRoot = await mkdtemp(join(tmpdir(), "kayingcode-source-install-e2e-"));
const homeDir = join(tempRoot, "home");
const workspacePath = join(tempRoot, "workspace");
const dataBaseDir = join(tempRoot, "data");
const userDataDir = join(tempRoot, "user-data");
const sessionDataDir = join(tempRoot, "session-data");
const agentBundleTarget = join(
  dataBaseDir,
  ".kayingcode",
  "server",
  "agents",
  "glm",
  "kayingcode.cjs",
);

let electronApp;
let page;
let boundSourceServerId;
let installSessionId;

function buildEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, {
    KAYINGCODE_DESKTOP_HOME_DIR: homeDir,
    KAYINGCODE_DESKTOP_SETTINGS_BASE_DIR: homeDir,
    KAYINGCODE_DESKTOP_USER_DATA_DIR: userDataDir,
    KAYINGCODE_DESKTOP_SESSION_DATA_DIR: sessionDataDir,
    KAYINGCODE_DATA_BASE_DIR: dataBaseDir,
    KAYINGCODE_DESKTOP_APPLICATION_NAME: `KayingCode Source Install E2E ${process.pid}`,
  });
  return env;
}

try {
  assertBuildArtifacts();
  const agentBundle = resolveAgentBundle();
  for (const dir of [homeDir, workspacePath, dataBaseDir, userDataDir, sessionDataDir]) {
    await mkdir(dir, { recursive: true });
  }
  await seedDesktopSettings({ homeDir, workspacePath });
  await mkdir(join(dataBaseDir, ".kayingcode", "server", "agents", "glm"), { recursive: true });
  await cp(agentBundle, agentBundleTarget);
  log(`agent bundle staged from ${agentBundle}`);
  log(`mock-cdn releases under ${mockCdnReleaseDir}`);
  // 必须在启动应用前清理：否则 Host 的启动重连批次会先连上旧安装，首次安装断言失效。
  await resetWslSource();

  // ---- 阶段 1：首次连接只探测 ------------------------------------------------
  ({ app: electronApp, page } = await launchApp(buildEnv()));
  log("app launched (install phase)");

  const probe = await connectWsl(page);
  log(`probe result: ${JSON.stringify(probe)}`);
  let installed;
  if (probe.success) {
    // 目标发行版已经装过：本次只验证连接/绑定/冷启动复用。
    log(
      "Source Server already installed on this distro; skipping first-install assertions " +
        "(set KAYINGCODE_E2E_WSL_RESET=1 to re-verify the install path)",
    );
    installed = probe;
  } else {
    assert.equal(
      probe.reasonCode,
      "source-server-install-required",
      `期望 install-required，实际 ${probe.reasonCode ?? "<none>"}`,
    );
    assert.ok(probe.profileId, "install-required 必须带 profileId");

    // ---- 阶段 2：确认安装后真实部署 --------------------------------------------
    log(`installing Source Server on WSL ${WSL_DISTRO} (upload + extract, may take minutes)`);
    installed = await connectWsl(page, { confirmSourceServerInstall: true });
    log(`install result: ${JSON.stringify(installed)}`);
    assert.equal(installed.success, true, `确认安装后连接应成功：${installed.error ?? ""}`);
  }
  assert.ok(installed.sessionId, "连接成功后必须返回 sessionId");
  installSessionId = installed.sessionId;

  // ---- 阶段 3：绑定身份 + source-settings attachment -------------------------
  const bind = await page.evaluate(
    async ({ sessionId }) => {
      try {
        const result = await window.kayingcode.bindRemoteWorkspaceSessionContext({
          remoteSessionId: sessionId,
          workspacePath: "/",
        });
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    { sessionId: installSessionId },
  );
  assert.equal(bind.ok, true, `绑定 workspace 身份失败：${bind.error ?? ""}`);
  boundSourceServerId = bind.result.sourceServerId;
  assert.ok(boundSourceServerId, "绑定时必须返回稳定 sourceServerId");
  log(`bound sourceServerId=${boundSourceServerId} identity=${bind.result.workspaceIdentity}`);

  const attachment = await page.evaluate(
    async ({ sourceServerId }) => {
      try {
        const result = await window.kayingcode.requestSourceSettingsAttachment(sourceServerId);
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    { sourceServerId: boundSourceServerId },
  );
  assert.equal(attachment.ok, true, `source-settings attachment 失败：${attachment.error ?? ""}`);
  assert.match(attachment.result.attachmentId, /^source-settings-/u);
  log(`source-settings attachment=${attachment.result.attachmentId}`);

  await page.evaluate(
    async ({ sessionId }) => await window.kayingcode.disposeRemoteSession(sessionId),
    { sessionId: installSessionId },
  ).catch((error) => log(`dispose warning: ${error.message}`));
  await electronApp.close().catch(() => undefined);
  electronApp = undefined;
  log("app closed after install phase");

  // ---- 阶段 4：冷启动自动重连 ------------------------------------------------
  ({ app: electronApp, page } = await launchApp(buildEnv()));
  log("app relaunched (cold-start phase)");
  // 启动批次在本地服务就绪后后台执行；先等日志证据，再验证手动连接是否复用物理连接。
  const logDir = join(dataBaseDir, ".kayingcode", "v2", "logs");
  const startupReconnected = await waitForLogLine(
    logDir,
    "Source Server startup reconnect finished, online=1",
    90_000,
  );
  assert.equal(
    startupReconnected,
    true,
    `启动重连日志缺失（${logDir}）：期望 "Source Server startup reconnect finished, online=1"`,
  );
  log("startup reconnect log confirmed: online=1");

  let reused;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = await connectWsl(page);
    log(`cold-start connect attempt: ${JSON.stringify(result)}`);
    if (result.success && result.reusedConnectionTarget) {
      reused = result;
      break;
    }
    await page.waitForTimeout(5_000);
  }
  assert.ok(
    reused,
    "冷启动后再次连接应复用启动批次建立的物理连接（reusedConnectionTarget 缺失）",
  );
  log(`cold-start reuse: ${JSON.stringify(reused.reusedConnectionTarget)}`);
  if (reused.sessionId) {
    await page.evaluate(
      async ({ sessionId }) => await window.kayingcode.disposeRemoteSession(sessionId),
      { sessionId: reused.sessionId },
    ).catch(() => undefined);
  }

  log(
    "PASS WSL Source Server install + cold-start reconnect: install-required -> confirmed install -> " +
      "bind -> source-settings attachment -> relaunch -> reused connection",
  );
} catch (error) {
  console.error(`${LOG_PREFIX} FAILED: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await electronApp?.close().catch(() => undefined);
  if (process.env.KAYINGCODE_E2E_KEEP_TEMP === "1") {
    log(`kept temp root: ${tempRoot}`);
  } else {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
