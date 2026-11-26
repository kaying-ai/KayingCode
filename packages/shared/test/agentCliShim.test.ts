import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "vitest";
import {
  AGENT_CLI_SHIM_COMMAND,
  buildAgentCliPosixShim,
  buildAgentCliWindowsShim,
  prependAgentCliShimPath,
  resolveAgentCliShimDir,
  resolveAgentCliShimPath,
} from "../src/agent-cli-shim/index.js";

test("shim dir follows KAYINGCODE_DATA_BASE_DIR then HOME", () => {
  assert.equal(
    resolveAgentCliShimDir({ KAYINGCODE_DATA_BASE_DIR: "/data", HOME: "/home/me" }),
    join("/data", ".kayingcode", "bin"),
  );
  assert.equal(
    resolveAgentCliShimDir({ HOME: "/home/me" }),
    join("/home/me", ".kayingcode", "bin"),
  );
  assert.equal(
    resolveAgentCliShimDir({ KAYINGCODE_DATA_BASE_DIR: "  ", USERPROFILE: "C:\\Users\\me" }),
    join("C:\\Users\\me", ".kayingcode", "bin"),
  );
});

test("shim path uses cmd on windows and a bare command elsewhere", () => {
  const env = { HOME: "/home/me" };
  assert.equal(
    resolveAgentCliShimPath(env, "linux"),
    join("/home/me", ".kayingcode", "bin", AGENT_CLI_SHIM_COMMAND),
  );
  assert.equal(
    resolveAgentCliShimPath(env, "win32"),
    join("/home/me", ".kayingcode", "bin", `${AGENT_CLI_SHIM_COMMAND}.cmd`),
  );
});

test("prepend keeps the existing path and does not duplicate", () => {
  const shimDir = join("/home/me", ".kayingcode", "bin");
  assert.equal(
    prependAgentCliShimPath("/usr/bin:/bin", shimDir, "linux"),
    `${shimDir}:/usr/bin:/bin`,
  );
  assert.equal(
    prependAgentCliShimPath(`/usr/bin:${shimDir}`, shimDir, "linux"),
    `/usr/bin:${shimDir}`,
  );
  assert.equal(prependAgentCliShimPath("C:\\Tools;", shimDir, "win32"), `${shimDir};C:\\Tools`);
});

test("posix shim quotes executor and entry", () => {
  const script = buildAgentCliPosixShim({
    command: "/Applications/Kaying Code.app/Contents/MacOS/app",
    entry: "/data/a b/kayingcode.cjs",
    electronRunAsNode: true,
  });
  assert.match(script, /^#!\/bin\/sh/u);
  assert.match(script, /ELECTRON_RUN_AS_NODE=1 '\/Applications\/Kaying Code\.app/u);
  assert.match(script, /'\/data\/a b\/kayingcode\.cjs' "\$@"/u);
  assert.match(script, /\n$/u);
});

test("posix shim escapes single quotes", () => {
  const script = buildAgentCliPosixShim({ command: "/tmp/it's/node" });
  assert.match(script, /'\/tmp\/it'\\''s\/node' "\$@"/u);
});

test("windows shim uses cmd quoting and forwards all arguments", () => {
  const script = buildAgentCliWindowsShim({
    command: "C:\\Program Files\\KayingCode\\app.exe",
    entry: "C:\\data\\kayingcode.cjs",
    electronRunAsNode: true,
  });
  assert.match(script, /^@echo off\r\n/u);
  assert.match(script, /set "ELECTRON_RUN_AS_NODE=1"/u);
  assert.match(
    script,
    /"C:\\Program Files\\KayingCode\\app\.exe" "C:\\data\\kayingcode\.cjs" %\*\r\n$/u,
  );
});
