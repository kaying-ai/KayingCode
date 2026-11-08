import assert from "node:assert/strict";
import test from "node:test";
import { reportData } from "../runtime/report-data.mjs";
import { applyReview, updateGoal, sessionMetrics } from "../runtime/session-updates.mjs";

const now = Date.parse("2026-01-01T00:00:10Z");
function session() {
  return {
    id: "session-test",
    title: "Game",
    status: "stopped",
    createdAt: new Date(now - 10000).toISOString(),
    endedAt: new Date(now).toISOString(),
    source: { kind: "android", packageName: "test.game" },
    device: { environment: { renderer: "GLES: Apple Metal", abi: "arm64-v8a" } },
    artifacts: [
      {
        id: "shot",
        kind: "screenshot",
        path: "screenshots/test.png",
        label: "棋盘",
        offsetSeconds: 1,
      },
    ],
    events: [
      { kind: "mechanic", summary: "交换后木箱减少", certainty: "observed", evidenceIds: ["shot"] },
    ],
    actions: [
      { status: "succeeded", timings: { actionMs: 300, observationMs: 500, totalMs: 800 } },
    ],
    goals: [
      {
        id: "level",
        title: "通关",
        acceptance: "出现胜利画面",
        status: "not-tested",
        reason: "尚未验证",
        evidenceIds: [],
      },
    ],
    limitations: [],
    focus: ["gameplay"],
  };
}
test("facts and progress remain visible without scores; diagnostic has no game total", () => {
  const s = session();
  updateGoal(
    s,
    { goalId: "level", status: "partial", reason: "木箱减少但未通关", evidenceIds: ["shot"] },
    now,
  );
  const r = reportData(s, now);
  assert.equal(r.scoring.total, null);
  assert.equal(r.coverage.goals.partial, 1);
  assert.equal(r.sections.find((x) => x.key === "information").status, "verified");
  assert.equal(r.sections.find((x) => x.key === "evidence").status, "verified");
  assert.match(r.sections.find((x) => x.key === "mechanics").text, /木箱减少/);
  assert.ok(r.qualityWarnings.some((x) => x.includes("gameplay")));
  s.reportKind = "diagnostic";
  s.review = {
    scores: [{ dimension: "gameplay", score: 8, confidence: 0.5, evidenceIds: ["shot"] }],
  };
  assert.equal(reportData(s, now).scoring.total, null);
});
test("goals require reasons and evidence and do not infer completion from action receipt", () => {
  const s = session();
  assert.throws(
    () =>
      updateGoal(s, { goalId: "level", status: "verified", reason: "done", evidenceIds: [] }, now),
    /Evidence/,
  );
  assert.throws(
    () =>
      updateGoal(
        s,
        { goalId: "missing", status: "blocked", reason: "blocked", evidenceIds: [] },
        now,
      ),
    /goal/i,
  );
  updateGoal(
    s,
    { goalId: "level", status: "blocked", reason: "需要人工处理", evidenceIds: [] },
    now,
  );
  assert.equal(s.goals[0].status, "blocked");
  assert.equal(s.goals[0].history.length, 1);
});
test("review patches preserve earlier sections and keep replace history", () => {
  const s = session();
  const section = (key) => ({ key, text: key, certainty: "observed", evidenceIds: ["shot"] });
  applyReview(s, { sections: [section("summary")] }, "merge", now);
  applyReview(s, { sections: [section("mechanics")] }, "merge", now + 1);
  assert.equal(s.review.sections.length, 2);
  applyReview(s, { sections: [section("coverage")] }, "replace", now + 2);
  assert.equal(s.review.sections.length, 1);
  assert.equal(s.reviewRevisions.length, 3);
  assert.equal(s.reviewRevisions[2].previous.sections.length, 2);
});
test("timings separate measured operations, pauses and unattributed time", () => {
  const s = session();
  s.pausedMs = 2000;
  s.toolTimings = [{ name: "device_act", durationMs: 900 }];
  const m = sessionMetrics(s, now);
  assert.equal(m.actions.totalMs.mean, 800);
  assert.equal(m.wallElapsedMs, 10000);
  assert.equal(m.activeElapsedMs, 8000);
  assert.equal(m.unattributedActiveMs, 7100);
  assert.match(m.caveat, /模型/);
  const legacy = { ...s, goals: undefined, review: undefined };
  assert.equal(reportData(legacy, now).coverage.goals.total, 0);
});
