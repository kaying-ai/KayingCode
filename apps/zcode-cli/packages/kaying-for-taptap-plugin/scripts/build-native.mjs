import { chmod, copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const packageRoot = resolve(import.meta.dirname, "..");

function normalizePlatform(value) {
  if (["mac", "macos", "osx", "darwin"].includes(value)) return "darwin";
  if (["win", "windows", "win32"].includes(value)) return "win32";
  return value;
}

function normalizeArch(value) {
  if (["x86_64", "amd64", "x64"].includes(value)) return "x64";
  if (["aarch64", "arm64"].includes(value)) return "arm64";
  return value;
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: packageRoot, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with ${code ?? signal ?? "unknown status"}`));
    });
  });
}

export async function buildTapTapNativeRuntime() {
  const targetPlatform =
    normalizePlatform(process.env.KAYINGCODE_TARGET_OS ?? "") || process.platform;
  const targetArch = normalizeArch(process.env.KAYINGCODE_TARGET_ARCH ?? "") || process.arch;
  const platformKey = `${targetPlatform}-${targetArch}`;
  const coreBinaryName =
    targetPlatform === "win32" ? "kaying-for-taptap-core.exe" : "kaying-for-taptap-core";
  const transcriptionBinaryName = targetPlatform === "win32" ? "t3m.exe" : "t3m";
  const coreDestination = join(packageRoot, "bin", platformKey, coreBinaryName);
  const transcriptionDestination = join(packageRoot, "bin", platformKey, transcriptionBinaryName);

  if (targetPlatform !== process.platform) {
    const existing = await Promise.all(
      [coreDestination, transcriptionDestination].map(async (destination) => {
        try {
          const value = await stat(destination);
          return value.isFile() && value.size > 0;
        } catch {
          return false;
        }
      }),
    );
    if (existing.every(Boolean)) {
      return { core: coreDestination, transcription: transcriptionDestination };
    }
    throw new Error(
      `Cannot build TapTap native runtimes for ${platformKey} on ${process.platform}-${process.arch}; provide CI-built artifacts.`,
    );
  }

  const targetTriple = resolveRustTargetTriple(targetPlatform, targetArch);
  const crossArch = targetArch !== process.arch;
  const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
  const commonArgs = ["--release", ...(crossArch ? ["--target", targetTriple] : [])];
  await run(cargo, ["build", "--manifest-path", "native/core/Cargo.toml", ...commonArgs]);
  await run(cargo, [
    "build",
    "--manifest-path",
    "native/threejs-to-taptapmaker/Cargo.toml",
    ...commonArgs,
  ]);
  const coreSource = join(
    packageRoot,
    "native/core/target",
    ...(crossArch ? [targetTriple] : []),
    "release",
    coreBinaryName,
  );
  const transcriptionSource = join(
    packageRoot,
    "native/threejs-to-taptapmaker/target",
    ...(crossArch ? [targetTriple] : []),
    "release",
    transcriptionBinaryName,
  );
  await mkdir(dirname(coreDestination), { recursive: true });
  await Promise.all([
    copyFile(coreSource, coreDestination),
    copyFile(transcriptionSource, transcriptionDestination),
  ]);
  if (targetPlatform !== "win32") {
    await Promise.all([chmod(coreDestination, 0o755), chmod(transcriptionDestination, 0o755)]);
  }
  return { core: coreDestination, transcription: transcriptionDestination };
}

function resolveRustTargetTriple(platform, arch) {
  const target = {
    "darwin-arm64": "aarch64-apple-darwin",
    "darwin-x64": "x86_64-apple-darwin",
    "linux-arm64": "aarch64-unknown-linux-gnu",
    "linux-x64": "x86_64-unknown-linux-gnu",
    "win32-arm64": "aarch64-pc-windows-msvc",
    "win32-x64": "x86_64-pc-windows-msvc",
  }[`${platform}-${arch}`];
  if (!target) throw new Error(`Unsupported TapTap native target: ${platform}-${arch}`);
  return target;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  // 修复依据：返回值扩展为两个二进制后，直接字符串插值会退化为 [object Object]，无法诊断产物路径。
  const nativePaths = await buildTapTapNativeRuntime();
  process.stdout.write(`[kaying-for-taptap] ${nativePaths.core}; ${nativePaths.transcription}\n`);
}
