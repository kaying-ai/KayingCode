import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pluginRoot, runtimePlan } from "../scripts/runtime.mjs";
import { prepareRuntime } from "../scripts/prepare-runtime.mjs";
import { verifyUpstream } from "../scripts/verify-upstream.mjs";
import { startMcp } from "./mcp-client.mjs";

test("doctor MCP stays available with no uv or Python and validates arguments", async (t) => {
  const client = startMcp(join(pluginRoot, "scripts/doctor-server.mjs"), {
    KAYINGCODE_BLENDER_UV: "/missing-uv",
    KAYINGCODE_BLENDER_CACHE: "/missing-cache",
    BLENDER_PORT: "invalid",
  });
  t.after(() => client.close());
  assert.equal((await client.initialize()).serverInfo.name, "kayingcode-blender-doctor");
  const list = await client.request("tools/list");
  assert.deepEqual(
    list.tools.map((item) => item.name),
    ["blender_doctor"],
  );
  assert.equal(list.tools[0].annotations.readOnlyHint, true);
  const result = await client.request("tools/call", { name: "blender_doctor", arguments: {} });
  const report = JSON.parse(result.content[0].text);
  assert.equal(report.ready, false);
  assert.ok(report.checks.some((item) => item.id === "uv" && item.status === "error"));
  await assert.rejects(
    client.request("tools/call", { name: "blender_doctor", arguments: { repair: true } }),
    /no arguments/,
  );
  await assert.rejects(client.request("tools/call", { name: "unknown" }), /Unknown tool/);
  assert.deepEqual(await client.request("ping"), {});
});

test("snapshot corruption fails closed; cached build writes do not contaminate vendor", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "blender-snapshot-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(join(pluginRoot, "vendor"), join(root, "vendor"), { recursive: true });
  await cp(join(pluginRoot, "upstream-lock.json"), join(root, "upstream-lock.json"));
  const lock = await verifyUpstream(root);
  const plan = runtimePlan(root, lock, { KAYINGCODE_BLENDER_CACHE: join(root, "cache") });
  await Promise.all([prepareRuntime(plan, lock), prepareRuntime(plan, lock)]);
  await writeFile(join(plan.project, "build-artifact.txt"), "generated");
  assert.equal((await verifyUpstream(root)).commit, lock.commit);
  await writeFile(join(plan.project, "addon.py"), "modified");
  await assert.rejects(prepareRuntime(plan, lock), /缓存源码发生变化/);
  await writeFile(join(root, "vendor/mcp-for-blender/addon.py"), "modified");
  await assert.rejects(verifyUpstream(root), /differs/);
});

test("snapshot mismatch names the file and explains Windows CRLF drift", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "blender-snapshot-mismatch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(join(pluginRoot, "vendor"), join(root, "vendor"), { recursive: true });
  await cp(join(pluginRoot, "upstream-lock.json"), join(root, "upstream-lock.json"));
  const file = join(root, "vendor/mcp-for-blender/src/blender_mcp/__init__.py");
  const source = await readFile(file, "utf8");
  // 模拟 Windows 切分支后未重写的老文件：索引仍是 LF，工作区是 CRLF。
  await writeFile(file, source.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"));
  await assert.rejects(verifyUpstream(root), (error) => {
    assert.match(error.message, /src\/blender_mcp\/__init__\.py/);
    assert.match(error.message, /CRLF/);
    assert.match(error.message, /re-checkout/);
    return true;
  });
  await rm(file);
  await writeFile(join(root, "vendor/mcp-for-blender/extra.py"), "extra");
  // 数量相同的一缺一多不能被当成“没有变化”。
  await assert.rejects(verifyUpstream(root), (error) => {
    assert.match(error.message, /missing=1/);
    assert.match(error.message, /unexpected=1/);
    assert.match(error.message, /re-run sync-upstream/);
    return true;
  });
});

test("builtin catalog contains every adapter and the entire pinned upstream runtime", async () => {
  const config = JSON.parse(
    await readFile(new URL("../../../../../config/official-plugins.json", import.meta.url), "utf8"),
  );
  const entry = config.plugins.find((item) => item.name === "blender");
  assert.ok(entry);
  assert.notEqual(entry.defaultEnabled, true);
  for (const file of [
    "scripts/launch.mjs",
    "scripts/diagnostics.mjs",
    "scripts/prepare-runtime.mjs",
    "scripts/addon-files.mjs",
    "scripts/asset-check.py",
    "skills/blender/SKILL.md",
    "skills/blender/references/from-reference.md",
    "commands/blender-doctor.md",
    "commands/blender-from-reference.md",
  ]) {
    assert.ok(entry.requiredSeedPaths.includes(file), file);
  }
  for (const path of ["vendor", "upstream-lock.json", "THIRD_PARTY_NOTICES.md"])
    assert.ok(entry.runtimeTopLevelPaths.includes(path));
  const lock = await verifyUpstream();
  const skill = await readFile(join(pluginRoot, "skills/blender/SKILL.md"), "utf8");
  for (const topic of [
    "scene",
    "materials",
    "retopology",
    "rigging",
    "animation",
    "level-design",
    "bpy",
  ]) {
    assert.ok(lock.files[`src/blender_mcp/guides/${topic}.md`]);
    assert.ok(skill.includes(`\`${topic}.md\``));
  }
});

test("reference command and skill use internal draft review by default", async () => {
  const [command, skill, guide] = await Promise.all(
    [
      "commands/blender-from-reference.md",
      "skills/blender/SKILL.md",
      "skills/blender/references/from-reference.md",
    ].map((path) => readFile(join(pluginRoot, path), "utf8")),
  );

  assert.match(command, /^skills: blender$/m);
  assert.match(command, /同一轮继续细化和交付/);
  assert.match(skill, /用户明确要求分阶段验收/);
  assert.match(guide, /未启用或未获授权时，直接用可行的本地方案/);
  assert.match(guide, /对照参考、局部修正并复看/);
  assert.match(guide, /用户明确要求分阶段验收/);
});
