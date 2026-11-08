import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { pluginRoot } from "./runtime.mjs";
import { inspectSnapshot, snapshotPaths } from "./verify-upstream.mjs";

const execute = promisify(execFile);
const repository = "https://github.com/ahujasid/mcp-for-blender";

export async function syncUpstream({ source, ref, pluginVersion, root = pluginRoot }) {
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(pluginVersion))
    throw new Error("Invalid plugin version");
  const git = async (...args) =>
    (
      await execute("git", ["-C", source, ...args], {
        encoding: "buffer",
        maxBuffer: 16 * 1024 * 1024,
      })
    ).stdout;
  if ((await git("status", "--porcelain")).length)
    throw new Error("Upstream checkout must be clean");
  const commit = (await git("rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`))
    .toString()
    .trim();
  const parent = join(root, "vendor");
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(join(parent, ".snapshot-"));
  const target = join(parent, "mcp-for-blender");
  const backup = `${stage}-previous`;
  try {
    const entries = (await git("ls-tree", "-r", "-z", commit, "--", ...snapshotPaths))
      .toString()
      .split("\0")
      .filter(Boolean);
    for (const entry of entries) {
      const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
      if (!match || match[3].split("/").includes(".."))
        throw new Error(`Unsafe upstream entry: ${entry}`);
      const path = join(stage, match[3]);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, await git("cat-file", "blob", match[2]));
    }
    const snapshot = await inspectSnapshot(stage);
    const manifestPath = join(root, ".kayingcode-plugin/plugin.json");
    const packagePath = join(root, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const pkg = JSON.parse(await readFile(packagePath, "utf8"));
    const lock = { schemaVersion: 1, repository, commit, license: "MIT", ...snapshot };
    // 先验证完整快照再替换；上游结构变化不应摧毁当前可运行版本。
    await rename(target, backup).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    try {
      await rename(stage, target);
    } catch (error) {
      await rename(backup, target).catch(() => {});
      throw error;
    }
    for (const [path, value] of [
      [manifestPath, { ...manifest, version: pluginVersion }],
      [packagePath, { ...pkg, version: pluginVersion }],
      [join(root, "upstream-lock.json"), lock],
    ]) {
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
    }
    await rm(backup, { recursive: true, force: true });
    return lock;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--source", "--ref", "--plugin-version"].includes(args[i]) || !args[i + 1])
      throw new Error("Usage: --source <checkout> --ref <commit/tag> --plugin-version <version>");
    options[args[i].slice(2)] = args[i + 1];
  }
  if (!options.source || !options.ref || !options["plugin-version"])
    throw new Error("Explicit source, ref and plugin-version required");
  const lock = await syncUpstream({
    source: resolve(options.source),
    ref: options.ref,
    pluginVersion: options["plugin-version"],
  });
  const root = resolve(pluginRoot, "../..");
  const noticesPath = join(root, "third-party/copied-components.json");
  const notices = JSON.parse(await readFile(noticesPath, "utf8"));
  const notice = notices.find((item) => item.id === "mcp-for-blender");
  if (!notice) throw new Error("Missing mcp-for-blender copied-source notice record");
  Object.assign(notice, {
    referenceRevision: lock.commit,
    importRevision: lock.commit,
    source: `${repository}/blob/${lock.commit}/LICENSE`,
    sha256: lock.files.LICENSE,
  });
  await writeFile(noticesPath, `${JSON.stringify(notices, null, 2)}\n`);
  const { generateOfficialPluginCatalog } =
    await import("../../../../../scripts/generate-official-plugin-catalog.mjs");
  const { generateSourceMap } = await import("../../../../../scripts/generate-source-map.mjs");
  await generateOfficialPluginCatalog(root);
  await generateSourceMap(root);
  process.stdout.write(
    `Synced Blender ${lock.version} (${lock.commit}); run verify, tests and node scripts/licenses.mjs notices before release.\n`,
  );
}
