import { spawn } from "node:child_process";
import { access, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 原生 KayingCode adapter 已退役，不能生成看似支持旧协议的制品。
if (process.argv.includes("--native-kayingcode")) {
  throw new Error("原生 KayingCode 已退役，请使用 V2 Web 授权链接。");
}

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "release";

if (mode !== "debug" && mode !== "release") {
  throw new Error('Usage: node scripts/build-android-apk.mjs ["debug"|"release"]');
}

const pubspec = await readFile(path.join(appRoot, "pubspec.yaml"), "utf8");
const versionMatch = /^version:\s*([^\s#]+)/m.exec(pubspec);
if (!versionMatch) {
  throw new Error("Could not read the Flutter app version from pubspec.yaml.");
}
const version = versionMatch[1].split("+")[0];
const flutterBin = path.join(
  appRoot,
  ".fvm",
  "flutter_sdk",
  "bin",
  process.platform === "win32" ? "flutter.bat" : "flutter",
);

await new Promise((resolve, reject) => {
  const isWindows = process.platform === "win32";
  const command = isWindows ? `"${flutterBin}" build apk --${mode} --no-pub` : flutterBin;
  const args = isWindows ? [] : ["build", "apk", `--${mode}`, "--no-pub"];
  const child = spawn(command, args, {
    cwd: appRoot,
    stdio: "inherit",
    shell: isWindows,
  });
  child.once("error", reject);
  child.once("close", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`Flutter APK build failed with exit code ${code ?? "unknown"}.`));
  });
});

const outputDir = path.join(appRoot, "build", "app", "outputs", "flutter-apk");
const standardName = `app-${mode}.apk`;
const sourcePath = path.join(outputDir, standardName);
const debugSuffix = mode === "debug" ? "-debug" : "";
const artifactName = `KayingCode-${version}-android-universal${debugSuffix}.apk`;
const artifactPath = path.join(outputDir, artifactName);

await access(sourcePath);
await rm(artifactPath, { force: true });
await rename(sourcePath, artifactPath);

const sourceChecksumPath = `${sourcePath}.sha1`;
const artifactChecksumPath = `${artifactPath}.sha1`;
try {
  await access(sourceChecksumPath);
  await rm(artifactChecksumPath, { force: true });
  await rename(sourceChecksumPath, artifactChecksumPath);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

process.stdout.write(`Android ${mode} APK: ${artifactPath}\n`);
