import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { getDefaultLogDir } from "../src/logging/index.js";
import { getDefaultSessionDbPath } from "../src/storage/session-store/paths.js";
import { resolveDefaultOutputRootDir } from "../src/exec/execution-utils.js";
import { getDefaultWorkflowRoot } from "../src/workflow/index.js";
import { resolveWorkspaceHookTrustStorePath } from "../src/storage/workspace-hook-trust-store.js";

test("Agent defaults use the Desktop data base directory when provided", async () => {
  const previous = process.env.KAYINGCODE_DATA_BASE_DIR;
  process.env.KAYINGCODE_DATA_BASE_DIR = "/tmp/kaying-agent-new-root";
  try {
    assert.equal(
      getDefaultLogDir(),
      join(process.env.KAYINGCODE_DATA_BASE_DIR, ".kayingcode/cli/log"),
    );
    assert.equal(
      getDefaultSessionDbPath(),
      join(
        process.env.KAYINGCODE_DATA_BASE_DIR,
        ".kayingcode/cli/db/db.sqlite",
      ),
    );
    assert.equal(
      resolveDefaultOutputRootDir(),
      join(process.env.KAYINGCODE_DATA_BASE_DIR, ".kayingcode/cli/exec"),
    );
    assert.equal(
      getDefaultWorkflowRoot(),
      join(process.env.KAYINGCODE_DATA_BASE_DIR, ".kayingcode/cli/workflows"),
    );
    assert.equal(
      await resolveWorkspaceHookTrustStorePath(),
      join(
        process.env.KAYINGCODE_DATA_BASE_DIR,
        ".kayingcode/security/workspace-hook-trust-v1.json",
      ),
    );
  } finally {
    if (previous === undefined) delete process.env.KAYINGCODE_DATA_BASE_DIR;
    else process.env.KAYINGCODE_DATA_BASE_DIR = previous;
  }
});
