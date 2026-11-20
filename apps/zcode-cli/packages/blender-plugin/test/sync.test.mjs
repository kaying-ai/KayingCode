import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { pluginRoot } from "../scripts/runtime.mjs";
import { syncUpstream } from "../scripts/sync-upstream.mjs";
import { verifyUpstream } from "../scripts/verify-upstream.mjs";

const execute = promisify(execFile);

test("upstream sync imports a clean commit without touching adapters; invalid imports preserve vendor", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "blender-sync-test-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const source = join(temp, "upstream"),
    root = join(temp, "plugin");
  await cp(join(pluginRoot, "vendor/mcp-for-blender"), source, { recursive: true });
  const git = async (...args) => (await execute("git", ["-C", source, ...args])).stdout.trim();
  await git("init", "--quiet");
  await git("config", "user.name", "Plugin Test");
  await git("config", "user.email", "plugin-test@example.invalid");
  await git("add", ".");
  await git("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
  await mkdir(join(root, ".zcode-plugin"), { recursive: true });
  await mkdir(join(root, "scripts"), { recursive: true });
  await cp(join(pluginRoot, "package.json"), join(root, "package.json"));
  await cp(join(pluginRoot, ".zcode-plugin/plugin.json"), join(root, ".zcode-plugin/plugin.json"));
  await writeFile(join(root, "scripts/adapter.mjs"), "local adapter");
  const lock = await syncUpstream({ source, root, ref: "HEAD", pluginVersion: "0.2.0" });
  assert.equal((await verifyUpstream(root)).commit, lock.commit);
  assert.equal(await readFile(join(root, "scripts/adapter.mjs"), "utf8"), "local adapter");
  assert.equal(JSON.parse(await readFile(join(root, "package.json"))).version, "0.2.0");
  await writeFile(join(source, "addon.py"), "bad update");
  await assert.rejects(
    syncUpstream({ source, root, ref: "HEAD", pluginVersion: "0.3.0" }),
    /clean/,
  );
  await git("add", ".");
  await git("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "bad addon");
  await assert.rejects(
    syncUpstream({ source, root, ref: "HEAD", pluginVersion: "0.3.0" }),
    /differs/,
  );
  assert.equal((await verifyUpstream(root)).commit, lock.commit);
});

test("sync CLI updates the complete snapshot and rolls back a failed generation", async (t) => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), "blender sync cli ")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const repo = join(temp, "repo");
  const plugin = join(repo, "apps/zcode-cli/packages/blender-plugin");
  const source = join(temp, "upstream");
  await mkdir(dirname(plugin), { recursive: true });
  await cp(pluginRoot, plugin, { recursive: true });
  await cp(join(pluginRoot, "vendor/mcp-for-blender"), source, { recursive: true });
  const git = (...args) => execute("git", ["-C", source, ...args]);
  await git("init", "--quiet");
  await git("add", ".");
  await git(
    "-c",
    "user.name=Plugin Test",
    "-c",
    "user.email=test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  );

  const run = (version) =>
    execute(
      process.execPath,
      [
        join(plugin, "scripts/sync-upstream.mjs"),
        "--source",
        source,
        "--ref",
        "HEAD",
        "--plugin-version",
        version,
      ],
      { cwd: temp },
    );
  const put = async (path, value) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, value);
  };
  const files = [
    join(plugin, "package.json"),
    join(plugin, ".zcode-plugin/plugin.json"),
    join(plugin, "upstream-lock.json"),
    join(repo, "third-party/copied-components.json"),
    join(
      repo,
      "apps/zcode-cli/packages/contracts/src/plugins/official-plugin-catalog.generated.ts",
    ),
    join(repo, "packages/shared/src/official-plugin-defaults.generated.ts"),
    join(repo, "SOURCE_PACKAGES.md"),
  ];
  const readAll = () => Promise.all(files.map((path) => readFile(path, "utf8")));
  await put(files[3], "[]");
  for (const path of files.slice(4)) await put(path, "original");
  const initial = await readAll();
  await assert.rejects(run("0.9.1"), /Missing mcp-for-blender/);
  assert.deepEqual(await readAll(), initial);
  await verifyUpstream(plugin);

  await put(files[3], JSON.stringify([{ id: "mcp-for-blender" }]));
  await put(
    join(repo, "scripts/generate-official-plugin-catalog.mjs"),
    `
    import { writeFile } from "node:fs/promises";
    import { join } from "node:path";
    export async function generateOfficialPluginCatalog(root) {
      await writeFile(join(root, ${JSON.stringify(files[4].slice(repo.length + 1))}), "catalog generated");
    }
  `,
  );
  const mapGenerator = join(repo, "scripts/generate-source-map.mjs");
  await put(
    mapGenerator,
    `export function generateSourceMap() { throw new Error("fixture generation failed"); }`,
  );
  const beforeFailure = await readAll();
  const oldLock = await verifyUpstream(plugin);
  await assert.rejects(run("0.9.2"), /fixture generation failed/);
  assert.deepEqual(await readAll(), beforeFailure);
  assert.deepEqual(await verifyUpstream(plugin), oldLock);

  await put(
    mapGenerator,
    `
    import { writeFile } from "node:fs/promises";
    import { join } from "node:path";
    export async function generateSourceMap(root) {
      await writeFile(join(root, "SOURCE_PACKAGES.md"), "map generated");
    }
  `,
  );
  assert.match((await run("0.9.3")).stdout, /Synced Blender/);
  const updated = await readAll();
  assert.equal(JSON.parse(updated[0]).version, "0.9.3");
  assert.equal(JSON.parse(updated[1]).version, "0.9.3");
  assert.equal(JSON.parse(updated[3])[0].importRevision, (await verifyUpstream(plugin)).commit);
  assert.equal(updated[4], "catalog generated");
  assert.equal(updated[6], "map generated");
});
