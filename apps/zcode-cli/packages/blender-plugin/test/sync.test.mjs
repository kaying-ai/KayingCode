import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  await git("commit", "--quiet", "-m", "fixture");
  await mkdir(join(root, ".kayingcode-plugin"), { recursive: true });
  await mkdir(join(root, "scripts"), { recursive: true });
  await cp(join(pluginRoot, "package.json"), join(root, "package.json"));
  await cp(
    join(pluginRoot, ".kayingcode-plugin/plugin.json"),
    join(root, ".kayingcode-plugin/plugin.json"),
  );
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
  await git("commit", "--quiet", "-m", "bad addon");
  await assert.rejects(
    syncUpstream({ source, root, ref: "HEAD", pluginVersion: "0.3.0" }),
    /differs/,
  );
  assert.equal((await verifyUpstream(root)).commit, lock.commit);
});
