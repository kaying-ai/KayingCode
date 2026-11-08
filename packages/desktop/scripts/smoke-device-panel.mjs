#!/usr/bin/env node
/* eslint-disable max-lines -- Electron E2E 的隔离启动、面板 UI 驱动与断言放在同一脚本，便于单命令复跑。 */
/**
 * Desktop × 设备管理面板 Electron E2E。
 *
 * 真实 UI 路径：
 * - 侧栏 settings 按钮 → 设置页 → 远程设备分区；
 * - `[data-source-server-card]` 内的 Connect / Disconnect / Edit / More → Remove device；
 * - 编辑对话框的 `#edit-connection-name` / `#edit-device-name` 与 Save changes。
 *
 * 测试注入（未修改生产代码，报告里必须与真实路径区分）：
 * 1. 通过 preload 的真实 IPC `connectRemote({kind:"wsl"})` +
 *    `bindRemoteWorkspaceSessionContext` 创建已保存的 WSL profile/source，然后
 *    `disposeRemoteSession` 让面板从离线状态开始。连接向导与面板使用同一条 Host 链路，
 *    本脚本不点击向导。
 * 2. 把已构建的 `kayingcode.cjs` 复制到隔离 data dir，满足 Host storage-preparation 前置要求。
 * 3. HOME、user-data、session-data、dataBaseDir 全部隔离到临时目录。
 *
 * 前置：
 * - `pnpm --filter @zcode/desktop run build:no-runtime-assets`
 * - `pnpm --filter @zcode/server-cli stage:remote-assets --linux`（需要安装/重装时）
 * - 可用 Agent bundle（`KAYINGCODE_E2E_AGENT_BUNDLE` 或仓库内已构建产物）
 * - 本机 WSL 与目标发行版；Source Server 已安装，或设置 KAYINGCODE_E2E_WSL_RESET=1
 *
 * 用法：`pnpm --filter @zcode/desktop run smoke:device-panel`
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
const LOG_PREFIX = "[smoke:device-panel]";
const WSL_DISTRO = process.env.KAYINGCODE_E2E_WSL_DISTRO?.trim() || "Ubuntu-22.04";
const RESET_WSL_SOURCE = process.env.KAYINGCODE_E2E_WSL_RESET === "1";
const DEVICE_NAME = "E2E Device";
const CONNECTION_NAME = "E2E Connection";

function log(message) {
  console.log(`${LOG_PREFIX} ${message}`);
}

function runWsl(commandArgs) {
  return new Promise((resolveRun, rejectRun) => {
    // 必须用 --exec：部分 wsl.exe 构建会把命令交给默认 shell 并提前展开 `$VAR`。
    const child = spawn("wsl.exe", ["-d", WSL_DISTRO, "--exec", ...commandArgs], {
      stdio: ["ignore", "pipe", "pipe"],
    });
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
  await runWsl([
    "bash",
    "-lc",
    "~/.kayingcode/server/bin/kayingcode stop --server-root ~/.kayingcode/server >/dev/null 2>&1 || true",
  ]).catch(() => undefined);
  await runWsl(["bash", "-lc", "rm -rf ~/.kayingcode/server"]);
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

async function connectWsl(page, options) {
  return await page.evaluate(
    async ({ distro, confirmSourceServerInstall }) => {
      return await window.kayingcode.connectRemote(
        { kind: "wsl", distro },
        undefined,
        confirmSourceServerInstall ? { confirmSourceServerInstall: true } : undefined,
      );
    },
    {
      distro: WSL_DISTRO,
      confirmSourceServerInstall: options?.confirmSourceServerInstall === true,
    },
  );
}

async function bindSource(page, sessionId) {
  const bind = await page.evaluate(
    async ({ remoteSessionId }) => {
      try {
        const result = await window.kayingcode.bindRemoteWorkspaceSessionContext({
          remoteSessionId,
          workspacePath: "/",
        });
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    { remoteSessionId: sessionId },
  );
  assert.equal(bind.ok, true, `绑定 Source workspace 失败：${bind.error ?? ""}`);
  assert.ok(bind.result.sourceServerId, "绑定时必须返回 sourceServerId");
  return bind.result;
}

async function disposeSession(page, sessionId) {
  await page
    .evaluate(
      async ({ remoteSessionId }) => await window.kayingcode.disposeRemoteSession(remoteSessionId),
      { remoteSessionId: sessionId },
    )
    .catch((error) => log(`dispose warning: ${error.message}`));
}

async function openRemoteDevicesPanel(page) {
  const settingsButton = page.getByTestId("task-settings-button");
  try {
    await settingsButton.first().waitFor({ state: "visible", timeout: 20_000 });
    await settingsButton.first().click();
  } catch {
    // 侧栏未渲染（例如窗口宽度变化）时使用系统设置快捷键。
    await page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
  }
  await page.getByTestId("settings-page").waitFor({ state: "visible", timeout: 60_000 });
  const sectionNav = page.getByTestId("settings-section-nav-remoteDevices");
  await sectionNav.waitFor({ state: "visible", timeout: 30_000 });
  await sectionNav.click();
  await page
    .getByText("Manage your servers, WSL distributions, and Docker containers.", { exact: false })
    .waitFor({ state: "visible", timeout: 60_000 });
}

function deviceCard(page, sourceServerId) {
  return page.locator(`[data-source-server-card="${sourceServerId}"]`);
}

async function waitForDeviceAction(card, name, timeout = 180_000) {
  const button = card.getByRole("button", { name, exact: true });
  await button.waitFor({ state: "visible", timeout });
  return button;
}

async function ensureOffline(card) {
  const disconnect = card.getByRole("button", { name: "Disconnect", exact: true });
  if ((await disconnect.count()) > 0) {
    await disconnect.first().click();
    await waitForDeviceAction(card, "Connect");
  }
  return await waitForDeviceAction(card, "Connect");
}

const tempRoot = await mkdtemp(join(tmpdir(), "kayingcode-device-panel-e2e-"));
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
let pageErrors = [];
let sourceServerId;

function buildEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, {
    KAYINGCODE_DESKTOP_HOME_DIR: homeDir,
    KAYINGCODE_DESKTOP_SETTINGS_BASE_DIR: homeDir,
    KAYINGCODE_DESKTOP_USER_DATA_DIR: userDataDir,
    KAYINGCODE_DESKTOP_SESSION_DATA_DIR: sessionDataDir,
    KAYINGCODE_DATA_BASE_DIR: dataBaseDir,
    KAYINGCODE_DESKTOP_APPLICATION_NAME: `KayingCode Device Panel E2E ${process.pid}`,
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
  await resetWslSource();

  ({ app: electronApp, page, pageErrors } = await launchApp(buildEnv()));
  log("app launched");

  // ---- 种子：通过真实 IPC 建立已保存的 WSL profile/source，再从离线状态开始 --------
  const probe = await connectWsl(page);
  log(`probe result: ${JSON.stringify(probe)}`);
  let connected;
  if (probe.success) {
    connected = probe;
  } else if (probe.reasonCode === "source-server-install-required") {
    log(`installing Source Server on WSL ${WSL_DISTRO} (may take minutes)`);
    connected = await connectWsl(page, { confirmSourceServerInstall: true });
    assert.equal(connected.success, true, `确认安装后连接应成功：${connected.error ?? ""}`);
  } else {
    assert.fail(
      `设备面板烟测需要已安装且版本匹配的 Source Server；实际 reasonCode=${
        probe.reasonCode ?? "<none>"
      }。先运行 smoke:source-install，或设置 KAYINGCODE_E2E_WSL_RESET=1。`,
    );
  }
  assert.ok(connected.sessionId, "连接成功后必须返回 sessionId");
  const bound = await bindSource(page, connected.sessionId);
  sourceServerId = bound.sourceServerId;
  log(`bound sourceServerId=${sourceServerId}`);
  await disposeSession(page, connected.sessionId);
  log("session disposed; panel should start offline");

  // ---- 面板：设备出现 → 连接 → 断开 → 编辑 → 移除 ------------------------------
  await openRemoteDevicesPanel(page);
  log("remote devices panel opened");
  const card = deviceCard(page, sourceServerId);
  await card.waitFor({ state: "visible", timeout: 120_000 });
  await card.getByText(WSL_DISTRO, { exact: false }).first().waitFor({ state: "visible" });
  log("device card visible with WSL target");

  const connectButton = await ensureOffline(card);
  log("device offline; clicking Connect");
  await connectButton.click();
  await waitForDeviceAction(card, "Disconnect");
  log("device online; clicking Disconnect");
  await (await waitForDeviceAction(card, "Disconnect")).click();
  await waitForDeviceAction(card, "Connect");
  log("device offline again");

  const editButton = card.getByRole("button", { name: "Edit", exact: true }).first();
  await editButton.click();
  const editDialog = page.getByRole("dialog");
  await editDialog.waitFor({ state: "visible", timeout: 30_000 });
  await editDialog.locator("#edit-connection-name").fill(CONNECTION_NAME);
  await editDialog.locator("#edit-device-name").fill(DEVICE_NAME);
  await editDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await editDialog.waitFor({ state: "detached", timeout: 60_000 });
  await card.getByText(DEVICE_NAME, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  // 设备卡展示的是连接地址，不是连接名；重新打开编辑弹窗读取 input value，
  // 验证 profile 名称与设备名都真正写入目录，而不是只改了本地弹窗状态。
  await card.getByRole("button", { name: "Edit", exact: true }).first().click();
  const verifyDialog = page.getByRole("dialog");
  await verifyDialog.waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(
    await verifyDialog.locator("#edit-connection-name").inputValue(),
    CONNECTION_NAME,
    "连接名未持久化",
  );
  assert.equal(
    await verifyDialog.locator("#edit-device-name").inputValue(),
    DEVICE_NAME,
    "设备名未持久化",
  );
  await verifyDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await verifyDialog.waitFor({ state: "detached", timeout: 30_000 });
  log("device and connection names updated");

  await card.getByRole("button", { name: "More", exact: true }).click();
  const removeItem = page.getByRole("menuitem", { name: "Remove device", exact: true });
  await removeItem.waitFor({ state: "visible", timeout: 30_000 });
  await removeItem.click();
  // 确认框按钮带有键盘提示后缀，不能用 exact accessible name 匹配；使用稳定 test id。
  await page.getByTestId("confirm-dialog-confirm").click();
  await card.waitFor({ state: "detached", timeout: 60_000 });
  await page
    .getByText("No remote device connections yet.", { exact: false })
    .waitFor({ state: "visible", timeout: 30_000 });
  log("device removed; empty state visible");

  assert.equal(pageErrors.length, 0, `renderer page errors: ${pageErrors.join(" | ")}`);
  log(
    "PASS device panel: card -> Connect -> Disconnect -> edit names -> Remove device -> empty state",
  );
} catch (error) {
  console.error(`${LOG_PREFIX} FAILED: ${error instanceof Error ? error.message : error}`);
  if (pageErrors.length > 0) {
    console.error(`${LOG_PREFIX} page errors: ${pageErrors.join(" | ")}`);
  }
  process.exitCode = 1;
} finally {
  await electronApp?.close().catch(() => undefined);
  if (process.env.KAYINGCODE_E2E_KEEP_TEMP === "1") {
    log(`kept temp root: ${tempRoot}`);
  } else {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
