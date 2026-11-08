#!/usr/bin/env node
/* eslint-disable max-lines -- Electron E2E 的隔离启动、UI 驱动与断言放在同一脚本，便于单命令复跑。 */
/**
 * Desktop × 设备管理 returnTarget Electron E2E。
 *
 * 目标：验证 ProjectCreation → 设备管理向导 → 返回原项目页的 connected / cancelled 路径。
 *
 * 真实 UI 路径（本脚本点击/等待的都是生产组件）：
 * - 应用启动、workspace 恢复、侧边栏「新项目」、项目创建 dialog、设备下拉；
 * - 「添加远程设备…」进入 SSHDialog（kind → settings → connecting）；
 * - SSHDialog 在 completion=device-management 时连接成功后 `closeDialog({preserveSession:true})`；
 * - Root 从 session store 读取 sourceServerId 并投递 `finish({kind:"connected"})`；
 * - ProjectCreation 的 returnTarget 收到结果后切换设备；关闭向导时投递 `cancelled`。
 *
 * 测试注入（未修改生产代码，报告里必须与真实路径区分）：
 * 1. ProjectCreation 的 `allowDeviceManagement` 当前在 ProjectSidebar/ProjectComposerMenu 硬编码为
 *    false，真实入口不会渲染「添加远程设备…」。脚本在 ProjectCreation fiber 上把该 prop 运行时置为
 *    true 并触发一次组件自重渲染；之后点击的是真实 SelectItem 与真实 ProjectCreation 回调。
 * 2. 桌面 Agent 缺失时 Host 的 storage-preparation 会以 unsupported_runtime 阻断 UI；脚本把可用的
 *    `kayingcode.cjs` 复制到隔离 data dir 的 `.kayingcode/server/agents/glm/`，不写入仓库。
 * 3. `kayingcode:connect-remote` IPC 在 Main 进程内被包装：SSH 表单提交的真实 target 被替换为
 *    `{kind:"server", url, token}` + `workspacePath:"/"`，连接到脚本启动的临时 server-core；
 *    表单校验、向导步骤、Root/SSHDialog 结果投递仍是生产逻辑。
 * 4. `KAYINGCODE_E2E_DROP_UNREAD=1` 时才会包装 `MessagePort.postMessage` 丢弃
 *    `window-controller.onDynamicTaskUnreadSignal` 订阅，用于复现旧 Host 崩溃；默认走真实订阅。
 *
 * 前置：
 * - `pnpm install --frozen-lockfile`
 * - `pnpm --filter @zcode/desktop run build:no-runtime-assets`
 * - `pnpm --filter @zcode/server-cli run build`
 * - 可用 Agent bundle（见 resolveAgentBundle）：`pnpm run prepare:desktop-runtime`，或设置
 *   `KAYINGCODE_E2E_AGENT_BUNDLE` 指向已构建的 `kayingcode.cjs`。
 *
 * 用法：`pnpm --filter @zcode/desktop run smoke:device-return`
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
const coreEntry = join(repoRoot, "packages/zcode-server-cli/dist/server-core.js");
const desktopMain = join(desktopRoot, "out/main/index.js");
const disposeChannel = "kayingcode:dispose-remote-session";
const connectChannel = "kayingcode:connect-remote";
const unsupportedUnreadEvent = "onDynamicTaskUnreadSignal";
const LOG_PREFIX = "[smoke:device-return]";

function log(message) {
  console.log(`${LOG_PREFIX} ${message}`);
}

function assertBuildArtifacts() {
  if (!existsSync(coreEntry)) {
    throw new Error(
      `缺少 server-core 构建产物：${coreEntry}\n先运行 pnpm --filter @zcode/server-cli run build`,
    );
  }
  if (!existsSync(desktopMain)) {
    throw new Error(
      `缺少桌面构建产物：${desktopMain}\n先运行 pnpm --filter @zcode/desktop run build:no-runtime-assets`,
    );
  }
}

/**
 * Host 的 storage-preparation 需要一个支持 `--prepare-storage` 的 kayingcode.cjs。
 * 优先用显式 env，其次用仓库内已构建产物；找不到时给出可执行的前置命令。
 */
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

function waitForServerReady(child, timeoutMs = 60_000) {
  return new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => {
      rejectReady(new Error("server-core ready timeout"));
    }, timeoutMs);
    const onMessage = (message) => {
      if (message && typeof message === "object" && message.type === "ready") {
        clearTimeout(timer);
        child.off("message", onMessage);
        resolveReady(message);
      }
    };
    child.on("message", onMessage);
    child.once("exit", (code) => {
      clearTimeout(timer);
      rejectReady(new Error(`server-core exited before ready: ${code}`));
    });
  });
}

function stopChild(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolveStop) => {
    child.once("exit", () => resolveStop());
    child.kill();
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolveStop();
    }, 10_000).unref();
  });
}

async function seedDesktopSettings({ homeDir, workspacePath }) {
  const settingsDir = join(homeDir, ".kayingcode", "v2");
  await mkdir(settingsDir, { recursive: true });
  await writeFile(
    join(settingsDir, "setting.json"),
    JSON.stringify(
      {
        // 固定英文，避免系统语言影响按钮文案；与 E2E 选择器保持一致。
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
  // occupation → interface mode → preferences：前两步 Skip，最后一步 Get started 保存跳过记录。
  for (let step = 0; step < 2; step += 1) {
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    await page.waitForTimeout(200);
  }
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await onboarding.waitFor({ state: "detached", timeout: 30_000 });
  return true;
}

/**
 * 只记录生产代码创建的 returnTarget 与 finish 结果；设备管理入口由生产 props 开启，
 * 不再注入 allowDeviceManagement。
 */
async function instrumentDeviceReturnTracking(page) {
  const result = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="virtual-project-name"]');
    const fiberKey = node && Object.keys(node).find((key) => key.startsWith("__reactFiber$"));
    let fiber = fiberKey ? node[fiberKey] : null;
    let target = null;
    for (let current = fiber; current; current = current.return) {
      const props = current.memoizedProps;
      if (
        props &&
        typeof props === "object" &&
        "allowDeviceManagement" in props &&
        typeof props.onCreateTask === "function" &&
        "remoteService" in props
      ) {
        target = current;
        break;
      }
    }
    if (!target) return { ok: false, reason: "ProjectCreation fiber not found" };

    window.__deviceReturnSmoke = { opened: [] };
    const originalOpen = target.memoizedProps.onOpenRemoteWorkspace;
    if (typeof originalOpen !== "function") {
      return { ok: false, reason: "ProjectCreation.onOpenRemoteWorkspace is not a function" };
    }
    target.memoizedProps.onOpenRemoteWorkspace = (preference) => {
      const record = {
        completion: preference?.completion ?? null,
        kind: preference?.returnTarget?.kind ?? null,
        results: [],
      };
      window.__deviceReturnSmoke.opened.push(record);
      const returnTarget = preference?.returnTarget;
      if (returnTarget && typeof returnTarget.finish === "function") {
        const originalFinish = returnTarget.finish;
        returnTarget.finish = async (value) => {
          record.results.push(value);
          return originalFinish(value);
        };
      }
      return originalOpen(preference);
    };

    // 触发 ProjectCreation 重渲染，让包装后的 onOpenRemoteWorkspace 进入本次闭包。
    for (let hook = target.memoizedState; hook; hook = hook.next) {
      const state = hook.memoizedState;
      if (
        hook.queue?.dispatch &&
        state &&
        typeof state === "object" &&
        "workspaceKey" in state &&
        "draftProjectId" in state
      ) {
        hook.queue.dispatch({ ...state });
        return { ok: true };
      }
    }
    return { ok: false, reason: "ProjectCreation originDraft hook not found" };
  });
  assert.equal(result.ok, true, `无法启用设备管理入口：${result.reason ?? "unknown"}`);
}

async function openProjectCreation(page) {
  const addProject = page.getByTestId("virtual-project-add");
  await addProject.waitFor({ timeout: 60_000 });
  await addProject.click();
  await page.getByTestId("virtual-project-name").waitFor({ timeout: 20_000 });
}

async function openAddDeviceWizard(page) {
  await page.getByTestId("virtual-project-device").click();
  const addDevice = page.getByRole("option", { name: /Add remote device/ });
  await addDevice.waitFor({ timeout: 10_000 });
  await addDevice.click();
  const dialog = page.getByTestId("ssh-dialog");
  await dialog.waitFor({ timeout: 20_000 });
  return dialog;
}

async function waitForRecordedResults(page, expectedCount, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let snapshot = null;
  while (Date.now() < deadline) {
    snapshot = await page.evaluate(() => window.__deviceReturnSmoke?.opened ?? []);
    const pending = snapshot.find((entry) => entry.results.length < 1);
    if (!pending && snapshot.length >= expectedCount) return snapshot;
    await page.waitForTimeout(200);
  }
  throw new Error(
    `等待 returnTarget finish 超时：${JSON.stringify(snapshot)}\n` +
      "若向导仍在 connecting，检查 kayingcode:connect-remote IPC 重定向与 server-core 日志。",
  );
}

const tempRoot = await mkdtemp(join(tmpdir(), "kayingcode-device-return-e2e-"));
const homeDir = join(tempRoot, "home");
const workspacePath = join(tempRoot, "workspace");
const dataBaseDir = join(tempRoot, "data");
const userDataDir = join(tempRoot, "user-data");
const sessionDataDir = join(tempRoot, "session-data");
const serverDataBase = join(tempRoot, "server-data");
const serverRoot = join(serverDataBase, ".kayingcode", "server");
const agentBundleTarget = join(dataBaseDir, ".kayingcode", "server", "agents", "glm", "kayingcode.cjs");

let serverChild;
let electronApp;
let page;
let pageErrors = [];
let connectState;
let disposeState;

try {
  assertBuildArtifacts();
  const agentBundle = resolveAgentBundle();
  for (const dir of [homeDir, workspacePath, dataBaseDir, userDataDir, sessionDataDir, serverDataBase]) {
    await mkdir(dir, { recursive: true });
  }
  await mkdir(join(serverDataBase, ".kayingcode", "v2"), { recursive: true });
  await writeFile(
    join(serverDataBase, ".kayingcode", "v2", "setting.json"),
    JSON.stringify({
      lastWorkspaceSession: [{ kind: "local", workspacePath: join(tempRoot, "server-workspace") }],
    }),
    "utf8",
  );
  await seedDesktopSettings({ homeDir, workspacePath });

  // Host 从 data base dir 的 agents/glm 直接发现 bundle；不写仓库、不依赖启动 cwd。
  await mkdir(join(dataBaseDir, ".kayingcode", "server", "agents", "glm"), { recursive: true });
  await cp(agentBundle, agentBundleTarget);
  log(`agent bundle staged from ${agentBundle}`);

  serverChild = spawn(process.execPath, [coreEntry, "0"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      KAYINGCODE_DATA_BASE_DIR: serverDataBase,
      KAYINGCODE_DESKTOP_SETTINGS_BASE_DIR: serverDataBase,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let serverStderr = "";
  serverChild.stderr.on("data", (chunk) => {
    serverStderr += chunk.toString();
  });
  let ready;
  try {
    ready = await waitForServerReady(serverChild);
  } catch (error) {
    throw new Error(`${error.message}\nserver stderr tail:\n${serverStderr.slice(-4_000)}`);
  }
  const token = (await readFile(join(serverRoot, "run", "ingress-token"), "utf8")).trim();
  const serverUrl = `http://127.0.0.1:${ready.port}`;
  log(`server-core ready url=${serverUrl}`);

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, {
    KAYINGCODE_DESKTOP_HOME_DIR: homeDir,
    KAYINGCODE_DESKTOP_SETTINGS_BASE_DIR: homeDir,
    KAYINGCODE_DESKTOP_USER_DATA_DIR: userDataDir,
    KAYINGCODE_DESKTOP_SESSION_DATA_DIR: sessionDataDir,
    KAYINGCODE_DATA_BASE_DIR: dataBaseDir,
    KAYINGCODE_DESKTOP_APPLICATION_NAME: `KayingCode Device Return E2E ${process.pid}`,
  });

  electronApp = await _electron.launch({
    executablePath: electronPath,
    args: [desktopRoot],
    env,
    timeout: 120_000,
  });

  // Host 现在实现 onDynamicTaskUnreadSignal；仅在需要复现旧 Host 缺陷时显式注入丢弃。
  if (process.env.KAYINGCODE_E2E_DROP_UNREAD === "1") {
    await electronApp.context().addInitScript(({ eventName }) => {
      const originalPostMessage = MessagePort.prototype.postMessage;
      const decoder = new TextDecoder();
      window.__deviceReturnSmokeUnreadListensDropped = 0;
      MessagePort.prototype.postMessage = function (message, transfer) {
        try {
          let text = "";
          if (message instanceof ArrayBuffer) {
            text = decoder.decode(new Uint8Array(message));
          } else if (ArrayBuffer.isView(message)) {
            text = decoder.decode(
              new Uint8Array(message.buffer, message.byteOffset, message.byteLength),
            );
          }
          if (text.includes(eventName)) {
            window.__deviceReturnSmokeUnreadListensDropped += 1;
            return;
          }
        } catch {
          /* 非文本帧原样转发 */
        }
        return originalPostMessage.call(this, message, transfer);
      };
    }, { eventName: unsupportedUnreadEvent });
  }

  page = await electronApp.firstWindow({ timeout: 120_000 });
  page.on("console", (message) => {
    if (message.type() === "error") log(`[renderer:error] ${message.text().slice(0, 400)}`);
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
    log(`[renderer:pageerror] ${error.message}`);
  });
  await page.waitForLoadState("domcontentloaded");

  const skipped = await skipOnboardingIfPresent(page);
  log(`onboarding skipped=${skipped}`);
  await openProjectCreation(page);
  log("project creation opened via real sidebar entry");

  // Main IPC 包装必须在 handler 注册完成后执行（首窗 UI 已就绪）。
  const ipcPatch = await electronApp.evaluate(
    ({ ipcMain }, { connectChannel, disposeChannel, url, token }) => {
      const handlers = ipcMain._invokeHandlers;
      const originalConnect = handlers?.get?.(connectChannel);
      const originalDispose = handlers?.get?.(disposeChannel);
      if (typeof originalConnect !== "function" || typeof originalDispose !== "function") {
        return {
          ok: false,
          hasConnect: typeof originalConnect,
          hasDispose: typeof originalDispose,
        };
      }
      globalThis.__deviceReturnSmokeIpc = {
        connects: [],
        disposes: [],
      };
      ipcMain.removeHandler(connectChannel);
      ipcMain.handle(connectChannel, async (event, payload) => {
        const rewritten = {
          ...payload,
          target: { kind: "server", url, token },
          // 向导首连不带 workspacePath；补上后 Host 才能生成稳定 workspace scope。
          workspacePath: "/",
        };
        const entry = { formKind: payload?.target?.kind ?? null };
        globalThis.__deviceReturnSmokeIpc.connects.push(entry);
        const result = await originalConnect(event, rewritten);
        entry.result = result;
        return result;
      });
      ipcMain.removeHandler(disposeChannel);
      ipcMain.handle(disposeChannel, async (event, sessionId) => {
        globalThis.__deviceReturnSmokeIpc.disposes.push(sessionId);
        return originalDispose(event, sessionId);
      });
      return { ok: true };
    },
    { connectChannel, disposeChannel, url: serverUrl, token },
  );
  assert.equal(ipcPatch.ok, true, `无法包装 Main IPC：${JSON.stringify(ipcPatch)}`);

  // ProjectSidebar/ProjectComposerMenu 现在按 onOpenRemoteWorkspace 开启设备管理入口；
  // 不再注入 ProjectCreation prop，直接走真实 UI。
  await instrumentDeviceReturnTracking(page);
  log("device return tracking instrumented; real device-management entry enabled by production props");

  // ---- 路径 1：取消 -------------------------------------------------------
  let wizard = await openAddDeviceWizard(page);
  log("wizard opened from real 'Add remote device…' item");
  // 向导打开时 ProjectCreation 由 suspended 关闭；等 Radix 退出动画结束后再断言。
  await page.getByTestId("virtual-project-name").waitFor({ state: "hidden", timeout: 10_000 });
  assert.equal(await page.getByTestId("virtual-project-name").isVisible(), false);
  await wizard.getByRole("button", { name: "Close", exact: true }).click();
  await wizard.waitFor({ state: "detached", timeout: 30_000 });
  await page.getByTestId("virtual-project-name").waitFor({ state: "visible", timeout: 20_000 });
  let opened = await waitForRecordedResults(page, 1);
  assert.equal(opened[0].completion, "device-management");
  assert.equal(opened[0].kind, "add-device");
  assert.deepEqual(opened[0].results, [{ kind: "cancelled" }]);
  const deviceAfterCancel = await page.getByTestId("virtual-project-device").innerText();
  assert.match(deviceAfterCancel, /This computer/i, "取消后设备选择应保持原值（本机）");
  log(`cancelled path delivered: ${JSON.stringify(opened[0].results)}; device=${JSON.stringify(deviceAfterCancel)}`);

  // ---- 路径 2：连接成功 ---------------------------------------------------
  wizard = await openAddDeviceWizard(page);
  await wizard.getByTestId("remote-kind-ssh").click();
  await wizard.getByRole("button", { name: "Next", exact: true }).click();
  await wizard.getByTestId("ssh-host-input").fill("127.0.0.1");
  await wizard.getByTestId("ssh-username-input").fill("e2e");
  await wizard.getByTestId("ssh-password-input").fill("e2e-password");
  await wizard.getByRole("button", { name: "Start connection", exact: true }).click();
  await wizard.waitFor({ state: "detached", timeout: 60_000 });
  await page.getByTestId("virtual-project-name").waitFor({ state: "visible", timeout: 20_000 });
  opened = await waitForRecordedResults(page, 2);
  assert.equal(opened.length, 2, "设备管理入口应只打开两次（cancelled + connected）");
  assert.equal(opened[1].results.length, 1, "connected finish 必须且只能投递一次");
  const connected = opened[1].results[0];
  assert.equal(opened[1].completion, "device-management");
  assert.equal(opened[1].kind, "add-device");
  assert.equal(connected.kind, "connected");
  assert.equal(typeof connected.sourceServerId, "string");
  assert.ok(connected.sourceServerId.length > 0, "connected 结果必须带稳定 sourceServerId");

  const deviceAfterConnect = await page.getByTestId("virtual-project-device").innerText();
  assert.match(deviceAfterConnect, /remote:server:/, "连接成功后设备选择应切到远端设备");
  assert.ok(
    deviceAfterConnect.toLowerCase().includes(connected.sourceServerId.toLowerCase()),
    `设备选择 ${JSON.stringify(deviceAfterConnect)} 应包含 sourceServerId ${connected.sourceServerId}`,
  );

  connectState = await electronApp.evaluate(() => globalThis.__deviceReturnSmokeIpc);
  disposeState = connectState?.disposes ?? [];
  assert.equal(connectState.connects.length, 1, "connected 路径应只发起一次连接");
  assert.equal(connectState.connects[0].formKind, "ssh", "真实向导应提交 SSH 表单 target");
  assert.equal(connectState.connects[0].result?.success, true);
  assert.deepEqual(disposeState, [], "设备管理向导成功关闭时不得 dispose session");

  const sessionId = connectState.connects[0].result.sessionId;
  const bind = await page.evaluate(async ({ sessionId }) => {
    try {
      const result = await window.kayingcode.bindRemoteWorkspaceSessionContext({
        remoteSessionId: sessionId,
        workspacePath: "/",
      });
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }, { sessionId });
  assert.equal(bind.ok, true, `返回原项目页后 session 应仍可用：${bind.error ?? ""}`);
  assert.equal(bind.result.sourceServerId, connected.sourceServerId);
  const attachment = await page.evaluate(async ({ sourceServerId }) => {
    try {
      return {
        ok: true,
        result: await window.kayingcode.requestSourceSettingsAttachment(sourceServerId),
      };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }, { sourceServerId: connected.sourceServerId });
  assert.equal(attachment.ok, true, `source-settings attachment 应可用：${attachment.error ?? ""}`);
  assert.match(attachment.result.attachmentId, /^source-settings-/);

  connectState = await electronApp.evaluate(() => globalThis.__deviceReturnSmokeIpc);
  assert.deepEqual(connectState.disposes, [], "校验期间不得 dispose session");
  log(
    `connected path delivered: ${JSON.stringify(connected)}; session=${sessionId}; ` +
      `device=${JSON.stringify(deviceAfterConnect)}; attachment=${attachment.result.attachmentId}`,
  );

  if (process.env.KAYINGCODE_E2E_DROP_UNREAD === "1") {
    const dropped = await page.evaluate(() => window.__deviceReturnSmokeUnreadListensDropped);
    log(`unsupported unread-event listens dropped=${dropped} (legacy Host repro)`);
  }
  assert.deepEqual(pageErrors, [], `renderer pageerror: ${pageErrors.join(" | ")}`);
  log(
    "PASS device returnTarget E2E: real ProjectCreation -> SSHDialog -> connected/cancelled delivery, " +
      "session preserved, device selection restored",
  );
} catch (error) {
  console.error(`${LOG_PREFIX} FAILED:`, error);
  process.exitCode = 1;
} finally {
  try {
    if (page && connectState === undefined) {
      connectState = await electronApp?.evaluate(() => globalThis.__deviceReturnSmokeIpc).catch(() => undefined);
    }
    const sessionId = connectState?.connects?.find((entry) => entry.result?.success)?.result?.sessionId;
    if (page && sessionId) {
      await page
        .evaluate(async ({ sessionId }) => {
          try {
            await window.kayingcode.disposeRemoteSession(sessionId);
          } catch {
            /* 清理失败不覆盖测试结论 */
          }
        }, { sessionId })
        .catch(() => undefined);
    }
  } finally {
    await electronApp?.close().catch(() => undefined);
    await stopChild(serverChild);
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
