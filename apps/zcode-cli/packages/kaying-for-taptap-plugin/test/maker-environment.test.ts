import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  createMakerEnvironment,
  createMakerEnvironmentForTarget,
} from "../src/maker/launcher.js";
import { assertProductionMakerGitRemote } from "../src/maker/git-remote-guard.js";
import { publishTool } from "../src/tools/high-level-tools.js";

const execFileAsync = promisify(execFile);

test("createMakerEnvironment pins production even when the parent leaked rnd", () => {
  const previous = process.env.TAPTAP_MCP_ENV;
  process.env.TAPTAP_MCP_ENV = "rnd";
  try {
    const env = createMakerEnvironment();
    assert.equal(env.TAPTAP_MCP_ENV, "production");
  } finally {
    if (previous === undefined) delete process.env.TAPTAP_MCP_ENV;
    else process.env.TAPTAP_MCP_ENV = previous;
  }
});

test("createMakerEnvironmentForTarget keeps an explicit rnd override", () => {
  const previous = process.env.TAPTAP_MCP_ENV;
  process.env.TAPTAP_MCP_ENV = "production";
  try {
    const env = createMakerEnvironmentForTarget("rnd");
    assert.equal(env.TAPTAP_MCP_ENV, "rnd");
    const production = createMakerEnvironmentForTarget("production");
    assert.equal(production.TAPTAP_MCP_ENV, "production");
  } finally {
    if (previous === undefined) delete process.env.TAPTAP_MCP_ENV;
    else process.env.TAPTAP_MCP_ENV = previous;
  }
});

test("assertProductionMakerGitRemote rejects the internal rnd Git host", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "kaying-for-taptap-env-"));
  try {
    await execFileAsync("git", ["init", projectRoot]);
    await execFileAsync("git", [
      "-C",
      projectRoot,
      "remote",
      "add",
      "origin",
      "https://git:tmpct_x@fuping.agnt.xd.com/git/demo.git",
    ]);
    await assert.rejects(
      assertProductionMakerGitRemote(projectRoot),
      /wrong_maker_environment|not the production Maker remote/u,
    );
    await execFileAsync("git", [
      "-C",
      projectRoot,
      "remote",
      "set-url",
      "origin",
      "https://git:tmpct_x@maker.taptap.cn/git/demo.git",
    ]);
    await assertProductionMakerGitRemote(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("assertProductionMakerGitRemote rejects a missing origin", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "kaying-for-taptap-noorigin-"));
  try {
    await execFileAsync("git", ["init", projectRoot]);
    await assert.rejects(
      assertProductionMakerGitRemote(projectRoot),
      /missing_git_remote|no Git origin/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("publish tool schema warns that rnd is internal and defaults to production", () => {
  const schema = publishTool.inputSchema as {
    properties?: { env?: { description?: string; enum?: string[] } };
  };
  const env = schema.properties?.env;
  assert.ok(env);
  assert.deepEqual(env.enum, ["rnd", "production"]);
  assert.match(env.description ?? "", /production/i);
  assert.match(env.description ?? "", /rnd/i);
  assert.match(env.description ?? "", /internal|unreachable|Do not pass/i);
});

// Keep a tiny on-disk fixture so the suite documents the expected remote shape.
test("production Maker remote host constant matches the public endpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "kaying-for-taptap-host-"));
  try {
    await mkdir(path.join(root, ".git"), { recursive: true });
    await writeFile(path.join(root, "note.txt"), "ok\n");
    // Host allowlist lives next to the guard; re-read via the public helper path.
    await execFileAsync("git", ["init", root]);
    await execFileAsync("git", [
      "-C",
      root,
      "remote",
      "add",
      "origin",
      "https://maker.taptap.cn/git/02e3d39f-04a5-40cc-a4e4-59018abae628.git",
    ]);
    await assertProductionMakerGitRemote(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
