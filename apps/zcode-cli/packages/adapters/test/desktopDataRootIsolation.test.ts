import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { getDefaultLogDir } from "../src/logging/index.js";
import { getDefaultSessionDbPath } from "../src/storage/session-store/paths.js";
import { resolveDefaultOutputRootDir } from "../src/exec/execution-utils.js";
import { getDefaultWorkflowRoot } from "../src/workflow/index.js";
import { resolveWorkspaceHookTrustStorePath } from "../src/storage/workspace-hook-trust-store.js";

test("Agent defaults use the Desktop data base directory when provided", async () => {
  const previous = process.env.KAYINGCODE_DATA_BASE_DIR;
  // 基目录必须是本平台的绝对路径：resolveWorkspaceHookTrustStorePath 会 resolve() 基目录，
  // 在 Windows 上 "/tmp/..." 会被解析成 "D:\\tmp\\..."，与 join() 的原始字符串不一致。
  const dataBaseDir = mkdtempSync(join(tmpdir(), "kaying-agent-data-root-"));
  process.env.KAYINGCODE_DATA_BASE_DIR = dataBaseDir;
  try {
    assert.equal(getDefaultLogDir(), join(dataBaseDir, ".kayingcode/cli/log"));
    assert.equal(getDefaultSessionDbPath(), join(dataBaseDir, ".kayingcode/cli/db/db.sqlite"));
    assert.equal(resolveDefaultOutputRootDir(), join(dataBaseDir, ".kayingcode/cli/exec"));
    assert.equal(getDefaultWorkflowRoot(), join(dataBaseDir, ".kayingcode/cli/workflows"));
    assert.equal(
      await resolveWorkspaceHookTrustStorePath(),
      join(dataBaseDir, ".kayingcode/security/workspace-hook-trust-v1.json"),
    );
  } finally {
    if (previous === undefined) delete process.env.KAYINGCODE_DATA_BASE_DIR;
    else process.env.KAYINGCODE_DATA_BASE_DIR = previous;
    rmSync(dataBaseDir, { recursive: true, force: true });
  }
});
