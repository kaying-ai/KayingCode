import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ensureAgentCliShim, resolveAgentCliShimInvocation } from "../src/agent-cli-shim.ts";

test("source entry resolves to the built bundle next to the package", async () => {
  const invocation = await resolveAgentCliShimInvocation({
    execPath: "/usr/bin/node",
    scriptPath: "/repo/apps/zcode-cli/packages/cli/src/main.ts",
    electron: false,
    exists: async (path) => path === "/repo/apps/zcode-cli/packages/cli/dist/kayingcode.cjs",
  });
  assert.deepEqual(invocation, {
    command: "/usr/bin/node",
    entry: "/repo/apps/zcode-cli/packages/cli/dist/kayingcode.cjs",
    electronRunAsNode: undefined,
  });
});

test("source entry without a built bundle is skipped instead of guessing", async () => {
  assert.equal(
    await resolveAgentCliShimInvocation({
      execPath: "/usr/bin/node",
      scriptPath: "/repo/src/main.ts",
      electron: false,
      exists: async () => false,
    }),
    null,
  );
});

test("packaged electron runs the bundle in node mode", async () => {
  const invocation = await resolveAgentCliShimInvocation({
    execPath: "/Applications/KayingCode.app/Contents/MacOS/KayingCode Helper",
    scriptPath: "/Applications/KayingCode.app/Contents/Resources/glm/kayingcode.cjs",
    electron: true,
    exists: async () => true,
  });
  assert.deepEqual(invocation, {
    command: "/Applications/KayingCode.app/Contents/MacOS/KayingCode Helper",
    entry: "/Applications/KayingCode.app/Contents/Resources/glm/kayingcode.cjs",
    electronRunAsNode: true,
  });
});

test("standalone binary without a script argument points at itself", async () => {
  assert.deepEqual(
    await resolveAgentCliShimInvocation({
      execPath: "/usr/local/bin/kayingcode",
      scriptPath: null,
      electron: false,
    }),
    { command: "/usr/local/bin/kayingcode", electronRunAsNode: undefined },
  );
});

test("single-executable runtime points at itself even with subcommands", async () => {
  assert.deepEqual(
    await resolveAgentCliShimInvocation({
      execPath: "/usr/local/bin/kayingcode",
      scriptPath: "app-server",
      electron: false,
      sea: true,
    }),
    { command: "/usr/local/bin/kayingcode", electronRunAsNode: undefined },
  );
});

test("unknown script argument does not create a broken shim", async () => {
  assert.equal(
    await resolveAgentCliShimInvocation({
      execPath: "/usr/local/bin/kayingcode",
      scriptPath: "app-server",
      electron: false,
      exists: async () => false,
    }),
    null,
  );
});

test("ensureAgentCliShim writes a private executable shim and is idempotent", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-cli-shim-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = { KAYINGCODE_DATA_BASE_DIR: root };
  const invocation = { command: "/usr/bin/node", entry: "/repo/dist/kayingcode.cjs" };

  await ensureAgentCliShim({ env, invocation, platform: "linux" });
  const directory = join(root, ".kayingcode", "bin");
  const scriptPath = join(directory, "kayingcode");
  const first = await readFile(scriptPath, "utf8");
  assert.match(first, /^#!\/bin\/sh/u);
  assert.match(first, /'\/usr\/bin\/node' '\/repo\/dist\/kayingcode\.cjs' "\$@"/u);
  assert.equal((await stat(scriptPath)).mode & 0o777, 0o755);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);

  await ensureAgentCliShim({ env, invocation, platform: "linux" });
  assert.equal(await readFile(scriptPath, "utf8"), first);
});

test("ensureAgentCliShim writes a cmd shim on windows", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-cli-shim-win-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = { KAYINGCODE_DATA_BASE_DIR: root };
  await ensureAgentCliShim({
    env,
    invocation: {
      command: "C:\\Program Files\\KayingCode\\KayingCode.exe",
      entry: "C:\\KayingCode\\kayingcode.cjs",
      electronRunAsNode: true,
    },
    platform: "win32",
  });
  const cmd = await readFile(join(root, ".kayingcode", "bin", "kayingcode.cmd"), "utf8");
  assert.match(cmd, /^@echo off\r\n/u);
  assert.match(cmd, /set "ELECTRON_RUN_AS_NODE=1"/u);
});

test("ensureAgentCliShim swallows write failures", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-cli-shim-fail-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  // 把数据目录占成普通文件：mkdtemp 下创建同名文件，mkdir 必然失败。
  const blocked = join(root, "blocked");
  await writeFile(blocked, "");
  await chmod(blocked, 0o444);
  await ensureAgentCliShim({
    env: { KAYINGCODE_DATA_BASE_DIR: blocked },
    invocation: { command: "/usr/bin/node", entry: "/repo/dist/kayingcode.cjs" },
    platform: "linux",
  });
});
