import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { pathToFileURL } from "node:url";
import { createDevLauncherLifetime } from "./devLauncherLifetime.mjs";

const require = createRequire(import.meta.url);
const electronRoot = dirname(require.resolve("electron/package.json"));
const electronBinary =
  process.platform === "win32"
    ? join(electronRoot, "dist/electron.exe")
    : process.platform === "darwin"
      ? join(electronRoot, "dist/Electron.app/Contents/MacOS/Electron")
      : join(electronRoot, "dist/electron");
const root = await mkdtemp(join(tmpdir(), "desktop-dev-lifetime-"));
const fixture = join(root, "fixture.mjs");
const source = await readFile(
  resolve(import.meta.dirname, "../src/main/desktopDevLifecycle.ts"),
  "utf8",
);
await writeFile(
  join(root, "lifetime.mjs"),
  ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText,
);
await writeFile(
  fixture,
  `
import { app, BrowserWindow } from "electron";
import { writeFile } from "node:fs/promises";
import { connectDesktopDevLauncherLifetime, canUseWindowsDesktopTray } from "./lifetime.mjs";
app.whenReady().then(() => {
const win = new BrowserWindow({ show: false });
if (canUseWindowsDesktopTray(process.platform, app.isPackaged)) throw new Error("Dev tray enabled");
app.on("before-quit", () => console.log("QUIT"));
const lifetime = connectDesktopDevLauncherLifetime({ isPackaged: app.isPackaged, port: process.env.KAYINGCODE_DESKTOP_DEV_LIFETIME_PORT, token: process.env.KAYINGCODE_DESKTOP_DEV_LIFETIME_TOKEN, requestQuit: () => { void writeFile(process.env.KAYINGCODE_LIFETIME_TEST_MARKER, "quit").then(() => app.quit()); } });
lifetime.once("connect", () => console.log("READY"));
});
`,
);
await writeFile(
  join(root, "package.json"),
  JSON.stringify({ name: "desktop-dev-lifetime-test", main: "fixture.mjs", type: "module" }),
);
const relay = join(root, "relay.mjs");
await writeFile(
  relay,
  `
import { spawn } from "node:child_process";
import { createDevLauncherLifetime } from ${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "devLauncherLifetime.mjs")).href)};
const lifetime = await createDevLauncherLifetime();
const child = spawn(${JSON.stringify(electronBinary)}, [${JSON.stringify(root)}], { env: { ...process.env, ...lifetime.env }, stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
console.log("PID " + child.pid);
`,
);

const children = [];
const lifetimes = [];
try {
  for (const abruptParentExit of [false, true]) {
    const lifetime = abruptParentExit ? null : await createDevLauncherLifetime();
    const marker = join(root, `quit-${abruptParentExit}`);
    if (lifetime) lifetimes.push(lifetime);
    const child = spawn(
      abruptParentExit ? process.execPath : electronBinary,
      [abruptParentExit ? relay : root],
      {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: { ...process.env, ...lifetime?.env, KAYINGCODE_LIFETIME_TEST_MARKER: marker },
      },
    );
    children.push(child);
    let electronPid = child.pid;
    let output = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (abruptParentExit) {
        const match = output.match(/PID (\d+)/);
        if (match) electronPid = Number(match[1]);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const ready = new Promise((resolveReady, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Electron not ready: ${stderr}`)), 15000);
      child.stdout.on("data", () => {
        if (output.includes("READY")) {
          clearTimeout(timeout);
          resolveReady();
        }
      });
    });
    const finished = new Promise((resolveFinished, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Electron did not release stdout: ${stderr}`)),
        20000,
      );
      child.on("close", (code) => {
        clearTimeout(timeout);
        resolveFinished(code);
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    await ready;
    if (abruptParentExit) child.kill();
    else lifetime.close();
    const code = await finished;
    if (!abruptParentExit) assert.equal(code, 0);
    let confirmedExit = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const requestedQuit = await access(marker).then(
        () => true,
        () => false,
      );
      let running = true;
      try {
        process.kill(electronPid, 0);
      } catch {
        running = false;
      }
      if ((abruptParentExit || requestedQuit) && !running) {
        confirmedExit = true;
        break;
      }
      await delay(50);
    }
    assert.equal(
      confirmedExit,
      true,
      `Electron 不能在启动器退出后残留: abrupt=${abruptParentExit}`,
    );
  }
  console.log("Electron dev lifetime e2e: OK (connection close + abrupt launcher exit)");
} finally {
  for (const lifetime of lifetimes) lifetime.close();
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) child.kill();
  await rm(root, { recursive: true, force: true });
}
