import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cliRoot = resolve(import.meta.dirname, "..");
const cliEntry = join(cliRoot, "src", "main.ts");
const processTimeoutMs = 60_000;
const pluginIdEnvKey = "KAYINGCODE_PLUGIN_ID";
const zcodePluginIdEnvKey = "ZCODE_PLUGIN_ID";
const officialPluginId = "documents@kayingcode-plugins-official";

/**
 * 子进程继承当前 shell 的环境，但测试必须自己决定插件身份：
 * 先剔除宿主机可能残留的插件 ID，再合并用例覆盖值，避免本机环境影响断言。
 */
function fixtureEnv(overrides = {}) {
  const env = { ...process.env };
  delete env[pluginIdEnvKey];
  delete env[zcodePluginIdEnvKey];
  return { ...env, ...overrides };
}

function runCli(args, env = fixtureEnv()) {
  return execFileAsync(process.execPath, ["--import", "tsx", cliEntry, ...args], {
    cwd: cliRoot,
    env,
    timeout: processTimeoutMs,
    windowsHide: true,
  });
}

async function writeFixtureServer(t) {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-plugin-host-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const serverPath = join(root, "server.mjs");
  await writeFile(
    serverPath,
    [
      "const titleAtImport = process.title;",
      "export async function main() {",
      "  process.stdout.write(JSON.stringify({",
      "    args: process.argv.slice(1),",
      "    pluginId: process.env.KAYINGCODE_PLUGIN_ID,",
      "    titleAtImport,",
      "    titleAtMain: process.title,",
      "    zcodePluginId: process.env.ZCODE_PLUGIN_ID,",
      "  }));",
      "}",
      "",
    ].join("\n"),
  );
  return serverPath;
}

test("doctor reports the CLI process identity even with a plugin id in the environment", async () => {
  const { stdout } = await runCli(
    ["doctor", "--json"],
    fixtureEnv({ [pluginIdEnvKey]: officialPluginId }),
  );
  const payload = JSON.parse(stdout);

  assert.equal(payload.cli.name, "kayingcode");
  assert.equal(payload.cli.processName, "kayingcode-cli");
  assert.equal(payload.runtime.processTitle, "kayingcode-cli");
});

test("plugin host entry resolves the server and reports the branded process name", async (t) => {
  const serverPath = await writeFixtureServer(t);
  const { stdout, stderr } = await runCli(
    ["__kayingcode-plugin-host", serverPath],
    fixtureEnv({
      [pluginIdEnvKey]: officialPluginId,
      [zcodePluginIdEnvKey]: officialPluginId,
    }),
  );

  assert.equal(stderr, "");
  const payload = JSON.parse(stdout);
  assert.equal(payload.titleAtImport, "kayingcode-mcp-documents");
  assert.equal(payload.titleAtMain, "kayingcode-mcp-documents");
  assert.deepEqual(payload.args, [serverPath]);
  assert.equal(payload.pluginId, officialPluginId);
  assert.equal(payload.zcodePluginId, officialPluginId);
});

for (const [label, overrides, expectedTitle] of [
  ["a missing plugin id", {}, "kayingcode-mcp"],
  ["an empty plugin id", { [pluginIdEnvKey]: "" }, "kayingcode-mcp"],
  [
    "a padded mixed-case plugin id",
    { [pluginIdEnvKey]: " ZCode-Site@example-marketplace " },
    "kayingcode-mcp-zcode-site",
  ],
  [
    "an invalid plugin name",
    { [pluginIdEnvKey]: "invalid/name@example-marketplace" },
    "kayingcode-mcp",
  ],
  [
    "only the upstream plugin id variable",
    { [zcodePluginIdEnvKey]: officialPluginId },
    "kayingcode-mcp-documents",
  ],
  [
    "an empty product plugin id with an upstream fallback",
    { [pluginIdEnvKey]: "   ", [zcodePluginIdEnvKey]: officialPluginId },
    "kayingcode-mcp-documents",
  ],
]) {
  test(`plugin host reports ${expectedTitle} for ${label}`, async (t) => {
    const serverPath = await writeFixtureServer(t);
    const { stdout, stderr } = await runCli(
      ["__kayingcode-plugin-host", serverPath],
      fixtureEnv(overrides),
    );

    assert.equal(stderr, "");
    const payload = JSON.parse(stdout);
    assert.equal(payload.titleAtImport, expectedTitle);
    assert.equal(payload.titleAtMain, expectedTitle);
    assert.deepEqual(payload.args, [serverPath]);
  });
}
