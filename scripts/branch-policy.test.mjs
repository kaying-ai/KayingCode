import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import release from "../.release-it.mjs";

test("release preparation is local to a release PR branch", () => {
  assert.equal(release.git.requireBranch, "release/*");
  assert.equal(release.git.tag, false);
  assert.equal(release.git.push, false);
  assert.equal(release.git.tagMatch, "kaying-code-v*");
});

test("product CI checks main and product tags", async () => {
  const workflow = parse(
    await readFile(new URL("../.github/workflows/source-checks.yml", import.meta.url), "utf8"),
  );
  assert.deepEqual(workflow.on.pull_request.branches, ["main"]);
  assert.deepEqual(workflow.on.push.branches, ["main"]);
  assert.deepEqual(workflow.on.push.tags, ["kaying-code-v*"]);
});

test("macOS signing uses the protected release environment after tag validation", async () => {
  const workflow = parse(
    await readFile(new URL("../.github/workflows/release-macos.yml", import.meta.url), "utf8"),
  );
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflow.jobs.validate.environment, undefined);
  assert.equal(workflow.jobs.sign.needs, "validate");
  assert.equal(workflow.jobs.sign.environment, "macos-release");
});
