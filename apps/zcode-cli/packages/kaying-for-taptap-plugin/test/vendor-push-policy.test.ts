import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { runInNewContext } from "node:vm";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const vendor = join(root, "vendor/instant-games-open-mcp");
const bundle = () => readFile(join(vendor, "dist/maker.js"), "utf8");

function functionSource(source: string, name: string) {
  const start = source.indexOf(`\nasync function ${name}(`);
  assert.ok(start >= 0, `${name} is missing from the distributed runtime`);
  const next = /\n(?:async )?function \w+\(/.exec(source.slice(start + 1));
  return source.slice(start, next ? start + 1 + next.index : undefined);
}

test("locked Maker distribution and notices match the audited upstream", async () => {
  const lock = JSON.parse(await readFile(join(vendor, "upstream-lock.json"), "utf8"));
  const notices = await readFile(join(root, "THIRD_PARTY_NOTICES.md"), "utf8");
  for (const pkg of lock.packages) {
    assert.ok(notices.includes(`\`${pkg.packageName}\` ${pkg.version}`));
    for (const file of pkg.distFiles) {
      const bytes = await readFile(join(vendor, "dist", file));
      assert.equal(createHash("sha512").update(bytes).digest("hex"), pkg.distSha512[file]);
    }
  }
  const maker = lock.packages.find(
    (pkg: { packageName: string }) => pkg.packageName === "@taptap/maker",
  );
  assert.equal(maker.version, "0.0.38");
  const source = await bundle();
  assert.ok(source.includes(`TapTap Maker MCP version: ${maker.version}`));
  const push = functionSource(source, "pushMakerProject");
  assert.ok(!push.includes("remoteSyncStatus"), "preflight must not merge remote files");
  assert.ok(push.includes("pushMakerProjectWithHistoryFallback"));
  assert.ok(push.includes("repairCloudWorkspace"), "upstream cloud repair must be retained");
  assert.ok(push.includes("mergeMakerProjectHistoryPreservingLocal"));
  assert.ok(
    !push.includes("await mergeMakerRemote("),
    "cloud repair must not import remote content",
  );
});

for (const scenario of ["diverged", "cloud repair"])
  test(`distributed push workflow preserves local files and deletions after ${scenario}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "maker-history-policy-"));
    const git = async (cwd: string, args: string[]) =>
      (
        await run("git", args, { cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" } })
      ).stdout.trim();
    try {
      const remote = join(temp, "remote.git"),
        local = join(temp, "local"),
        peer = join(temp, "peer");
      await git(temp, ["init", "--bare", "--initial-branch=main", remote]);
      await git(temp, ["clone", remote, local]);
      const commit = async (cwd: string) => {
        await git(cwd, ["add", "-A"]);
        await git(cwd, [
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.invalid",
          "commit",
          "-m",
          "fixture",
        ]);
      };
      await writeFile(join(local, "scene.lua"), "original");
      await writeFile(join(local, "removed.lua"), "old");
      await commit(local);
      await git(local, ["push", "origin", "main"]);
      await git(temp, ["clone", remote, peer]);
      await writeFile(join(peer, "scene.lua"), "remote changed scene");
      await writeFile(join(peer, "remote-only.lua"), "remote content");
      await commit(peer);
      await git(peer, ["push", "origin", "main"]);
      await writeFile(join(local, "scene.lua"), "local scene");
      await rm(join(local, "removed.lua"));
      await commit(local);
      const expectedTree = await git(local, ["rev-parse", "HEAD^{tree}"]);
      const source = await bundle();
      const progress: unknown[] = [];
      let firstPush = true;
      const push = runInNewContext(
        `${functionSource(source, "mergeMakerProjectHistoryPreservingLocal")}\n${functionSource(source, "pushMakerProjectWithHistoryFallback")}\n${functionSource(source, "pushMakerProject")}\npushMakerProject`,
        {
          ensureGitAvailable() {},
          path13: { resolve },
          resolveUsableMakerGitWorkspace: (cwd: string) => ({ projectRoot: cwd }),
          loadProjectConfig: () => ({ project_id: "fixture" }),
          ensureAuthenticatedOrigin: async () => {},
          readGit: (args: string[], cwd: string) => git(cwd, args),
          currentBranch: async () => "main",
          readUnpushedCommitState: async () => ({ hasUnpushedCommits: true }),
          readAheadState: async () => ({}),
          repairCloudWorkspace: async () => ({ status: "repaired" }),
          gitStepWithTransientRetry: async (args: string[], options: { cwd: string }) => {
            if (args[0] === "push" && firstPush) {
              firstPush = false;
              if (scenario === "cloud repair") throw new Error("cloud_workspace_blocked");
            }
            await git(options.cwd, args);
            return 0;
          },
          gitStep: (args: string[], options: { cwd: string }) => git(options.cwd, args),
          toMakerGitFailure: (error: Error) => ({
            classification:
              error.message === "cloud_workspace_blocked" ? error.message : "remote_rejected",
            message: error.message,
          }),
        },
      );
      const result = await push({
        cwd: local,
        onProgress: (event: unknown) => progress.push(event),
      });
      assert.equal(result.pushed, true);
      assert.equal(result.commitHash, await git(local, ["rev-parse", "--short", "HEAD"]));
      if (scenario === "cloud repair") assert.equal(result.cloudRepair.status, "repaired");
      assert.equal(await git(local, ["rev-parse", "HEAD^{tree}"]), expectedTree);
      assert.equal(await git(remote, ["rev-parse", "main^{tree}"]), expectedTree);
      assert.equal(
        (await git(local, ["rev-list", "--parents", "-1", "HEAD"])).split(" ").length,
        3,
      );
      assert.ok(progress.length > 0);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

test("distributed push helper leaves auth and cloud repair failures to their existing owners", async () => {
  const source = await bundle();
  for (const classification of ["auth", "cloud_workspace_blocked", "remote_transient"]) {
    const failure = new Error(classification);
    let calls = 0;
    const helper = runInNewContext(
      `${functionSource(source, "pushMakerProjectWithHistoryFallback")}\npushMakerProjectWithHistoryFallback`,
      {
        gitStepWithTransientRetry: async () => {
          calls += 1;
          throw failure;
        },
        toMakerGitFailure: () => ({ classification, message: "rejected" }),
      },
    );
    await assert.rejects(helper("main", "/unused"), (error) => error === failure);
    assert.equal(calls, 1);
  }
});
