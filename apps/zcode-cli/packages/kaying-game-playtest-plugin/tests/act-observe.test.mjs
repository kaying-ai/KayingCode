import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PlaytestRuntime } from "../runtime/playtest.mjs";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9X8AAAAASUVORK5CYII=",
  "base64",
);
async function setup(t) {
  const workspacePath = await mkdtemp(join(tmpdir(), "playtest-combined-"));
  t.after(() => rm(workspacePath, { recursive: true, force: true }));
  const path = join(workspacePath, "game.apk");
  await writeFile(path, Buffer.from([80, 75, 3, 4]));
  let taps = 0,
    screenshots = 0,
    changed = false,
    fail = false;
  const runtime = new PlaytestRuntime({
    run: async (_cmd, args) => {
      if (args[0] === "devices")
        return Buffer.from("List of devices attached\nemulator-5554 device\n");
      if (args.includes("resolve-activity")) return Buffer.from("com.example.game/.Main");
      if (args.includes("dumpsys")) return Buffer.from("mResumedActivity: com.example.game/.Main");
      if (args.includes("tap")) {
        taps++;
        return Buffer.from("");
      }
      if (args.includes("screencap")) {
        screenshots++;
        if (fail) throw Error("screenshot disconnected");
        return changed ? Buffer.concat([png, Buffer.from([0])]) : png;
      }
      return Buffer.from("OK");
    },
  });
  const session = await runtime.call("playtest_start", {
    workspacePath,
    source: { kind: "android", path, packageName: "com.example.game" },
  });
  const base = { workspacePath, sessionId: session.id };
  const before = await runtime.call("device_observe", base);
  return {
    runtime,
    base,
    session,
    before,
    counts: () => ({ taps, screenshots }),
    change: () => {
      changed = true;
    },
    fail: () => {
      fail = true;
    },
  };
}
test("one input returns a fresh observation, timings and rejects reuse", async (t) => {
  const f = await setup(t);
  f.change();
  const args = {
    ...f.base,
    observationId: f.before.observation.id,
    action: { type: "tap", x: 0, y: 0 },
    observe: true,
  };
  const result = await f.runtime.call("device_act", args);
  assert.equal(result.action.status, "succeeded");
  assert.equal(result.frameChanged, true);
  assert.notEqual(result.observation.id, f.before.observation.id);
  assert.ok(result.imagePath);
  assert.ok(result.timings.totalMs >= result.timings.actionMs);
  await assert.rejects(f.runtime.call("device_act", args), /observation/i);
  assert.equal(f.counts().taps, 1);
});
test("unchanged frames are bounded and retain an actual fresh screenshot", async (t) => {
  const f = await setup(t);
  const result = await f.runtime.call("device_act", {
    ...f.base,
    observationId: f.before.observation.id,
    action: { type: "tap", x: 0, y: 0 },
    observe: true,
    waitForChangeMs: 5000,
  });
  assert.equal(result.frameChanged, false);
  assert.equal(result.observationAttempts, 16);
  assert.equal(f.counts().screenshots, 17);
  assert.equal(f.counts().taps, 1);
});
test("observation failure cannot rewrite or replay a succeeded input", async (t) => {
  const f = await setup(t);
  f.fail();
  const args = {
    ...f.base,
    observationId: f.before.observation.id,
    action: { type: "tap", x: 0, y: 0 },
    observe: true,
  };
  const result = await f.runtime.call("device_act", args);
  assert.equal(result.action.status, "succeeded");
  assert.match(result.observationError, /disconnected/);
  const state = JSON.parse(await readFile(join(f.session.directory, "session.json"), "utf8"));
  assert.equal(state.actions[0].status, "succeeded");
  assert.equal(state.observation, null);
  await assert.rejects(f.runtime.call("device_act", args), /observation/i);
  assert.equal(f.counts().taps, 1);
});
