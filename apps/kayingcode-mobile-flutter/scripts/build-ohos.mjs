import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectDevecoSdk } from "./ohos-toolchain.mjs";

// 原生 KayingCode adapter 已退役，不能生成看似支持旧协议的制品。
if (process.argv.includes("--native-kayingcode")) {
  throw new Error("原生 KayingCode 已退役，请使用 V2 Web 授权链接。");
}

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = join(appRoot, "build");
const ohosLock = join(appRoot, "ohos", "flutter-pubspec.lock");
const localToolchainPath = join(appRoot, ".local", "ohos-toolchain.json");
const sdkPin = JSON.parse(await readFile(join(appRoot, "ohos", "flutter-sdk.json"), "utf8"));
const flutterPackages = "https://gitcode.com/CPF-Flutter/flutter_packages.git";

const packageRefs = {
  shared_preferences: [
    "packages/shared_preferences/shared_preferences",
    "shared_preferences-v2.5.4-ohos-1.0.1",
  ],
  shared_preferences_ohos: [
    "packages/shared_preferences/shared_preferences_ohos",
    "shared_preferences-v2.5.4-ohos-1.0.1",
  ],
  path_provider: ["packages/path_provider/path_provider", "provider-v2.1.5-ohos-1.0.1"],
  path_provider_ohos: ["packages/path_provider/path_provider_ohos", "provider-v2.1.5-ohos-1.0.1"],
  image_picker: ["packages/image_picker/image_picker", "image_picker-v1.2.1-ohos-1.0.1"],
  image_picker_ohos: ["packages/image_picker/image_picker_ohos", "image_picker-v1.2.1-ohos-1.0.1"],
  url_launcher: ["packages/url_launcher/url_launcher", "url_launcher_v6.3.2-ohos-1.0.2"],
  url_launcher_ohos: ["packages/url_launcher/url_launcher_ohos", "url_launcher_v6.3.2-ohos-1.0.2"],
};

function gitDependency(name, url, ref, path) {
  return [
    `  ${name}:`,
    "    git:",
    `      url: ${url}`,
    ...(path ? [`      path: ${path}`] : []),
    `      ref: ${ref}`,
  ].join("\n");
}

function forkDependency(name) {
  const [path, ref] = packageRefs[name];
  return gitDependency(name, flutterPackages, ref, path);
}

function replaceScalarDependency(pubspec, name, replacement) {
  const line = new RegExp(`^  ${name}: [^\\n]+$`, "m");
  if (!line.test(pubspec))
    throw new Error(`pubspec.yaml 缺少预期依赖 ${name}；请先同步鸿蒙依赖映射。`);
  return pubspec.replace(line, replacement);
}

function renderOhosPubspec(source) {
  let pubspec = source.replace(/\r\n/g, "\n");
  for (const name of ["shared_preferences", "path_provider", "image_picker", "url_launcher"]) {
    pubspec = replaceScalarDependency(pubspec, name, forkDependency(name));
  }
  pubspec = replaceScalarDependency(
    pubspec,
    "mobile_scanner",
    gitDependency(
      "mobile_scanner",
      "https://gitcode.com/CPF-Flutter/fluttertpc_mobile_scanner.git",
      "7.1.4-ohos-1.0.0-beta.1",
    ),
  );
  // 鸿蒙插件本身导出相同 API；保留原包会让 GeneratedPluginRegistrant 重复导入同名类。
  for (const name of ["file_picker", "flutter_secure_storage"]) {
    pubspec = replaceScalarDependency(pubspec, name, "");
  }
  const extra = [
    gitDependency(
      "flutter_secure_storage_ohos",
      "https://gitcode.com/CPF-Flutter/fluttertpc_flutter_secure_storage.git",
      "9.2.4-ohos-1.0.0",
      "flutter_secure_storage_ohos",
    ),
    gitDependency(
      "file_picker_ohos",
      "https://gitcode.com/CPF-Flutter/fluttertpc_file_picker.git",
      "10.3.8-ohos-1.0.0",
    ),
  ].join("\n");
  if (!pubspec.includes("\ndev_dependencies:\n"))
    throw new Error("pubspec.yaml 未找到 dev_dependencies 边界。");
  pubspec = pubspec.replace("\ndev_dependencies:\n", `\n${extra}\n\ndev_dependencies:\n`);
  const overrides = [
    "shared_preferences",
    "shared_preferences_ohos",
    "path_provider",
    "path_provider_ohos",
    "image_picker",
    "image_picker_ohos",
    "url_launcher",
    "url_launcher_ohos",
  ]
    .map(forkDependency)
    .join("\n");
  return `${pubspec.trimEnd()}\n\ndependency_overrides:\n${overrides}\n`;
}

async function run(program, args, options = {}) {
  return await new Promise((done, fail) => {
    const isBatch = process.platform === "win32" && program.toLowerCase().endsWith(".bat");
    const command = isBatch ? [program, ...args].map((arg) => `"${arg}"`).join(" ") : program;
    const child = spawn(command, isBatch ? [] : args, {
      cwd: options.cwd ?? appRoot,
      env: options.env ?? process.env,
      stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
      shell: isBatch,
    });
    let output = "";
    if (options.capture) child.stdout.on("data", (chunk) => (output += chunk));
    child.on("error", fail);
    child.on("close", (code) =>
      code === 0 ? done(output) : fail(new Error(`${program} 退出码 ${code}`)),
    );
  });
}

async function validateFlutterGlobalConfig(flutter, selectedSdk, env) {
  const settings = await run(flutter, ["config", "--list"], { env, capture: true });
  const configured = /^\s*ohos-sdk:\s*(.+)$/m.exec(settings)?.[1].trim();
  if (!configured || configured === "(Not set)") return;
  let configuredPath;
  try {
    configuredPath = await realpath(configured);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    configuredPath = resolve(configured);
  }
  const normalize = (value) => (process.platform === "win32" ? value.toLowerCase() : value);
  if (normalize(configuredPath) !== normalize(selectedSdk)) {
    throw new Error(
      `CPF Flutter 全局 ohos-sdk 配置指向 ${configured}，与本次选定的 ${selectedSdk} 不同。请清除 CPF Flutter 全局配置中的 ohos-sdk 旧值后重试；Agent 不会修改全局配置。`,
    );
  }
}

async function readLocalToolchain() {
  try {
    return JSON.parse(await readFile(localToolchainPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

async function validateSdk(supplied) {
  if (!supplied || !isAbsolute(supplied)) {
    throw new Error(
      `请通过 KAYING_FLUTTER_OH_SDK 或 configure 指定 CPF-Flutter ${sdkPin.tag} SDK 的绝对路径。`,
    );
  }
  const sdk = await realpath(supplied);
  const gitHead = await new Promise((done, fail) => {
    let output = "";
    const child = spawn("git", ["-C", sdk, "rev-parse", "HEAD"], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    child.stdout.on("data", (chunk) => (output += chunk));
    child.on("error", fail);
    child.on("close", (code) =>
      code === 0 ? done(output.trim()) : fail(new Error("无法读取鸿蒙 Flutter SDK 的 Git 版本。")),
    );
  });
  if (gitHead !== sdkPin.commit) {
    throw new Error(
      `鸿蒙 Flutter SDK 版本不匹配：需要 ${sdkPin.tag} (${sdkPin.commit})，实际为 ${gitHead}。`,
    );
  }
  const flutter = join(sdk, "bin", process.platform === "win32" ? "flutter.bat" : "flutter");
  await stat(flutter);
  return { sdk, flutter };
}

async function validateDevecoSdk(supplied) {
  const { sdk, api, toolDirs } = await inspectDevecoSdk(supplied, sdkPin.supportedCompileApis);
  console.log(`[ohos] 编译 SDK API ${api}：${sdk}`);
  console.log(`[ohos] 使用配套工具目录：${toolDirs.join(" ; ")}`);
  return { sdk, api, toolDirs };
}

async function prepareStage({ refreshLock = false } = {}) {
  await mkdir(buildRoot, { recursive: true });
  const stageRoot = await mkdtemp(join(buildRoot, "ohos-stage-"));
  for (const name of ["lib", "assets", "ohos"]) {
    await cp(join(appRoot, name), join(stageRoot, name), { recursive: true });
  }
  await cp(join(appRoot, "analysis_options.yaml"), join(stageRoot, "analysis_options.yaml"));
  const sourcePubspec = await readFile(join(appRoot, "pubspec.yaml"), "utf8");
  await writeFile(join(stageRoot, "pubspec.yaml"), renderOhosPubspec(sourcePubspec));
  if (!refreshLock || process.argv.includes("--preserve-versions"))
    await cp(ohosLock, join(stageRoot, "pubspec.lock"));
  await writeFile(
    join(stageRoot, "lib", "platform", "file_picker.dart"),
    "export 'package:file_picker_ohos/file_picker_ohos.dart';\n",
  );
  await writeFile(
    join(stageRoot, "lib", "platform", "secure_storage.dart"),
    "export 'package:flutter_secure_storage_ohos/flutter_secure_storage_ohos.dart';\n",
  );
  const version = /^version: (\d+\.\d+\.\d+)\+(\d+)$/m.exec(sourcePubspec);
  if (!version) throw new Error("pubspec.yaml 的 version 需要使用 <x.y.z>+<build> 格式。");
  const appJsonPath = join(stageRoot, "ohos", "AppScope", "app.json5");
  const appJson = await readFile(appJsonPath, "utf8");
  await writeFile(
    appJsonPath,
    appJson
      .replace(/"versionName":\s*"[^"]+"/, `"versionName": "${version[1]}"`)
      .replace(/"versionCode":\s*\d+/, `"versionCode": ${version[2]}`),
  );
  const signingProfile = process.env.KAYING_OHOS_SIGNING_PROFILE;
  if (signingProfile) {
    if (!isAbsolute(signingProfile))
      throw new Error("KAYING_OHOS_SIGNING_PROFILE 必须是绝对路径。");
    await cp(signingProfile, join(stageRoot, "ohos", "build-profile.json5"));
  }
  return stageRoot;
}

async function main() {
  const mode = process.argv[2] ?? "debug";
  if (
    !["configure", "check", "prepare", "analyze", "debug", "release", "refresh-lock"].includes(mode)
  ) {
    throw new Error(
      "用法：node scripts/build-ohos.mjs [configure|check|prepare|analyze|debug|release|refresh-lock]",
    );
  }
  if (mode === "configure") {
    const flutterSdk = process.argv[3];
    const devecoSdk = process.argv[4];
    await validateSdk(flutterSdk);
    await validateDevecoSdk(devecoSdk);
    await mkdir(dirname(localToolchainPath), { recursive: true });
    await writeFile(
      localToolchainPath,
      `${JSON.stringify({ flutterSdk: await realpath(flutterSdk), devecoSdk: await realpath(devecoSdk) }, null, 2)}\n`,
    );
    console.log(`[ohos] 已保存本机工具链路径：${localToolchainPath}`);
    return;
  }
  const localToolchain = await readLocalToolchain();
  const { flutter } = await validateSdk(
    process.env.KAYING_FLUTTER_OH_SDK || localToolchain.flutterSdk,
  );
  // Flutter OH 在 pub get/analyze 阶段也探测鸿蒙 SDK；所有模式都必须绑定同一套 DevEco 工具。
  const deveco = await validateDevecoSdk(process.env.DEVECO_SDK_HOME || localToolchain.devecoSdk);
  const env = {
    ...process.env,
    DEVECO_SDK_HOME: deveco.sdk,
    HOS_SDK_HOME: deveco.sdk,
    PATH: `${deveco.toolDirs.join(delimiter)}${delimiter}${process.env.PATH ?? ""}`,
    FLUTTER_STORAGE_BASE_URL: sdkPin.flutterStorageBaseUrl,
    FLUTTER_OHOS_STORAGE_BASE_URL: sdkPin.flutterOhosStorageBaseUrl,
    PUB_HOSTED_URL: "https://mirrors.tuna.tsinghua.edu.cn/dart-pub/",
    PUB_CACHE: join(buildRoot, "ohos-pub-cache"),
  };
  // 旧 OpenHarmony 环境变量会被 Flutter 优先探测，清除后只使用本次选定的 HarmonyOS SDK。
  delete env.OHOS_HOME;
  delete env.OHOS_SDK_HOME;
  // CPF Flutter 的持久化 ohos-sdk 设置比环境变量优先，预检冲突以免静默选错 SDK。
  await validateFlutterGlobalConfig(flutter, deveco.sdk, env);
  if (mode === "check") {
    await run(flutter, ["--version"], { env });
    return;
  }
  if ((mode === "debug" || mode === "release") && !process.env.KAYING_OHOS_SIGNING_PROFILE) {
    // Flutter HAP 打包阶段要求签名；提前报错避免完成依赖解析后才因空模板失败。
    throw new Error(
      `${mode} HAP 需要 KAYING_OHOS_SIGNING_PROFILE 指向本机签名 build-profile.json5；可先运行 prepare 并在 DevEco Studio 配置签名。`,
    );
  }
  if (mode === "debug" || mode === "release") {
    const signingProfile = process.env.KAYING_OHOS_SIGNING_PROFILE;
    if (!isAbsolute(signingProfile))
      throw new Error("KAYING_OHOS_SIGNING_PROFILE 必须是绝对路径。");
    await stat(signingProfile);
  }
  const stage = await prepareStage({ refreshLock: mode === "refresh-lock" });
  console.log(`[ohos] 独立暂存工程：${stage}`);
  await run(flutter, ["pub", "get", ...(mode === "refresh-lock" ? [] : ["--enforce-lockfile"])], {
    cwd: stage,
    env,
  });
  if (mode === "refresh-lock") {
    await cp(join(stage, "pubspec.lock"), ohosLock);
    console.log(`[ohos] 已更新鸿蒙专用锁文件：${ohosLock}`);
  }
  if (mode === "analyze") await run(flutter, ["analyze", "--no-pub"], { cwd: stage, env });
  if (mode === "debug" || mode === "release") {
    await run(flutter, ["build", "hap", `--${mode}`, "--no-pub"], {
      cwd: stage,
      env,
    });
    console.log(`[ohos] HAP 产物目录：${join(stage, "build", "ohos", "hap")}`);
  }
}

main().catch((error) => {
  console.error(`[ohos] ${error.message}`);
  process.exitCode = 1;
});
