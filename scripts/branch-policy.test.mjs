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
  const checks = workflow.jobs.source.steps.find(
    (step) => step.name === "Check types, lint and architecture",
  );
  assert.equal(checks.env.NODE_OPTIONS, "--max-old-space-size=4096");
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

test("Windows and Android release jobs require protected credentials and signature verification", async () => {
  const workflow = parse(
    await readFile(
      new URL("../.github/workflows/release-windows-android.yml", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.equal(workflow.jobs.windows.needs, "validate");
  assert.equal(workflow.jobs.windows.environment, "windows-release");
  assert.equal(workflow.jobs.android.needs, "validate");
  assert.equal(workflow.jobs.android.environment, "android-release");
  assert.match(
    workflow.jobs.validate.steps.find((step) => step.id === "version").run,
    /resolveLinuxReleaseTag/,
  );
  assert.match(
    workflow.jobs.windows.steps.find((step) => step.name === "Verify Windows installer signature")
      .run,
    /Get-AuthenticodeSignature/,
  );
  assert.match(
    workflow.jobs.android.steps.find((step) => step.name === "Build and verify Android release APK")
      .run,
    /apksigner.*verify/,
  );
});
