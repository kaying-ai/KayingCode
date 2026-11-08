import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateOfficialPluginCatalog } from "../../../../../scripts/generate-official-plugin-catalog.mjs";
import { generateSourceMap } from "../../../../../scripts/generate-source-map.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "..", "..");
const vendorRoot = join(packageRoot, "vendor", "kaying-computer-use");
const upstreamPaths = [
  "LICENSE",
  "Package.swift",
  "package.json",
  "assets/app-icons/kaying-computer-use-1024.png",
  "apps/OpenComputerUse",
  "apps/OpenComputerUseLinux",
  "apps/OpenComputerUseWindows",
  "packages/OpenComputerUseKit",
  "scripts/build-apple-iconset.sh",
  "scripts/build-open-computer-use-app.sh",
  "scripts/build-open-computer-use-linux.sh",
  "scripts/build-open-computer-use-windows.sh",
  "skills/kaying-computer-use",
  "docs/references/codex-computer-use-reverse-engineering/assets/extracted-2026-04-19/official-software-cursor-window-252.png",
];

function parseArgs(argv) {
  const options = { source: undefined, ref: "HEAD", pluginVersion: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!new Set(["--source", "--ref", "--plugin-version"]).has(key) || !value) {
      throw new Error(
        "Usage: sync-upstream.mjs --source <checkout> --ref <ref> --plugin-version <version>",
      );
    }
    if (key === "--source") options.source = resolve(value);
    if (key === "--ref") options.ref = value;
    if (key === "--plugin-version") options.pluginVersion = value;
    index += 1;
  }
  if (!options.source || !options.pluginVersion) {
    throw new Error(
      "Usage: sync-upstream.mjs --source <checkout> --ref <ref> --plugin-version <version>",
    );
  }
  return options;
}

async function run(command, args, options = {}) {
  return await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk.toString("utf8")));
    child.stderr?.on("data", (chunk) => (stderr += chunk.toString("utf8")));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolveRun(stdout.trim());
      else reject(new Error(`${command} ${args.join(" ")} failed: ${stderr.trim()}`));
    });
  });
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const textExtensions = new Set([".go", ".json", ".md", ".py", ".sh", ".swift"]);

async function normalizeSnapshotLineEndings(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await normalizeSnapshotLineEndings(path);
      continue;
    }
    const extension = entry.name.includes(".") ? `.${entry.name.split(".").pop()}` : "";
    if (!textExtensions.has(extension) && entry.name !== "Package.swift") continue;
    const contents = await readFile(path, "utf8");
    const normalized = contents.replaceAll("\r\n", "\n");
    if (normalized !== contents) await writeFile(path, normalized, "utf8");
  }
}

const options = parseArgs(process.argv.slice(2));
const status = await run("git", ["status", "--porcelain"], { cwd: options.source, capture: true });
if (status)
  throw new Error("Upstream checkout has uncommitted changes; commit or stash them first");
const commit = await run("git", ["rev-parse", `${options.ref}^{commit}`], {
  cwd: options.source,
  capture: true,
});
const upstreamPackage = JSON.parse(
  await run("git", ["show", `${commit}:package.json`], { cwd: options.source, capture: true }),
);

const tempRoot = await mkdtemp(join(tmpdir(), "kayingcode-cua-sync-"));
const archivePath = join(tempRoot, "upstream.tar");
const extractedRoot = join(tempRoot, "snapshot");
try {
  await run(
    "git",
    ["archive", "--format=tar", `--output=${archivePath}`, commit, "--", ...upstreamPaths],
    { cwd: options.source },
  );
  await mkdir(extractedRoot, { recursive: true });
  await run("tar", ["-xf", archivePath, "-C", extractedRoot], { cwd: tempRoot });
  await normalizeSnapshotLineEndings(extractedRoot);

  // 目标限定为当前插件包内固定 vendor 目录；更新是可审计的全量快照替换，避免残留旧上游文件。
  await rm(vendorRoot, { recursive: true, force: true });
  await cp(extractedRoot, vendorRoot, { recursive: true, force: true, preserveTimestamps: true });
  await cp(join(vendorRoot, "LICENSE"), join(packageRoot, "LICENSE"), { force: true });
  // 上游 commit 改变后，任何旧 native 制品都不能继续进入发布包。各目标平台必须重新构建。
  await rm(join(packageRoot, "native"), { recursive: true, force: true });

  const packagePath = join(packageRoot, "package.json");
  const manifestPath = join(packageRoot, ".kayingcode-plugin", "plugin.json");
  const pluginPackage = JSON.parse(await readFile(packagePath, "utf8"));
  const pluginManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  pluginPackage.version = options.pluginVersion;
  pluginManifest.version = options.pluginVersion;
  await writeJson(packagePath, pluginPackage);
  await writeJson(manifestPath, pluginManifest);
  await writeJson(join(packageRoot, "upstream-lock.json"), {
    schemaVersion: 1,
    repository: "https://github.com/kaying-ai/kaying-computer-use.git",
    version: upstreamPackage.version,
    commit,
    license: "MIT",
  });

  await generateOfficialPluginCatalog(repositoryRoot);
  await generateSourceMap(repositoryRoot);
  process.stdout.write(
    `[computer-use] synced upstream ${upstreamPackage.version} (${commit}) as plugin ${options.pluginVersion}\n`,
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
