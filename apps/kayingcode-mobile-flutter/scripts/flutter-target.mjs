import { spawn } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 原生 KayingCode adapter 已退役，不能生成看似支持旧协议的制品。
if (process.argv.includes("--native-kayingcode")) {
  throw new Error("原生 KayingCode 已退役，请使用 V2 Web 授权链接。");
}

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
const action = process.argv[3] ?? "check";

function run(program, args, { capture = false, env = process.env } = {}) {
  return new Promise((done, fail) => {
    const isBatch = process.platform === "win32" && program.toLowerCase().endsWith(".bat");
    const command = isBatch ? [program, ...args].map((arg) => `"${arg}"`).join(" ") : program;
    const child = spawn(command, isBatch ? [] : args, {
      cwd: appRoot,
      env,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
      shell: isBatch,
    });
    let output = "";
    if (capture) child.stdout.on("data", (chunk) => (output += chunk));
    child.on("error", fail);
    child.on("close", (code) => {
      if (code === 0) return done(output);
      const error = new Error(`${program} 退出码 ${code}`);
      error.alreadyReported = !capture;
      fail(error);
    });
  });
}

async function lockedHostedUrl() {
  const lines = (await readFile(join(appRoot, "pubspec.lock"), "utf8")).split(/\r?\n/);
  const urls = new Set();
  let source = null;
  let url = null;
  function flush() {
    if (source === "hosted" && url) urls.add(url);
    source = null;
    url = null;
  }
  for (const line of lines) {
    if (/^  \S[^:]*:$/.test(line)) flush();
    const sourceMatch = /^    source: (\S+)$/.exec(line);
    if (sourceMatch) source = sourceMatch[1];
    const urlMatch = /^      url: "([^"]+)"$/.exec(line);
    if (urlMatch) url = urlMatch[1];
  }
  flush();
  if (urls.size !== 1)
    throw new Error(`pubspec.lock 需要唯一 hosted 包源，实际找到 ${urls.size} 个。`);
  return [...urls][0];
}

async function upstreamFlutter() {
  const fvmrc = JSON.parse(await readFile(join(appRoot, ".fvmrc"), "utf8"));
  const legacyPin = (await readFile(join(appRoot, ".flutter-version"), "utf8")).trim();
  if (fvmrc.flutter !== legacyPin) {
    throw new Error(
      `上游 Flutter 版本配置不一致：.fvmrc=${fvmrc.flutter}，.flutter-version=${legacyPin}。`,
    );
  }
  const sdk = await realpath(join(appRoot, ".fvm", "flutter_sdk"));
  const flutter = join(sdk, "bin", process.platform === "win32" ? "flutter.bat" : "flutter");
  await stat(flutter);
  const versionOutput = await run(flutter, ["--version", "--machine"], { capture: true });
  // 新 SDK 首次启动会在 stdout 输出下载进度和工具初始化日志，版本 JSON 在最后。
  const output = versionOutput.trim();
  const details = JSON.parse(output.slice(output.lastIndexOf("\n{") + 1));
  if (details.frameworkVersion !== fvmrc.flutter || details.frameworkVersion.includes("ohos")) {
    throw new Error(
      `当前 .fvm/flutter_sdk 是 ${details.frameworkVersion}，需要上游 Flutter ${fvmrc.flutter}。请重新执行 fvm use ${fvmrc.flutter}。`,
    );
  }
  console.log(`[${target}] 上游 Flutter ${details.frameworkVersion}：${sdk}`);
  return flutter;
}

async function main() {
  if (!["android", "ios", "windows", "ohos"].includes(target)) {
    throw new Error(
      "用法：node scripts/flutter-target.mjs <android|ios|windows|ohos> [check|pub-get|analyze|test|debug|release|bundle|configure]",
    );
  }
  if (target === "ohos") {
    await run(process.execPath, [
      join(appRoot, "scripts", "build-ohos.mjs"),
      action,
      ...process.argv.slice(4),
    ]);
    return;
  }
  const supportedActions = ["check", "pub-get", "analyze", "test", "debug", "release"];
  if (target === "android") supportedActions.push("bundle");
  if (!supportedActions.includes(action)) {
    throw new Error(
      `${target} 不支持 ${action}；可用 check、pub-get、analyze、test、debug、release、bundle。`,
    );
  }
  const flutter = await upstreamFlutter();
  if (action === "check") return;
  if (action === "pub-get") {
    const url = await lockedHostedUrl();
    console.log(`[${target}] 使用锁文件包源：${url}`);
    return run(
      flutter,
      ["pub", "get", ...(process.argv.includes("--update-lockfile") ? [] : ["--enforce-lockfile"])],
      {
        env: { ...process.env, PUB_HOSTED_URL: url },
      },
    );
  }
  if (action === "analyze") return run(flutter, ["analyze", "--no-pub"]);
  if (action === "test") return run(flutter, ["test", "--no-pub"]);
  if (target === "windows") {
    if (process.platform !== "win32") throw new Error("Windows 构建需要在 Windows 上执行。");
    return run(flutter, ["build", "windows", `--${action}`, "--no-pub"]);
  }
  if (target === "android") {
    if (action === "bundle") return run(flutter, ["build", "appbundle", "--release", "--no-pub"]);
    return run(process.execPath, [join(appRoot, "scripts", "build-android-apk.mjs"), action]);
  }
  if (process.platform !== "darwin") throw new Error("iOS 构建需要在 macOS 上执行。");
  return run(
    flutter,
    action === "debug"
      ? ["build", "ios", "--simulator", "--debug", "--no-pub"]
      : ["build", "ipa", "--release", "--no-pub"],
  );
}

main().catch((error) => {
  if (!error.alreadyReported) console.error(`[flutter-target] ${error.message}`);
  process.exitCode = 1;
});
