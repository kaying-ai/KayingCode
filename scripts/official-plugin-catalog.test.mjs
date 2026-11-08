import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import {
  loadOfficialPluginCatalog,
  runtimePluginDefinitions,
  selectOfficialPluginProfile,
} from "./official-plugin-catalog.mjs";
import { generateOfficialPluginCatalog } from "./generate-official-plugin-catalog.mjs";
import { computeAgentBuildFingerprint } from "./agent-build-fingerprint.mjs";

async function fixture(t, modify = () => {}) {
  const root = await mkdtemp(join(tmpdir(), "official-catalog-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const record = {
    name: "example",
    sourceRoot: "plugins/example",
    stagedPath: "packages/example-plugin",
    deliveryKind: "native",
    rootCandidates: ["packages/example-plugin", "plugins/example"],
    requiredSeedPaths: ["skills/readme.md"],
    buildScript: "build",
    requiredRuntimePaths: ["dist/server.js"],
    nativeRequiredPaths: { all: ["native/{platformKey}/server{executableSuffix}"] },
  };
  const config = {
    schemaVersion: 1,
    marketplace: "kayingcode-plugins-official",
    plugins: [record],
  };
  const manifest = { name: "example", version: "1.2.3" };
  const pkg = {
    name: "@kayingcode/example-plugin",
    version: "1.2.3",
    scripts: { build: "node build.mjs" },
  };
  modify({ config, record, manifest, pkg });
  for (const directory of [
    "config",
    "plugins/example/.kayingcode-plugin",
    "plugins/example/skills",
    "apps/zcode-cli/packages/contracts/src/plugins",
  ])
    await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, "config/official-plugins.json"), JSON.stringify(config));
  await writeFile(join(root, "plugins/example/package.json"), JSON.stringify(pkg));
  await writeFile(
    join(root, "plugins/example/.kayingcode-plugin/plugin.json"),
    JSON.stringify(manifest),
  );
  await writeFile(join(root, "plugins/example/skills/readme.md"), "skill");
  return root;
}

test("target expansion uses release target instead of build host; runtime assets fail closed", async (t) => {
  const root = await fixture(t);
  const windows = await loadOfficialPluginCatalog(root, { target: "win-x64" });
  assert.equal(windows.target, "win32-x64");
  assert.deepEqual(windows.plugins[0].requiredRuntimePaths, [
    "dist/server.js",
    "native/win32-x64/server.exe",
  ]);
  const linux = await loadOfficialPluginCatalog(root, { target: "linux-arm64" });
  assert.equal(linux.plugins[0].requiredRuntimePaths[1], "native/linux-arm64/server");
  await assert.rejects(
    loadOfficialPluginCatalog(root, { target: "linux-arm64", requireRuntime: true }),
    /missing dist\/server.js/,
  );
  await assert.rejects(loadOfficialPluginCatalog(root, { target: "linux-ia32" }), /Unsupported/);
});

test("rejects identity/version drift and duplicate release destinations", async (t) => {
  const drift = await fixture(t, ({ pkg }) => {
    pkg.version = "2.0.0";
  });
  await assert.rejects(loadOfficialPluginCatalog(drift), /version mismatch/);
  const duplicate = await fixture(t, ({ config, record }) => {
    config.plugins.push({ ...record });
  });
  await assert.rejects(loadOfficialPluginCatalog(duplicate), /Duplicate/);
});

test("rejects path escape, missing static skills, and missing build commands", async (t) => {
  const escape = await fixture(t, ({ record }) => {
    record.sourceRoot = "../example";
  });
  await assert.rejects(loadOfficialPluginCatalog(escape), /confined/);
  const missing = await fixture(t, ({ record }) => {
    record.requiredSeedPaths.push("skills/missing.md");
  });
  await assert.rejects(loadOfficialPluginCatalog(missing), /missing skills\/missing.md/);
  const command = await fixture(t, ({ pkg }) => {
    pkg.scripts = {};
  });
  await assert.rejects(loadOfficialPluginCatalog(command), /missing package script build/);
});

test("generation detects manifest upgrades; compatibility entries never enter release artifacts", async (t) => {
  const root = await fixture(t, ({ config, record }) => {
    config.compatibilityDefinitions = [
      { name: "retired", version: "0.0.1", rootCandidates: ["packages/retired"] },
    ];
    record.listing = { displayName: "literal ` ${process.exit()} \\ text" };
  });
  const catalog = await generateOfficialPluginCatalog(root);
  assert.equal(catalog.plugins.length, 1);
  assert.equal(runtimePluginDefinitions(catalog).length, 2);
  await generateOfficialPluginCatalog(root, { check: true });
  const generated = await readFile(
    join(
      root,
      "apps/zcode-cli/packages/contracts/src/plugins/official-plugin-catalog.generated.ts",
    ),
    "utf8",
  );
  const javascript = ts.transpileModule(generated, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText;
  const runtime = await import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
  );
  assert.equal(
    runtime.GENERATED_OFFICIAL_PLUGIN_DEFINITIONS[0].listing.displayName,
    "literal ` ${process.exit()} \\ text",
  );
  const changed = JSON.parse(await readFile(join(root, "plugins/example/package.json"), "utf8"));
  changed.version = "1.2.4";
  await writeFile(join(root, "plugins/example/package.json"), JSON.stringify(changed));
  await writeFile(
    join(root, "plugins/example/.kayingcode-plugin/plugin.json"),
    JSON.stringify({ name: "example", version: "1.2.4" }),
  );
  await assert.rejects(generateOfficialPluginCatalog(root, { check: true }), /stale/);
});

test("repository catalog includes all current shipped plugins and hidden node host", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const catalog = await loadOfficialPluginCatalog(root);
  assert.equal(catalog.plugins.length, 16);
  assert.equal(
    catalog.plugins.filter(({ sourceRoot }) => sourceRoot.startsWith("plugins/")).length,
    15,
  );
  assert.equal(
    catalog.plugins.find(({ name }) => name === "kaying-game-playtest").defaultEnabled,
    true,
  );
  assert.equal(
    catalog.plugins.some(({ name }) => name === "scene-studio"),
    false,
  );
  assert.equal(
    runtimePluginDefinitions(catalog).some(({ name }) => name === "scene-studio"),
    false,
  );
  assert.equal(catalog.plugins.find(({ name }) => name === "node-repl-host").listing, undefined);
  assert.equal(catalog.compatibilityDefinitions[0].name, "restore-legacy-sessions");
  assert.deepEqual(
    selectOfficialPluginProfile(catalog, "remotePrebuild").map(({ name }) => name),
    ["browser-use", "node-repl-host"],
  );
  assert.throws(() => selectOfficialPluginProfile(catalog, "missing"), /Unknown/);
});

const generatedPaths = [
  "apps/zcode-cli/packages/contracts/src/plugins/official-plugin-catalog.generated.ts",
  "packages/shared/src/official-plugin-defaults.generated.ts",
];

test("unchanged generation preserves read-only outputs, mtimes, and the desktop build fingerprint", async (t) => {
  const root = await fixture(t);
  await generateOfficialPluginCatalog(root);
  const timestamp = new Date("2020-01-01T00:00:00Z");
  for (const relativePath of generatedPaths) {
    const path = join(root, relativePath);
    const content = await readFile(path, "utf8");
    await writeFile(path, content.replace(/\r?\n/g, "\r\n"));
    await utimes(path, timestamp, timestamp);
    await chmod(path, 0o444);
  }
  const fingerprint = computeAgentBuildFingerprint(root);
  await generateOfficialPluginCatalog(root);
  await generateOfficialPluginCatalog(root, { check: true });
  for (const relativePath of generatedPaths) {
    const path = join(root, relativePath);
    assert.equal((await stat(path)).mtimeMs, timestamp.getTime());
    assert.ok((await readFile(path, "utf8")).includes("\r\n"));
  }
  assert.equal(computeAgentBuildFingerprint(root), fingerprint);
});

test("changed catalog and defaults update outputs and invalidate the desktop fingerprint", async (t) => {
  const root = await fixture(t);
  await generateOfficialPluginCatalog(root);
  const fingerprint = computeAgentBuildFingerprint(root);
  const configPath = join(root, "config/official-plugins.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.plugins[0].defaultEnabled = true;
  config.plugins[0].listing = { displayName: "Updated example" };
  await writeFile(configPath, JSON.stringify(config));
  await assert.rejects(generateOfficialPluginCatalog(root, { check: true }), /stale/);
  await generateOfficialPluginCatalog(root);
  await generateOfficialPluginCatalog(root, { check: true });
  assert.match(await readFile(join(root, generatedPaths[0]), "utf8"), /Updated example/);
  assert.match(
    await readFile(join(root, generatedPaths[1]), "utf8"),
    /example@kayingcode-plugins-official/,
  );
  assert.notEqual(computeAgentBuildFingerprint(root), fingerprint);
});

test("generation creates missing directories and repairs missing outputs; check stays read-only", async (t) => {
  const root = await fixture(t);
  await rm(join(root, "packages"), { recursive: true, force: true });
  await assert.rejects(generateOfficialPluginCatalog(root, { check: true }), /stale/);
  await assert.rejects(stat(join(root, "packages")), { code: "ENOENT" });
  await generateOfficialPluginCatalog(root);
  for (const relativePath of generatedPaths) {
    const path = join(root, relativePath);
    await rm(path);
    await assert.rejects(generateOfficialPluginCatalog(root, { check: true }), /stale/);
    await assert.rejects(stat(path), { code: "ENOENT" });
    await generateOfficialPluginCatalog(root);
  }
  await generateOfficialPluginCatalog(root, { check: true });
});

test("release profiles reject retired or unknown plugins instead of expanding the delivery scope", async (t) => {
  const root = await fixture(t, ({ config }) => {
    config.releaseProfiles = { remotePrebuild: ["retired"] };
  });
  await assert.rejects(loadOfficialPluginCatalog(root), /Invalid official plugin release profile/);
});
