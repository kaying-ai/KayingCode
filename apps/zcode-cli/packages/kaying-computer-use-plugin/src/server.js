import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const pluginRoot =
  basename(moduleDirectory) === "mcp" && basename(dirname(moduleDirectory)) === "dist"
    ? resolve(moduleDirectory, "..", "..")
    : resolve(moduleDirectory, "..");

const ARCH_DIRECTORY = {
  arm64: "arm64",
  x64: "x64",
};

export function runtimeRelativePath(platform, arch) {
  if (!(arch in ARCH_DIRECTORY)) {
    throw new Error(`Computer Use does not support architecture ${arch}`);
  }
  const platformKey = `${platform}-${ARCH_DIRECTORY[arch]}`;
  if (platform === "win32") {
    return join("native", platformKey, "kaying-computer-use.exe");
  }
  if (platform === "linux") {
    return join("native", platformKey, "kaying-computer-use");
  }
  if (platform === "darwin") {
    return join(
      "native",
      platformKey,
      "Kaying Computer Use.app",
      "Contents",
      "MacOS",
      "OpenComputerUse",
    );
  }
  throw new Error(`Computer Use does not support platform ${platform}`);
}

export function resolveNativeRuntime(options = {}) {
  const root = options.pluginRoot ?? pluginRoot;
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  return resolve(root, runtimeRelativePath(platform, arch));
}

async function prepareMacPermissions(runtimePath, spawnProcess, options) {
  // 上游把 TCC 权限绑定在 .app 身份。直接只跑 `mcp` 时，缺权限只会在首个工具调用后报错，
  // 用户又没有全局 CLI 可执行 doctor；因此由内置 wrapper 在 MCP 启动前触发一次上游 doctor。
  // 已授权时它立即退出，缺权限时由常驻 app agent 展示原生 onboarding。
  const doctor = spawnProcess(runtimePath, ["doctor"], {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  doctor.stderr.pipe(process.stderr);
  await new Promise((resolveExit, reject) => {
    doctor.once("error", reject);
    doctor.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Computer Use permission doctor exited from signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Computer Use permission doctor exited with code ${code ?? 1}`));
        return;
      }
      resolveExit();
    });
  });
}

export async function runNativeRuntime(options = {}) {
  const runtimePath = resolveNativeRuntime(options);
  const fileExists = options.existsSync ?? existsSync;
  if (!fileExists(runtimePath)) {
    const lockVersion = options.lockVersion ?? "see upstream-lock.json";
    throw new Error(
      `Computer Use native runtime is missing for ${options.platform ?? process.platform}/${options.arch ?? process.arch} ` +
        `(${lockVersion}): ${runtimePath}`,
    );
  }

  const spawnProcess = options.spawn ?? spawn;
  if ((options.platform ?? process.platform) === "darwin") {
    await prepareMacPermissions(runtimePath, spawnProcess, options);
  }
  // 内置插件默认启用 Windows foreground 真实输入策略：Blender 等只读原始输入的
  // app 会忽略 PostMessage 后台投递，用户环境变量仍可显式覆盖回 background。
  const childEnv = { ...(options.env ?? process.env) };
  if (!childEnv.KAYING_COMPUTER_USE_WINDOWS_INPUT_POLICY) {
    childEnv.KAYING_COMPUTER_USE_WINDOWS_INPUT_POLICY = "foreground";
  }
  const child = spawnProcess(runtimePath, ["mcp"], {
    cwd: options.cwd ?? process.cwd(),
    env: childEnv,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  process.stdin.pipe(child.stdin);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  const forwardSigint = () => forwardSignal("SIGINT");
  const forwardSigterm = () => forwardSignal("SIGTERM");
  process.once("SIGINT", forwardSigint);
  process.once("SIGTERM", forwardSigterm);

  try {
    return await new Promise((resolveExit, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (signal) {
          reject(new Error(`Computer Use native runtime exited from signal ${signal}`));
          return;
        }
        resolveExit(code ?? 1);
      });
    });
  } finally {
    process.off("SIGINT", forwardSigint);
    process.off("SIGTERM", forwardSigterm);
  }
}

export async function main() {
  const code = await runNativeRuntime();
  if (code !== 0) {
    throw new Error(`Computer Use native runtime exited with code ${code}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(
      `Computer Use server failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
