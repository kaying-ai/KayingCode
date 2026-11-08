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

test("builtin catalog contains every adapter and the entire pinned upstream runtime", async () => {
  const config = JSON.parse(
    await readFile(join(pluginRoot, "../../config/official-plugins.json"), "utf8"),
  );
  const entry = config.plugins.find((item) => item.name === "blender");
  assert.ok(entry);
  assert.notEqual(entry.defaultEnabled, true);
  for (const file of [
    "scripts/launch.mjs",
    "scripts/diagnostics.mjs",
    "scripts/prepare-runtime.mjs",
    "scripts/addon-files.mjs",
    "skills/blender/SKILL.md",
    "commands/blender-doctor.md",
  ]) {
    assert.ok(entry.requiredSeedPaths.includes(file), file);
  }
  for (const path of ["vendor", "upstream-lock.json", "THIRD_PARTY_NOTICES.md"])
    assert.ok(entry.runtimeTopLevelPaths.includes(path));
});
