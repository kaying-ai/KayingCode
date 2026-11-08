import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveDevelopmentPluginBase } from "../src/app/official-plugin-source-paths.js";

test("开发 CLI 与暂存入口可定位仓库源码根，不依赖 cwd", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "plugin-source-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "config"));
  await mkdir(join(root, "apps/zcode-cli/packages/cli"), { recursive: true });
  await writeFile(join(root, "config/official-plugins.json"), "{}");
  await writeFile(join(root, "apps/zcode-cli/packages/cli/package.json"), "{}");
  assert.equal(resolveDevelopmentPluginBase(join(root, "apps/zcode-cli/packages/cli/dist")), root);
  for (const platform of ["darwin-arm64", "win32-x64", "linux-x64"]) {
    assert.equal(
      resolveDevelopmentPluginBase(
        join(root, "packages/desktop/bundled-agents", platform, "glm"),
      ),
      root,
    );
  }
  assert.equal(resolveDevelopmentPluginBase(join(root, "workspaces/project/dist")), undefined);
  assert.equal(
    resolveDevelopmentPluginBase(join(root, "Applications/KayingCode.app/Contents/Resources/glm")),
    undefined,
  );
  assert.equal(resolveDevelopmentPluginBase(undefined), undefined);
  await rm(join(root, "config/official-plugins.json"));
  assert.equal(resolveDevelopmentPluginBase(join(root, "apps/zcode-cli/packages/cli/dist")), undefined);
});
