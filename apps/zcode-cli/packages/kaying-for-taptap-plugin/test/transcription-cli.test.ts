import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  runTranscriptionCli,
  validateTranscriptionInvocation,
} from "../src/tools/transcription-cli.js";

test("transcription tool resolves and runs the bundled binary without a PATH lookup", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "kayingcode-t3m-runtime-"));
  try {
    const result = await runTranscriptionCli({ command: "doctor" }, workspace);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^t3m 0\.2\.6/mu);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("transcription invocation accepts declared commands and workspace-local paths", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "kayingcode-t3m-tool-"));
  try {
    const project = join(workspace, "convert_game_demo");
    await mkdir(join(project, "source"), { recursive: true });
    await writeFile(join(project, "source", "index.html"), "<canvas></canvas>");

    const doctor = await validateTranscriptionInvocation(
      { command: "doctor", cwd: "convert_game_demo" },
      workspace,
    );
    assert.equal(doctor.cwd, await realpath(project));
    await validateTranscriptionInvocation(
      {
        command: "analyze",
        cwd: "convert_game_demo",
        arguments: ["source", "--out", "source/report.md"],
      },
      workspace,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("transcription invocation rejects lexical and symlink workspace escapes", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "kayingcode-t3m-workspace-"));
  const outside = await mkdtemp(join(tmpdir(), "kayingcode-t3m-outside-"));
  try {
    await symlink(outside, join(workspace, "escape"));
    await assert.rejects(
      validateTranscriptionInvocation(
        {
          command: "fetch",
          arguments: ["https://example.com/game", "--out", "../outside"],
        },
        workspace,
      ),
      /must stay inside/u,
    );
    await assert.rejects(
      validateTranscriptionInvocation({ command: "lint", arguments: ["escape"] }, workspace),
      /resolves outside/u,
    );
  } finally {
    await Promise.all([
      rm(workspace, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  }
});

test("transcription invocation rejects unknown flags before spawning", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "kayingcode-t3m-flags-"));
  try {
    await assert.rejects(
      validateTranscriptionInvocation(
        { command: "doctor", arguments: ["--download-runtime"] },
        workspace,
      ),
      /Unexpected flag/u,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
