#!/usr/bin/env node
/**
 * Desktop Host × Source Server 连接冒烟（Node 级，不启动 Electron）。
 *
 * 1. 用临时 KAYINGCODE_DATA_BASE_DIR 启动构建后的 server-core（IPC 上报 ready 端口）；
 * 2. 读取 run/ingress-token；
 * 3. 复用 Host 的 connectServerRemote + createServerRemoteWorkspaceServiceCollection；
 * 4. 验证 server-info、项目树、任务列表读取。
 *
 * 未覆盖：Electron utilityProcess 生命周期、窗口 attachment/MessagePort、
 * SSH/WSL/Docker 的 ConnectionManager 部署链路、source-settings attachment。
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(desktopRoot, "../..");
const coreEntry = join(repoRoot, "packages/zcode-server-cli/dist/server-core.js");
const dataBaseDir = await mkdtemp(join(tmpdir(), "kayingcode-source-smoke-"));
const serverRoot = join(dataBaseDir, ".kayingcode", "server");
const settingsDir = join(dataBaseDir, ".kayingcode", "v2");
const seededWorkspace = join(dataBaseDir, "smoke-workspace");
const seededProjectName = "smoke-workspace";
// 隔离用户真实设置；source-server 用服务器账户 HOME，冒烟必须显式指定。
await mkdir(settingsDir, { recursive: true });
await writeFile(
  join(settingsDir, "setting.json"),
  JSON.stringify(
    { lastWorkspaceSession: [{ kind: "local", workspacePath: seededWorkspace }] },
    null,
    2,
  ),
  "utf8",
);

function waitForReady(child, timeoutMs = 60_000) {
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
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolveStop) => {
    child.once("exit", () => resolveStop());
    child.kill();
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolveStop();
    }, 10_000).unref();
  });
}

const child = spawn(process.execPath, [coreEntry, "0"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    KAYINGCODE_DATA_BASE_DIR: dataBaseDir,
    KAYINGCODE_DESKTOP_SETTINGS_BASE_DIR: dataBaseDir,
  },
  stdio: ["ignore", "pipe", "pipe", "ipc"],
});
let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

let connection;
try {
  const ready = await waitForReady(child);
  const token = (await readFile(join(serverRoot, "run", "ingress-token"), "utf8")).trim();
  const url = `http://127.0.0.1:${ready.port}`;
  console.log(`[smoke] server-core ready url=${url}`);

  const { connectServerRemote } = await import("../src/host/serverRemoteConnection.ts");
  const { createServerRemoteWorkspaceServiceCollection } =
    await import("../src/host/remoteWorkspaceServiceCollection.ts");
  const servicesModule = await import("@zcode/services");

  connection = await connectServerRemote(
    { kind: "server", url, token },
    { signal: AbortSignal.timeout(30_000) },
  );
  console.log(
    `[smoke] connected serverId=${connection.serverInfo.serverId} version=${connection.serverInfo.version} workspaces=${connection.serverInfo.workspaces.length}`,
  );

  const services = createServerRemoteWorkspaceServiceCollection({
    clientConfigService: connection.services.clientConfigService,
    connectionServices: connection.services,
    ...(connection.serverInfo.capabilities.virtualProjects ? { virtualProjects: true } : {}),
    serverId: connection.serverInfo.serverId,
    targetKind: "server",
  });
  const tasks = services.get(servicesModule.IKayingCodeTaskService);
  const projects = services.get(servicesModule.IProjectService);
  const system = services.get(servicesModule.ISystemService);

  const info = await system.info();
  console.log(`[smoke] system.info platform=${info.platform} homedir=${info.homedir}`);
  const tree = await projects.readTree();
  console.log(
    `[smoke] project.readTree projects=${tree.projects.length} tasks=${tree.tasks.length} names=${tree.projects
      .slice(0, 5)
      .map((project) => project.name)
      .join(",")}`,
  );
  // 验证 database-startup 的 settings 项目种子确实落到 server 侧 tasks-index。
  if (!tree.projects.some((project) => project.name === seededProjectName)) {
    throw new Error(`settings project seed missing: ${seededProjectName}`);
  }
  // 种子项目对应的 workspace 是 server 自身文件系统路径，用它的 workspaceKey 查询任务。
  const seeded = tree.projects.find((project) => project.name === seededProjectName);
  const list = await tasks.listTasks({ workspacePath: seeded.roots[0].rootPath });
  console.log(`[smoke] task.listTasks workspace=${seeded.roots[0].rootPath} count=${list.length}`);

  console.log("[smoke] OK: Source Server host connection + seeded project + task read");
} catch (error) {
  console.error("[smoke] FAILED:", error);
  if (stderr.trim()) console.error("[smoke] server stderr tail:\n" + stderr.slice(-4_000));
  process.exitCode = 1;
} finally {
  try {
    connection?.dispose();
  } catch {
    /* 连接已关闭 */
  }
  await stopChild(child);
  await rm(dataBaseDir, { recursive: true, force: true }).catch(() => undefined);
}
