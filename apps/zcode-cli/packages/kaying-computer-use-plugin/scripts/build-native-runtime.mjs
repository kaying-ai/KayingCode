import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildComputerUsePluginWrapper } from "./build.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = join(packageRoot, "vendor", "kaying-computer-use");

function parseArgs(argv) {
  const options = {
    platform: process.env.KAYINGCODE_TARGET_OS || process.platform,
    arch: process.env.KAYINGCODE_TARGET_ARCH || process.arch,
    fromDist: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--platform" || value === "--arch" || value === "--from-dist") {
      const next = argv[index + 1];
      if (!next) throw new Error(`${value} requires a value`);
      if (value === "--platform") options.platform = next;
      if (value === "--arch") options.arch = next;
      if (value === "--from-dist") options.fromDist = resolve(next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }
  // 修复：桌面打包链路（bundle.mjs）注入的 KAYINGCODE_TARGET_OS 使用 mac/win/linux 别名，
  // 与 packages/desktop/scripts/target-platform.mjs 的别名集保持同一约定。此前这里只接受
  // windows/macos，导致 bun run package / bundle:desktop 在 Windows 与 macOS 宿主上
  // 构建内置 CUA 运行时阶段直接抛 Unsupported target platform（Linux 恰好同名未暴露）。
  if (options.platform === "windows" || options.platform === "win") options.platform = "win32";
  if (options.platform === "macos" || options.platform === "mac" || options.platform === "osx") {
    options.platform = "darwin";
  }
  if (options.arch === "amd64" || options.arch === "x86_64") options.arch = "x64";
  if (!new Set(["win32", "linux", "darwin"]).has(options.platform)) {
    throw new Error(`Unsupported Computer Use target platform: ${options.platform}`);
  }
  if (!new Set(["x64", "arm64"]).has(options.arch)) {
    throw new Error(`Unsupported Computer Use target architecture: ${options.arch}`);
  }
  return options;
}

async function run(command, args, cwd, env = process.env) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} failed (${signal ?? code ?? "unknown"})`));
    });
  });
}

function upstreamArch(platform, arch) {
  if (platform === "darwin") return arch === "x64" ? "x86_64" : "arm64";
  return arch === "x64" ? "amd64" : "arm64";
}

function toBashPath(path) {
  if (process.platform !== "win32") return path;
  return path
    .replace(/^([A-Za-z]):[\\/]/u, (_match, drive) => `/mnt/${drive.toLowerCase()}/`)
    .replaceAll("\\", "/");
}

function runtimeSource(distRoot, platform, arch) {
  const sourceArch = upstreamArch(platform, arch);
  if (platform === "win32") {
    return join(distRoot, "windows", sourceArch, "kaying-computer-use.exe");
  }
  if (platform === "linux") {
    return join(distRoot, "linux", sourceArch, "kaying-computer-use");
  }
  return join(distRoot, "Kaying Computer Use.app");
}

function runtimeDestination(platform, arch) {
  const root = join(packageRoot, "native", `${platform}-${arch}`);
  if (platform === "win32") return join(root, "kaying-computer-use.exe");
  if (platform === "linux") return join(root, "kaying-computer-use");
  return join(root, "Kaying Computer Use.app");
}

async function assertExists(path) {
  await stat(path).catch(() => {
    throw new Error(`Computer Use build did not produce expected runtime: ${path}`);
  });
}

async function buildFromVendor(platform, arch, outputRoot) {
  const sourceArch = upstreamArch(platform, arch);
  if (platform === "darwin") {
    await run(
      "bash",
      [
        "scripts/build-open-computer-use-app.sh",
        "--configuration",
        "release",
        "--arch",
        sourceArch,
      ],
      vendorRoot,
    );
    return join(vendorRoot, "dist");
  }

  // Windows release runner 不一定有 MSYS/Git Bash；直接调用 Go 也避免 Windows 路径被
  // WSL/MSYS 以不同规则重写。CGO=0 的上游 runtime 支持从 Windows 交叉编译 Linux。
  if (process.platform === "win32") {
    const outputDirectory = join(
      outputRoot,
      platform === "win32" ? "windows" : "linux",
      sourceArch,
    );
    const outputPath = join(
      outputDirectory,
      platform === "win32" ? "kaying-computer-use.exe" : "kaying-computer-use",
    );
    await mkdir(outputDirectory, { recursive: true });
    const upstreamPackage = JSON.parse(await readFile(join(vendorRoot, "package.json"), "utf8"));
    await run(
      "go",
      [
        "build",
        "-trimpath",
        "-ldflags",
        `-s -w -X main.version=${upstreamPackage.version}`,
        "-o",
        outputPath,
        ".",
      ],
      join(
        vendorRoot,
        "apps",
        platform === "win32" ? "OpenComputerUseWindows" : "OpenComputerUseLinux",
      ),
      {
        ...process.env,
        CGO_ENABLED: "0",
        GOARCH: sourceArch,
        GOOS: platform === "win32" ? "windows" : "linux",
      },
    );
    return outputRoot;
  }

  const scriptName =
    platform === "win32"
      ? "build-open-computer-use-windows.sh"
      : "build-open-computer-use-linux.sh";
  await run(
    "bash",
    [
      `scripts/${scriptName}`,
      "--configuration",
      "release",
      "--arch",
      sourceArch,
      "--out-dir",
      toBashPath(join(outputRoot, platform === "win32" ? "windows" : "linux")),
    ],
    vendorRoot,
  );
  return outputRoot;
}

const options = parseArgs(process.argv.slice(2));
await buildComputerUsePluginWrapper();
const destination = runtimeDestination(options.platform, options.arch);
if (!options.fromDist && existsSync(destination)) {
  // 预构建原生运行时随仓库分发（win32 产物已入库，与 native-search 依赖同一“回填仓库”模式）。
  // 目标产物已存在时跳过 vendor 重编，桌面打包不再强制要求本机安装 Go 工具链；
  // vendor 升级后删除 native/<platform>-<arch>/ 产物，或用 --from-dist 显式注入即可触发重编。
  process.stdout.write(`[computer-use] reuse staged runtime: ${destination}\n`);
} else {
  const tempRoot = await mkdtemp(join(tmpdir(), "kayingcode-computer-use-"));
  try {
    const distRoot =
      options.fromDist ?? (await buildFromVendor(options.platform, options.arch, tempRoot));
    const source = runtimeSource(distRoot, options.platform, options.arch);
    await assertExists(source);
    await rm(destination, { recursive: true, force: true });
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { recursive: true, force: true, preserveTimestamps: true });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
process.stdout.write(
  `[computer-use] staged ${options.platform}/${options.arch}: ${basename(destination)}\n`,
);
