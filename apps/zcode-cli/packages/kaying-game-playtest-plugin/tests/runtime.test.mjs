import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PlaytestRuntime } from "../runtime/playtest.mjs";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9X8AAAAASUVORK5CYII=",
  "base64",
);

async function fixture(t) {
  const workspacePath = await mkdtemp(join(tmpdir(), "game-playtest-"));
  t.after(() => rm(workspacePath, { recursive: true, force: true }));
  const apk = join(workspacePath, "demo.apk");
  await writeFile(apk, Buffer.from([0x50, 0x4b, 3, 4, 0, 0]));
  let now = Date.now();
  const calls = [];
  let fail = "";
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (fail && args.includes(fail)) throw new Error(`device error: ${fail}`);
    if (args[0] === "devices")
      return Buffer.from(
        "List of devices attached\nemulator-5554\tdevice product:test model:Demo\n",
      );
    if (args.includes("screencap")) return png;
    if (args.includes("pidof")) return Buffer.from("123");
    if (args.includes("resolve-activity")) return Buffer.from("com.example.game/.Main");
    if (args.includes("getprop")) return Buffer.from("Demo Android arm64-v8a");
    if (args.includes("dumpsys"))
      return Buffer.from("mResumedActivity: ActivityRecord{ com.example.game/.Main }");
    return Buffer.from("OK");
  };
  const runtime = new PlaytestRuntime({ run, now: () => now });
  const base = { workspacePath, workspaceIdentity: "remote:test:identity" };
  const source = { kind: "android", path: apk, packageName: "com.example.game" };
  const call = (name, args = {}) => runtime.call(name, { ...base, ...args });
  return {
    workspacePath,
    source,
    runtime,
    call,
    calls,
    base,
    run,
    setFail: (v) => {
      fail = v;
    },
    advance: (ms) => {
      now += ms;
    },
  };
}

test("Android complete journey: import, real command receipts, evidence and offline reports", async (t) => {
  const f = await fixture(t);
  const prepared = await f.call("playtest_prepare", { source: f.source });
  assert.equal(prepared.apk.sha256.length, 64);
  const session = await f.call("playtest_start", {
    source: f.source,
    title: "Demo <game>",
    depth: "quick",
  });
  const args = { sessionId: session.id };
  const before = await f.call("device_observe", args);
  await f.call("device_act", {
    ...args,
    observationId: before.observation.id,
    action: { type: "tap", x: 0, y: 0 },
  });
  const after = await f.call("device_observe", args);
  await f.call("playtest_record", {
    ...args,
    kind: "first-success",
    summary: "进入第一关",
    evidenceIds: [after.artifact.id],
    certainty: "observed",
  });
  await f.call("playtest_stop", args);
  f.advance(86400000);
  const report = await f.call("report_generate", {
    ...args,
    review: {
      sections: [
        {
          key: "summary",
          text: "<script>alert(1)</script>",
          certainty: "observed",
          evidenceIds: [after.artifact.id],
        },
      ],
      scores: [
        {
          dimension: "gameplay",
          score: 8,
          confidence: 0.8,
          evidenceIds: [after.artifact.id],
          reason: "反馈明确",
        },
      ],
      issues: [
        {
          title: "遮挡",
          severity: "P2",
          steps: ["开始游戏"],
          expected: "可读",
          actual: "遮挡",
          recommendation: "调整布局",
          evidenceIds: [after.artifact.id],
        },
      ],
    },
  });
  const json = JSON.parse(await readFile(report.json, "utf8"));
  assert.equal(json.sections.length, 12);
  assert.equal(json.coverage.wallElapsedSeconds, 0);
  assert.equal(json.scoring.coverage, 1 / 8);
  assert.equal(json.scoring.total, 80);
  const html = await readFile(report.html, "utf8");
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("screenshots/"));
  assert.ok(f.calls.some((c) => c.includes("install")));
  assert.ok(f.calls.some((c) => c.includes("tap")));
  const state = JSON.parse(await readFile(join(report.directory, "session.json"), "utf8"));
  assert.equal(state.actions[0].status, "succeeded");
  assert.equal(
    (await readFile(join(report.directory, "actions.jsonl"), "utf8")).trim().split("\n").length,
    1,
  );
});

test("stale observations, identity, bounds and budgets reject before device input", async (t) => {
  const f = await fixture(t);
  const s = await f.call("playtest_start", { source: f.source, budgetMinutes: 1 });
  const args = { sessionId: s.id, action: { type: "tap", x: 0, y: 0 } };
  await assert.rejects(f.call("device_act", { ...args, observationId: "missing" }), /observation/i);
  const before = await f.call("device_observe", { sessionId: s.id });
  await assert.rejects(
    f.call("device_act", {
      ...args,
      observationId: before.observation.id,
      action: { type: "tap", x: 9, y: 0 },
    }),
    /bounds/i,
  );
  await assert.rejects(
    f.runtime.call("playtest_status", { ...f.base, workspaceIdentity: "other", sessionId: s.id }),
    /identity/i,
  );
  await f.call("device_act", { ...args, observationId: before.observation.id });
  await assert.rejects(
    f.call("device_act", { ...args, observationId: before.observation.id }),
    /observation/i,
  );
  const next = await f.call("device_observe", { sessionId: s.id });
  f.advance(60001);
  await assert.rejects(
    f.call("device_act", { ...args, observationId: next.observation.id }),
    /budget/i,
  );
  assert.equal(f.calls.filter((c) => c.includes("tap")).length, 1);
});

test("failed install and input remain failures; action is never retried", async (t) => {
  const f = await fixture(t);
  f.setFail("install");
  await assert.rejects(f.call("playtest_start", { source: f.source }), /device error/);
  f.setFail("");
  const s = await f.call("playtest_start", { source: f.source });
  const shot = await f.call("device_observe", { sessionId: s.id });
  f.setFail("tap");
  const args = {
    sessionId: s.id,
    observationId: shot.observation.id,
    action: { type: "tap", x: 0, y: 0 },
  };
  await assert.rejects(f.call("device_act", args), /device error/);
  await assert.rejects(f.call("device_act", args), /observation/i);
  const status = await f.call("playtest_status", { sessionId: s.id });
  assert.equal(status.actions.failed, 1);
});

test("pause/resume, device exclusion and concurrent duplicate input", async (t) => {
  const f = await fixture(t);
  const s = await f.call("playtest_start", { source: f.source });
  await assert.rejects(f.call("playtest_start", { source: f.source }), /device.*busy/i);
  const shot = await f.call("device_observe", { sessionId: s.id });
  const args = {
    sessionId: s.id,
    observationId: shot.observation.id,
    action: { type: "tap", x: 0, y: 0 },
  };
  const result = await Promise.allSettled([f.call("device_act", args), f.call("device_act", args)]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  await f.call("playtest_stop", { sessionId: s.id, pause: true });
  const other = new PlaytestRuntime({ run: f.run });
  await other.call("playtest_resume", { ...f.base, sessionId: s.id });
  await assert.rejects(other.call("device_act", { ...f.base, ...args }), /observation/i);
});

test("Web evidence import, missing evidence, symlink escape and null scores", async (t) => {
  const f = await fixture(t);
  const s = await f.call("playtest_start", {
    source: { kind: "web", url: "https://example.com/game" },
  });
  const args = { sessionId: s.id };
  await assert.rejects(f.call("device_observe", args), /Browser Use/);
  const path = join(f.workspacePath, "web.png");
  await writeFile(path, png);
  const shot = await f.call("playtest_attach", {
    ...args,
    path,
    kind: "screenshot",
    label: "Browser Use capture",
  });
  await f.call("playtest_external_action", {
    ...args,
    observationId: shot.observation.id,
    description: "Browser Use click",
    outcome: "sent",
  });
  await assert.rejects(
    f.call("playtest_record", {
      ...args,
      kind: "finding",
      summary: "fake",
      certainty: "observed",
      evidenceIds: ["fake"],
    }),
    /evidence/i,
  );
  await assert.rejects(
    f.call("report_generate", {
      ...args,
      review: {
        scores: [
          { dimension: "gameplay", score: 9, confidence: 1, reason: "fake", evidenceIds: [] },
        ],
      },
    }),
    /evidence/i,
  );
  const escaped = join(f.workspacePath, "escape");
  await symlink(tmpdir(), escaped);
  await assert.rejects(
    f.call("playtest_attach", { ...args, path: join(escaped, "not-real.png"), kind: "screenshot" }),
  );
  const report = await f.call("report_generate", args);
  const json = JSON.parse(await readFile(report.json, "utf8"));
  assert.equal(json.scoring.total, null);
  assert.equal(json.scoring.coverage, 0);
  await assert.rejects(
    f.call("capture_highlight", {
      ...args,
      artifactId: shot.artifact.id,
      startSeconds: 0,
      durationSeconds: 10,
    }),
    /recording/i,
  );
});
