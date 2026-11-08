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

test("product builds run for tags or manual requests with read-only repository access", async () => {
  const workflow = parse(
    await readFile(new URL("../.github/workflows/build-platforms.yml", import.meta.url), "utf8"),
  );
  assert.deepEqual(workflow.on.push, { tags: [release.git.tagMatch, "kaying-code-test-v*"] });
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.target.options, [
    "all",
    "desktop",
    "mobile",
  ]);
  assert.equal(workflow.on.workflow_dispatch.inputs.target.default, "all");
  assert.deepEqual(workflow.permissions, { contents: "read" });
  for (const name of ["desktop", "mobile"]) {
    const job = workflow.jobs[name];
    assert.equal(job.needs, "validate");
    assert.equal(job.permissions, undefined);
    assert.equal(job.steps.at(-1).with["if-no-files-found"], "error");
  }
  assert.equal(workflow.jobs.desktop.strategy["fail-fast"], false);
  assert.equal(workflow.jobs.mobile.name, "Flutter (android)");
  assert.equal(workflow.jobs.mobile.strategy, undefined);
});
