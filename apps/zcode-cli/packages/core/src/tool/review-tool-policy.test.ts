import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertReviewReadPath, reviewToolAllowed } from "./review-tool-policy.js";

test("review mode only admits Read and confines resolved symlinks to its workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-review-"));
  const workspace = join(root, "workspace");
  const outside = join(root, "outside.txt");
  try {
    await mkdir(workspace);
    await writeFile(join(workspace, "inside.txt"), "safe");
    await writeFile(outside, "secret");
    await symlink(outside, join(workspace, "escape.txt"));

    assert.equal(reviewToolAllowed("Read"), true);
    for (const tool of ["Bash", "Write", "Edit", "Grep", "Agent", "mcp__example__read"]) {
      assert.equal(reviewToolAllowed(tool), false, tool);
    }
    await assert.doesNotReject(assertReviewReadPath(workspace, join(workspace, "inside.txt")));
    await assert.rejects(assertReviewReadPath(workspace, outside), /review workspace/i);
    await assert.rejects(assertReviewReadPath(workspace, join(workspace, "escape.txt")), /review workspace/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
