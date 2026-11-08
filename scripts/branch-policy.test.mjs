import assert from "node:assert/strict";
import test from "node:test";
import release from "../.release-it.mjs";
test("product release uses its own branch and tag namespace", () => {
  assert.equal(release.git.requireBranch, "kaying-code-release");
  assert.equal(release.git.tagName, "kaying-code-v${version}");
});
