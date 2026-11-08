import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);

test(
  "Windows native feedback renders a persistent pointer and transparent target at multiple DPIs",
  {
    skip: process.platform !== "win32",
    timeout: 30_000,
  },
  async () => {
    const { stdout } = await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        fileURLToPath(new URL("fixtures/windows-visual-feedback.ps1", import.meta.url)),
      ],
      { windowsHide: true },
    );
    assert.match(stdout, /visual feedback: OK/u);
  },
);

test(
  "Windows feedback E2E: input passes through, target follows geometry, capture and takeover clear safely",
  {
    skip: process.platform !== "win32" || process.env.KAYING_COMPUTER_USE_TEST_INTERACTIVE !== "1",
    timeout: 45_000,
  },
  async () => {
    const { stdout } = await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        fileURLToPath(new URL("fixtures/windows-visual-feedback-e2e.ps1", import.meta.url)),
      ],
      { windowsHide: true },
    );
    assert.match(stdout, /visual feedback E2E: OK/u);
  },
);
