import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const pluginRoot = fileURLToPath(new URL("..", import.meta.url));

export function resolveConnection(env = process.env) {
  const raw = env.BLENDER_PORT || "9876";
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535) {
    throw new Error("BLENDER_PORT 必须是 1–65535 的整数，且与 Blender 面板一致。");
  }
  return { host: env.BLENDER_HOST?.trim() || "localhost", port: Number(raw) };
}

export async function findExecutable(name, { env = process.env, explicit, candidates = [] } = {}) {
  const filename = process.platform === "win32" ? `${name}.exe` : name;
  const paths = explicit
    ? [explicit]
    : [
        ...(env.PATH || "")
          .split(delimiter)
          .filter(Boolean)
          .map((dir) => join(dir, filename)),
        ...candidates,
      ];
  for (const path of paths) {
    // GUI 启动通常没有终端 PATH；只探测已知位置，不通过 shell 拼接或执行用户配置。
    if (!isAbsolute(path)) continue;
    try {
      await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
      return path;
    } catch {
      /* Continue discovery. */
    }
  }
  return null;
}

export async function findUv(env = process.env) {
  const exe = process.platform === "win32" ? "uv.exe" : "uv";
  return findExecutable("uv", {
    env,
    explicit: env.KAYINGCODE_BLENDER_UV,
    candidates: [
      join(homedir(), ".local", "bin", exe),
      join(homedir(), ".cargo", "bin", exe),
      "/opt/homebrew/bin/uv",
      "/usr/local/bin/uv",
      "/usr/bin/uv",
    ],
  });
}

export function runtimePlan(root, lock, env = process.env) {
  if (!/^[a-f0-9]{40}$/.test(lock.commit)) throw new Error("Invalid upstream commit");
  const cacheBase =
    env.KAYINGCODE_BLENDER_CACHE ||
    (process.platform === "win32"
      ? join(
          env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
          "KayingCode",
          "Cache",
          "blender",
        )
      : join(env.XDG_CACHE_HOME || join(homedir(), ".cache"), "kayingcode", "blender"));
  const cache = join(resolve(cacheBase), lock.commit);
  const environment = join(cache, "environment");
  return {
    project: join(cache, "project"),
    source: join(root, "vendor", "mcp-for-blender"),
    args: [
      "run",
      "--frozen",
      "--no-dev",
      "--no-editable",
      "--python",
      "3.11",
      "--project",
      join(cache, "project"),
      "python",
      "-B",
      join(root, "scripts", "server.py"),
    ],
    python: join(
      environment,
      process.platform === "win32" ? "Scripts" : "bin",
      process.platform === "win32" ? "python.exe" : "python",
    ),
    env: { ...env, UV_PROJECT_ENVIRONMENT: environment, DISABLE_TELEMETRY: "true" },
  };
}

export async function capture(command, args, { env = process.env, timeoutMs = 5000 } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "",
      stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("检查超时"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk).slice(-65536);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-65536);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveRun(stdout.trim());
      else reject(new Error(stderr.trim() || `进程退出 ${code}`));
    });
  });
}
