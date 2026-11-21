import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  addonModuleName,
  parseBlenderVersion,
  resolveBlenderPaths,
  safeToSavePreferences,
} from "../scripts/blender-paths.mjs";
import { discoverBlender, installAddon } from "../scripts/install-addon.mjs";
import { pluginRoot } from "../scripts/runtime.mjs";

const execute = promisify(execFile);

const version = { major: 5, minor: 2, patch: 1, label: "5.2.1" };

async function staged(t) {
  const base = await mkdtemp(join(tmpdir(), "blender-install-test-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, "plugin");
  await mkdir(root);
  await cp(join(pluginRoot, "vendor"), join(root, "vendor"), { recursive: true });
  await cp(join(pluginRoot, "upstream-lock.json"), join(root, "upstream-lock.json"));
  const config = join(base, "custom", "config");
  const scripts = join(base, "custom", "scripts");
  await mkdir(config, { recursive: true });
  await mkdir(scripts, { recursive: true });
  await writeFile(join(config, "userpref.blend"), "prefs");
  const env = {
    ...process.env,
    BLENDER_USER_CONFIG: config,
    BLENDER_USER_SCRIPTS: scripts,
    BLENDER_PORT: "9876",
  };
  delete env.BLENDER_HOST;
  delete env.BLENDER_EXECUTABLE;
  return {
    base,
    root,
    config,
    scripts,
    env,
    blender: { executable: join(base, "Blender", "blender"), version },
  };
}

async function copyAddonHash(root) {
  const lock = JSON.parse(await readFile(join(root, "upstream-lock.json"), "utf8"));
  return lock.files["addon.py"];
}

test("Blender version and isolated config paths resolve without touching the user profile", async (t) => {
  assert.deepEqual(parseBlenderVersion("Blender 5.2.1 LTS\n"), version);
  assert.deepEqual(parseBlenderVersion("Blender 4.5"), {
    major: 4,
    minor: 5,
    patch: 0,
    label: "4.5",
  });
  assert.equal(parseBlenderVersion("not blender"), null);

  const base = await mkdtemp(join(tmpdir(), "blender-paths-test-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const config = join(base, "custom", "config");
  const scripts = join(base, "custom", "scripts");
  const paths = resolveBlenderPaths({
    platform: "win32",
    env: { BLENDER_USER_CONFIG: config, BLENDER_USER_SCRIPTS: scripts },
    version,
  });
  assert.equal(paths.addonsDir, join(scripts, "addons"));
  assert.equal(paths.userpref, join(config, "userpref.blend"));
  assert.equal(paths.custom, true);
  assert.equal(paths.requiresInitialization, false);
  assert.equal(
    addonModuleName(join(base, "extensions", "user_default", "demo", "__init__.py")),
    "bl_ext.user_default.demo",
  );
  assert.equal(addonModuleName(join(scripts, "addons", "demo.py")), "demo");
});

test("preference writes stop when a new Blender version still has a settings migration pending", async (t) => {
  const base = await mkdtemp(join(tmpdir(), "blender-prefs-test-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const env = { APPDATA: join(base, "appdata") };
  const versionDir = join(env.APPDATA, "Blender Foundation", "Blender", "5.2");
  await mkdir(join(versionDir, "scripts", "addons"), { recursive: true });
  await mkdir(join(env.APPDATA, "Blender Foundation", "Blender", "5.1"), { recursive: true });
  const paths = resolveBlenderPaths({ platform: "win32", env, version });
  assert.equal(await safeToSavePreferences({ paths, env }), false);
  await mkdir(paths.configDir, { recursive: true });
  await writeFile(join(paths.configDir, "userpref.blend"), "prefs");
  assert.equal(await safeToSavePreferences({ paths, env }), true);
});

test("dry-run plans the pinned add-on without writing it", async (t) => {
  const fixture = await staged(t);
  const report = await installAddon({
    root: fixture.root,
    env: fixture.env,
    blender: fixture.blender,
    isRunning: async () => false,
    enable: async () => assert.fail("dry-run must not start Blender"),
    dryRun: true,
  });
  assert.equal(report.ok, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.target.action, "install");
  assert.equal(report.target.module, "mcp_for_blender_addon");
  assert.equal(report.blender.version, "5.2.1");
  await assert.rejects(access(report.target.addonPath));
});

test("confirmed install copies pinned bytes, backs up an older copy and is idempotent", async (t) => {
  const fixture = await staged(t);
  const cases = [];
  const enable = async (input) => {
    cases.push(input);
    return {
      enabled: true,
      alreadyEnabled: false,
      savedPreferences: input.savePreferences,
      error: null,
    };
  };
  const run = () =>
    installAddon({
      root: fixture.root,
      env: fixture.env,
      blender: fixture.blender,
      isRunning: async () => false,
      enable,
      dryRun: false,
    });

  const first = await run();
  assert.equal(first.ok, true);
  assert.equal(first.enabled, true);
  assert.equal(first.target.action, "install");
  assert.equal(cases.length, 1);
  assert.equal(cases[0].module, "mcp_for_blender_addon");
  assert.equal(cases[0].savePreferences, true);
  const copied = await readFile(first.target.addonPath);
  assert.equal(
    createHash("sha256").update(copied).digest("hex"),
    await copyAddonHash(fixture.root),
  );

  await writeFile(first.target.addonPath, "older addon");
  const updated = await run();
  assert.equal(updated.target.action, "update");
  assert.equal(updated.target.backupPath, `${first.target.addonPath}.bak`);
  assert.equal(await readFile(updated.target.backupPath, "utf8"), "older addon");
  assert.deepEqual(await readFile(updated.target.addonPath), copied);

  // 同目录下多个历史副本一起更新，避免 Blender 加载到旧模块。
  const duplicate = join(fixture.scripts, "addons", "duplicate_mcp.py");
  const olderCopy = `${copied.toString("utf8")}\n# older copy\n`;
  await writeFile(duplicate, olderCopy);
  const multi = await run();
  assert.equal(multi.target.action, "update");
  assert.deepEqual(await readFile(duplicate), copied);
  assert.equal(await readFile(`${duplicate}.bak`, "utf8"), olderCopy);
  assert.ok(multi.target.updatedPaths.includes(duplicate));

  const repeat = await run();
  assert.equal(repeat.target.action, "none");
  assert.equal(repeat.target.backupPath, null);
});

test("install fails closed while Blender runs or the target is remote", async (t) => {
  const fixture = await staged(t);
  const running = await installAddon({
    root: fixture.root,
    env: fixture.env,
    blender: fixture.blender,
    isRunning: async () => true,
    enable: async () => assert.fail("must not start Blender"),
    dryRun: true,
  });
  assert.equal(running.ok, false);
  assert.equal(running.blockers[0].id, "blender-running");
  await assert.rejects(access(running.target.addonPath));

  const remote = await installAddon({
    root: fixture.root,
    env: { ...fixture.env, BLENDER_HOST: "10.0.0.8" },
    blender: fixture.blender,
    isRunning: async () => false,
    enable: async () => assert.fail("must not start Blender"),
    dryRun: false,
  });
  assert.equal(remote.blockers[0].id, "remote-host");
});

test("install refuses a pending settings migration and existing extensions copies", async (t) => {
  const fixture = await staged(t);
  const migrationEnv = { ...fixture.env, APPDATA: join(fixture.base, "appdata") };
  delete migrationEnv.BLENDER_USER_CONFIG;
  delete migrationEnv.BLENDER_USER_SCRIPTS;
  const target = join(migrationEnv.APPDATA, "Blender Foundation", "Blender", "5.2");
  await mkdir(join(target, "scripts", "addons"), { recursive: true });
  await mkdir(join(migrationEnv.APPDATA, "Blender Foundation", "Blender", "5.1"), {
    recursive: true,
  });
  const migration = await installAddon({
    root: fixture.root,
    env: migrationEnv,
    platform: "win32",
    blender: fixture.blender,
    isRunning: async () => false,
    dryRun: true,
  });
  assert.equal(migration.blockers[0].id, "blender-first-launch");

  const extension = join(fixture.base, "custom", "extensions", "user_default", "demo");
  await mkdir(extension, { recursive: true });
  await cp(
    join(fixture.root, "vendor/mcp-for-blender/addon.py"),
    join(extension, "__init__.py"),
  );
  const existing = await installAddon({
    root: fixture.root,
    env: fixture.env,
    blender: fixture.blender,
    isRunning: async () => false,
    dryRun: true,
  });
  assert.equal(existing.blockers[0].id, "extension-install");
});

test(
  "real Blender installs and persists the pinned add-on in an isolated profile",
  { skip: !process.env.BLENDER_EXECUTABLE, timeout: 180000 },
  async (t) => {
    const base = await mkdtemp(join(tmpdir(), "blender-install-real-"));
    t.after(() => rm(base, { recursive: true, force: true }));
    const root = join(base, "plugin");
    await mkdir(root);
    await cp(join(pluginRoot, "vendor"), join(root, "vendor"), { recursive: true });
    await cp(join(pluginRoot, "upstream-lock.json"), join(root, "upstream-lock.json"));
    const config = join(base, "config");
    const scripts = join(base, "scripts");
    await mkdir(config, { recursive: true });
    await mkdir(scripts, { recursive: true });
    const discovered = await discoverBlender({
      explicit: process.env.BLENDER_EXECUTABLE,
      platform: process.platform,
      env: process.env,
    });
    assert.ok(discovered.executable, "BLENDER_EXECUTABLE must point to a usable Blender");
    const env = {
      ...process.env,
      BLENDER_USER_CONFIG: config,
      BLENDER_USER_SCRIPTS: scripts,
      BLENDER_HOST: "127.0.0.1",
      BLENDER_PORT: "9876",
      BLENDERMCP_NO_UPDATE_CHECK: "1",
    };
    const report = await installAddon({
      root,
      env,
      blender: discovered,
      // 测试不依赖用户是否正开着 Blender，也不触碰其真实配置。
      isRunning: async () => false,
      dryRun: false,
    });
    assert.equal(report.ok, true, JSON.stringify(report.blockers));
    assert.equal(report.enabled, true);
    assert.equal(report.savedPreferences, true);
    const { stdout } = await execute(
      discovered.executable,
      [
        "--background",
        "--python-expr",
        "import bpy; print('PERSISTED_ADDONS', sorted(a.module for a in bpy.context.preferences.addons))",
      ],
      { env, encoding: "utf8", timeout: 120000, windowsHide: true },
    );
    assert.match(stdout, /PERSISTED_ADDONS .*mcp_for_blender_addon/);
  },
);

test("enable failure is reported without claiming success", async (t) => {
  const fixture = await staged(t);
  const report = await installAddon({
    root: fixture.root,
    env: fixture.env,
    blender: fixture.blender,
    isRunning: async () => false,
    enable: async () => ({
      enabled: false,
      alreadyEnabled: false,
      savedPreferences: false,
      error: "fixture enable failed",
    }),
    dryRun: false,
  });
  assert.equal(report.ok, false);
  assert.equal(report.enabled, false);
  assert.equal(report.blockers[0].id, "enable-failed");
  assert.match(report.blockers[0].message, /fixture enable failed/);
  assert.equal(
    (await readFile(report.target.addonPath)).length,
    (await readFile(join(fixture.root, "vendor/mcp-for-blender/addon.py"))).length,
  );
});
