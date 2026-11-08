import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLinuxReleaseTag } from "./linux-release-tag.mjs";

const commit = "0123456789abcdef0123456789abcdef01234567";
test("only the exact release or commit-bound preflight tag is accepted", () => {
  assert.equal(resolveLinuxReleaseTag("0.1.1", commit, "refs/tags/kaying-code-v0.1.1"), "release");
  assert.equal(
    resolveLinuxReleaseTag("0.1.1", commit, "refs/tags/kaying-code-preflight-v0.1.1-0123456789ab"),
    "preflight",
  );
  for (const ref of [
    "refs/heads/main",
    "refs/tags/kaying-code-preflight-v0.1.1-aaaaaaaaaaaa",
    "refs/tags/kaying-code-v0.1.2",
    "refs/tags/kaying-code-test-v0.1.1-0123456789ab",
  ]) {
    assert.throws(() => resolveLinuxReleaseTag("0.1.1", commit, ref));
  }
  assert.throws(() => resolveLinuxReleaseTag("0.1.1", "short", "refs/tags/kaying-code-v0.1.1"));
});
