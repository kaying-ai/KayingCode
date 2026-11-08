import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const entries = [
  "apps/zcode-cli/packages/cli/dist/kayingcode.cjs",
  `packages/desktop/bundled-agents/${process.platform}-${process.arch}/glm/kayingcode.cjs`,
];

for (const entry of entries) {
  test(`从仓库外发现完整内置插件：${entry}`, { timeout: 60000 }, async (t) => {
    const root = await mkdtemp(join(tmpdir(), "official-plugin-discovery-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const storage = join(root, "cli");
    const { stdout } = await execute(
      process.execPath,
      [join(repoRoot, entry), "plugins", "list", "--available", "--json"],
      {
        cwd: root,
        env: { ...process.env, KAYINGCODE_STORAGE_DIR: storage },
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const outcome = JSON.parse(stdout);
    const id = "blender@kayingcode-plugins-official";
    assert.ok(outcome.available.some((plugin) => plugin.id === id));
    const blender = outcome.installed.find((plugin) => plugin.id === id);
    assert.ok(blender, "Blender must be discovered as a builtin without local installation");
    assert.equal(blender.enabled, false);
    assert.equal(blender.source, "official");
    assert.deepEqual(blender.declaredMcpServerNames, ["blender", "blender_doctor"]);
    const configuration = JSON.parse(
      await readFile(join(repoRoot, "config/official-plugins.json")),
    );
    const marketplace = JSON.parse(
      await readFile(
        join(storage, "plugins/marketplaces/kayingcode-plugins-official/marketplace.json"),
      ),
    );
    assert.deepEqual(
      marketplace.plugins.map((plugin) => plugin.name).sort(),
      configuration.plugins.map((plugin) => plugin.name).sort(),
    );
  });
}
