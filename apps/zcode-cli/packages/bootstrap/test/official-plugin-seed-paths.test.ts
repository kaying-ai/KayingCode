import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildSeedAllowedTopLevelPaths,
  findMissingOfficialPluginSeedPaths,
  shouldIncludePluginFile,
} from "../src/app/official-plugin-seed-paths.js";
import { OFFICIAL_PLUGIN_DEFINITIONS } from "../src/app/official-plugin-definitions.js";

const OFFICIAL_DEVELOPER = "kayingai.com";

async function readPluginManifest(relativePath: string): Promise<{
  author?: { name?: string };
}> {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8")) as {
    author?: { name?: string };
  };
}

test("官方内置插件的开发者统一为 kayingai.com", async () => {
  const expectedAuthor = {
    name: OFFICIAL_DEVELOPER,
    url: "https://kayingai.com",
  };
  for (const definition of OFFICIAL_PLUGIN_DEFINITIONS) {
    if (definition.listing) {
      assert.deepEqual(definition.listing.author, expectedAuthor, definition.name);
    }
  }

  const [browserUseManifest, computerUseManifest, nodeReplHostManifest, taptapMakerManifest] =
    await Promise.all([
      readPluginManifest("../../../apps/zcode-cli/packages/browser-use-plugin/.kayingcode-plugin/plugin.json"),
      readPluginManifest("../../../apps/zcode-cli/packages/kaying-computer-use-plugin/.kayingcode-plugin/plugin.json"),
      readPluginManifest("../../node-repl-host/.kayingcode-plugin/plugin.json"),
      readPluginManifest("../../../apps/zcode-cli/packages/kaying-for-taptap-plugin/.kayingcode-plugin/plugin.json"),
    ]);
  assert.equal(browserUseManifest.author?.name, OFFICIAL_DEVELOPER);
  assert.equal(computerUseManifest.author?.name, OFFICIAL_DEVELOPER);
  assert.equal(nodeReplHostManifest.author?.name, OFFICIAL_DEVELOPER);
  assert.equal(taptapMakerManifest.author?.name, OFFICIAL_DEVELOPER);
});

test("requiredSeedPaths 的顶层段自动进入 seed 白名单", () => {
  const allowed = buildSeedAllowedTopLevelPaths({
    requiredSeedPaths: [
      "THIRD_PARTY_NOTICES.md",
      "vendor/instant-games-open-mcp/dist/maker.js",
      "dist/mcp/server.js",
    ],
    runtimeTopLevelPaths: ["bin", "vendor"],
  });
  // 曾因不在白名单被静默裁掉，导致 TapTap Maker seed 永久失败。
  assert.ok(allowed.has("THIRD_PARTY_NOTICES.md"));
  assert.ok(allowed.has("vendor"));
  assert.ok(allowed.has("dist"));
  assert.ok(allowed.has("bin"));
});

test("THIRD_PARTY_NOTICES.md 等许可文件默认可被收集", () => {
  const allowed = buildSeedAllowedTopLevelPaths({});
  for (const name of [
    "THIRD_PARTY_NOTICES.md",
    "NOTICE.md",
    "LICENSE",
    "LICENSE.md",
    "README.md",
  ]) {
    assert.ok(allowed.has(name), `${name} should be in seed allowlist`);
    assert.ok(shouldIncludePluginFile(name, allowed));
  }
});

test("存在 required 文件时 findMissing 为空，不再误报 seed 不完整", () => {
  const definition = {
    requiredSeedPaths: ["THIRD_PARTY_NOTICES.md", "dist/mcp/server.js"],
  };
  const allowed = buildSeedAllowedTopLevelPaths(definition);
  const collected = [
    { path: "THIRD_PARTY_NOTICES.md" },
    { path: "dist/mcp/server.js" },
    { path: "skills/game-qa/SKILL.md" },
  ].filter((file) => shouldIncludePluginFile(file.path, allowed));

  assert.deepEqual(findMissingOfficialPluginSeedPaths(definition, collected), []);
});

test("shouldIncludePluginFile 仍过滤垃圾文件", () => {
  const allowed = buildSeedAllowedTopLevelPaths({});
  assert.equal(shouldIncludePluginFile("skills/.DS_Store", allowed), false);
  assert.equal(shouldIncludePluginFile("skills/foo.pyc", allowed), false);
  assert.equal(shouldIncludePluginFile("node_modules/leftpad/index.js", allowed), false);
});

/**
 * 构建期生成的 requiredSeedPaths 资产：源码级单测跑在未构建插件的干净检出上，
 * 这些文件由打包链（build-desktop-agent-cli / prepare-agent-node-bundle / SEA）
 * 在构建后断言。dist/bin 段统一按构建产物跳过；browser-client.mjs 是
 * browser-use scripts/build.mjs 的 esbuild 产物，同样不在源码树里。
 */
const GENERATED_REQUIRED_SEED_PATHS = new Set(["scripts/browser-client.mjs"]);

/**
 * 机械对照 definition 与源码包：休眠插件源码目录被删后 definition 仍在，seed 会静默跳过；
 * 反过来，包存在而 definition 版本/必需路径不一致时，会 seed 出残缺插件或加载旧缓存。
 * 该用例把「声明 ↔ 实存」钉住，任何一侧漂移都在单测期炸掉。
 */
test("definition 与源码包机械对照：manifest 名称/版本、requiredSeedPaths、开发者一致", async () => {
  // import.meta.url = apps/zcode-cli/packages/bootstrap/test/*.test.ts
  const cliRoot = join(fileURLToPath(import.meta.url), "..", "..", "..", "..");
  let existingPackages = 0;
  for (const definition of OFFICIAL_PLUGIN_DEFINITIONS) {
    const packageRoot = definition.rootCandidates
      .map((candidate) => join(cliRoot, candidate))
      .find((candidatePath) => existsSync(candidatePath));

    if (!packageRoot) {
      // 休眠定义（root 不存在 → seed 静默跳过）允许保留；有 listing 的休眠定义要留注释说明原因。
      continue;
    }
    existingPackages += 1;

    const manifestPath = join(packageRoot, ".kayingcode-plugin", "plugin.json");
    assert.ok(existsSync(manifestPath), `${definition.name}: 缺少 .kayingcode-plugin/plugin.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      name?: unknown;
      version?: unknown;
      author?: { name?: unknown };
    };
    assert.equal(
      manifest.name,
      definition.name,
      `${definition.name}: manifest.name 与 definition 不一致（seed 缓存目录按 name 组织）`,
    );
    assert.equal(
      manifest.version,
      definition.version,
      `${definition.name}: manifest.version 与 definition 不一致（三处版本必须同步：package/manifest/definition）`,
    );

    for (const requiredPath of definition.requiredSeedPaths ?? []) {
      if (
        GENERATED_REQUIRED_SEED_PATHS.has(requiredPath) ||
        // dist/bin 段是构建产物（node-repl-host、taptap、cua 的 runtime 与 native），
        // 由打包链（build-desktop-agent-cli / prepare-agent-node-bundle / SEA）断言，
        // 源码级单测只钉住提交进仓库的静态资产。
        requiredPath.split("/").some((segment) => segment === "dist" || segment === "bin")
      ) {
        continue;
      }
      assert.ok(
        existsSync(join(packageRoot, ...requiredPath.split("/"))),
        `${definition.name}: requiredSeedPaths 缺文件 ${requiredPath}`,
      );
    }

    if (definition.listing) {
      assert.equal(
        manifest.author?.name,
        OFFICIAL_DEVELOPER,
        `${definition.name}: 有 listing 的官方插件 manifest 作者必须是 ${OFFICIAL_DEVELOPER}`,
      );
    }
  }
  // 防止测试本身退化成空转：本仓库至少要找到已实存的内置插件包。
  assert.ok(existingPackages >= 4, `official plugin 源码包实存数异常：${existingPackages}`);
});
