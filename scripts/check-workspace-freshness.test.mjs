import assert from "node:assert/strict";
import { execFile as execCallback } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
const exec = promisify(execCallback);
const script = resolve(import.meta.dirname, "check-workspace-freshness.mjs");
async function fixture(t) {
  const cwd = await mkdtemp(resolve(tmpdir(), "kaying-branch-test-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = async (...args) => (await exec("git", args, { cwd })).stdout.trim();
  await git("init", "-b", "kaying-code-dev");
  await git("config", "user.name", "Branch Test");
  await git("config", "user.email", "branch@example.test");
  await git("commit", "--allow-empty", "-m", "base");
  const base = await git("rev-parse", "HEAD");
  await git("remote", "add", "origin", resolve(cwd, "remote.git"));
  await git("update-ref", "refs/remotes/origin/kaying-code-dev", base);
  const check = async (...args) => {
    try {
      const result = await exec(process.execPath, [script, "--no-fetch", ...args], { cwd });
      return { code: 0, text: result.stdout + result.stderr };
    } catch (error) {
      return { code: error.code, text: error.stdout + error.stderr };
    }
  };
  return { git, check, base };
}
test("features compare to product dev rather than upstream main", async (t) => {
  const { git, check } = await fixture(t);
  await git("switch", "-c", "kaying-code-feature-test");
  const result = await check();
  assert.equal(result.code, 0);
  assert.match(result.text, /origin\/kaying-code-dev/);
});
test("behind the tracking remote is always rejected", async (t) => {
  const { git, check, base } = await fixture(t);
  await git("commit", "--allow-empty", "-m", "remote advance");
  await git("update-ref", "refs/remotes/origin/kaying-code-dev", await git("rev-parse", "HEAD"));
  await git("reset", "--hard", base);
  await git("branch", "--set-upstream-to=origin/kaying-code-dev");
  const result = await check();
  assert.equal(result.code, 1);
  assert.match(result.text, /落后 origin\/kaying-code-dev 1/);
});
test("stale feature fails and diverged feature warns", async (t) => {
  const { git, check, base } = await fixture(t);
  await git("commit", "--allow-empty", "-m", "dev advance");
  await git("update-ref", "refs/remotes/origin/kaying-code-dev", await git("rev-parse", "HEAD"));
  await git("switch", "-c", "kaying-code-feature-test", base);
  assert.equal((await check("--max-behind-dev", "0")).code, 1);
  await git("commit", "--allow-empty", "-m", "feature work");
  const result = await check("--max-behind-dev", "0");
  assert.equal(result.code, 0);
  assert.match(result.text, /警告/);
});
test("a feature from an unrelated archive history cannot use the product dev ref", async (t) => {
  const { git, check, base } = await fixture(t);
  await git("switch", "-c", "kaying-code-feature-test");
  const snapshot = await git("commit-tree", `${base}^{tree}`, "-m", "independent GitHub snapshot");
  await git("update-ref", "refs/remotes/origin/kaying-code-dev", snapshot);
  const result = await check();
  assert.equal(result.code, 1);
  assert.match(result.text, /与开发基线 origin\/kaying-code-dev 没有共同祖先/u);
});
test("missing dev ref fails without falling back to main", async (t) => {
  const { git, check, base } = await fixture(t);
  await git("update-ref", "-d", "refs/remotes/origin/kaying-code-dev");
  await git("update-ref", "refs/remotes/origin/main", base);
  const result = await check();
  assert.equal(result.code, 1);
  assert.match(result.text, /找不到开发基线/);
});
test("upstream mirror and release do not chase dev", async (t) => {
  const { git, check } = await fixture(t);
  await git("update-ref", "-d", "refs/remotes/origin/kaying-code-dev");
  for (const branch of ["main", "kaying-code-release"]) {
    await git("switch", "-c", branch);
    assert.equal((await check()).code, 0);
  }
});
test("explicit dev ref is supported and invalid options fail", async (t) => {
  const { check } = await fixture(t);
  assert.equal((await check("--dev-ref", "HEAD")).code, 0);
  for (const args of [["--max-behind-dev", "-1"], ["--dev-ref"], ["--unknown"]])
    assert.equal((await check(...args)).code, 2);
});
