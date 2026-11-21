import { execFile } from "node:child_process";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { pluginRoot } from "./runtime.mjs";
import { inspectSnapshot, snapshotPaths } from "./verify-upstream.mjs";

const execute = promisify(execFile);
const repository = "https://github.com/ahujasid/mcp-for-blender";
const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

async function prepareRelease(root) {
  const noticesPath = join(root, "third-party/copied-components.json");
  const notices = JSON.parse(await readFile(noticesPath, "utf8"));
  const notice = notices.find((item) => item.id === "mcp-for-blender");
  if (!notice) throw new Error("Missing mcp-for-blender copied-source notice record");
  const [{ generateOfficialPluginCatalog }, { generateSourceMap }] = await Promise.all([
    import("../../../../../scripts/generate-official-plugin-catalog.mjs"),
    import("../../../../../scripts/generate-source-map.mjs"),
  ]);
  if (
    typeof generateOfficialPluginCatalog !== "function" ||
    typeof generateSourceMap !== "function"
  )
    throw new Error("Missing official plugin or source-map generator");
  return {
    paths: [
      noticesPath,
      join(
        root,
        "apps/zcode-cli/packages/contracts/src/plugins/official-plugin-catalog.generated.ts",
      ),
      join(root, "packages/shared/src/official-plugin-defaults.generated.ts"),
      join(root, "SOURCE_PACKAGES.md"),
    ],
    async update(lock) {
      Object.assign(notice, {
        referenceRevision: lock.commit,
        importRevision: lock.commit,
        source: `${repository}/blob/${lock.commit}/LICENSE`,
        sha256: lock.files.LICENSE,
      });
      await writeFile(noticesPath, `${JSON.stringify(notices, null, 2)}\n`);
      await generateOfficialPluginCatalog(root);
      await generateSourceMap(root);
    },
  };
}

export async function syncUpstream({ source, ref, pluginVersion, root = pluginRoot, releaseRoot }) {
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
  const transaction = join(root, ".snapshot-sync");
  // 同一个 checkout 只允许一次同步，避免生成器基于其他同步的中间文件计算结果。
  await mkdir(transaction);
  const stage = join(transaction, "candidate");
  const target = join(parent, "mcp-for-blender");
  const backup = join(transaction, "previous");
  let keepBackup = false;
  try {
    const release = releaseRoot && (await prepareRelease(releaseRoot));
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
    const manifestPath = join(root, ".zcode-plugin/plugin.json");
    const packagePath = join(root, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const pkg = JSON.parse(await readFile(packagePath, "utf8"));
    const lock = { schemaVersion: 1, repository, commit, license: "MIT", ...snapshot };
    const updates = [
      [manifestPath, { ...manifest, version: pluginVersion }],
      [packagePath, { ...pkg, version: pluginVersion }],
      [join(root, "upstream-lock.json"), lock],
    ];
    const paths = [...updates.map(([path]) => path), ...(release?.paths ?? [])];
    const original = await Promise.all(
      paths.map(async (path) => {
        try {
          return await readFile(path);
        } catch (error) {
          if (error.code === "ENOENT") return null;
          throw error;
        }
      }),
    );
    let hadSnapshot = true;
    await rename(target, backup).catch((error) => {
      if (error.code !== "ENOENT") throw error;
      hadSnapshot = false;
    });
    let published = false;
    try {
      await rename(stage, target);
      published = true;
      for (const [path, value] of updates) {
        await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
      }
      await release?.update(lock);
    } catch (error) {
      // 生成步骤也会写入文件，任何一步失败都恢复本次同步写集。
      const restoreSnapshot = async () => {
        if (published) await rm(target, { recursive: true, force: true });
        if (hadSnapshot) await rename(backup, target);
      };
      const restorations = await Promise.allSettled([
        restoreSnapshot(),
        ...(published
          ? paths.map((path, index) =>
              original[index] === null
                ? rm(path, { force: true })
                : writeFile(path, original[index]),
            )
          : []),
      ]);
      const failures = restorations.filter((item) => item.status === "rejected");
      if (failures.length) {
        keepBackup = true;
        throw new AggregateError(
          [error, ...failures.map((failure) => failure.reason)],
          `Blender sync rollback failed; inspect ${transaction} and the worktree`,
        );
      }
      throw error;
    }
    return lock;
  } finally {
    if (!keepBackup) await rm(transaction, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  (await realpath(process.argv[1]).catch(() => "")) === fileURLToPath(import.meta.url)
) {
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
    releaseRoot: repositoryRoot,
  });
  process.stdout.write(
    `Synced Blender ${lock.version} (${lock.commit}); run verify, tests and node scripts/licenses.mjs notices before release.\n`,
  );
}
