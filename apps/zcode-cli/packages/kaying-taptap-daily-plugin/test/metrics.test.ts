import assert from "node:assert/strict";
import test from "node:test";

import { computeMetrics } from "../src/metrics/computeMetrics.js";
import type { BoardId, CalendarEvent } from "../src/types.js";
import { makeBoard, makeEvent, makeSnapshot } from "./helpers.js";

const GENERATED_AT = "2026-11-16T01:30:00.000Z";

function events(): CalendarEvent[] {
  const list: CalendarEvent[] = [
    makeEvent(3001, "二次元新游A", ["二次元"], "release", "2026-11-16"),
    makeEvent(3002, "二次元新游B", ["二次元"], "release", "2026-11-15"),
    makeEvent(3003, "二次元新游C", ["二次元"], "release", "2026-11-10"),
    makeEvent(3101, "模拟经营新游A", ["模拟经营"], "release", "2026-11-14"),
    makeEvent(3102, "模拟经营新游B", ["模拟经营"], "release", "2026-11-12"),
    makeEvent(3201, "射击新游", ["射击"], "release", "2026-11-13"),
    makeEvent(3301, "二次元预约", ["二次元"], "reservation", "2026-11-16"),
    makeEvent(3401, "二次元测试", ["二次元"], "test", "2026-11-16"),
  ];
  for (let index = 0; index < 5; index += 1) {
    list.push(
      makeEvent(3500 + index, `30日二次元${index}`, ["二次元"], "release", `2026-10-${20 + index}`),
    );
  }
  for (let index = 0; index < 3; index += 1) {
    list.push(
      makeEvent(3600 + index, `30日经营${index}`, ["模拟经营"], "release", `2026-10-${24 + index}`),
    );
  }
  list.push(makeEvent(3901, "窗口外", ["二次元"], "release", "2026-09-01"));
  return list;
}

test("computes board deltas, new-game windows and genre supply", () => {
  const snapshot = makeSnapshot({ events: events() });
  const previousBase = makeSnapshot({ reportDate: "2026-11-15" });
  const reversed = previousBase.boards.download.items.map((item, index) => ({
    ...item,
    rank: previousBase.boards.download.items.length - index,
  }));
  const previousBoards: Partial<Record<BoardId, ReturnType<typeof makeBoard>>> = {
    download: makeBoard("download", reversed),
  };
  const previous = makeSnapshot({ reportDate: "2026-11-15", boards: previousBoards });
  const metrics = computeMetrics(snapshot, previous, GENERATED_AT);

  assert.equal(metrics.schemaVersion, 1);
  assert.equal(metrics.reportDate, "2026-11-16");
  assert.equal(metrics.snapshotHash, snapshot.contentHash);
  assert.equal(metrics.previousReportDate, "2026-11-15");
  assert.equal(metrics.counts.release7d, 6);
  assert.equal(metrics.counts.release30d, 14);
  assert.equal(metrics.counts.reservation7d, 1);
  assert.equal(metrics.counts.test7d, 1);
  assert.equal(metrics.newGames.uniqueGames7d, 8);
  assert.equal(metrics.boardUnion.length, 105);
  assert.equal(metrics.boards.download.items[0]!.rankChange, 34);
  assert.equal(metrics.dataQuality, "ok");

  const acgn = metrics.genres.find((genre) => genre.id === "acgn")!;
  const management = metrics.genres.find((genre) => genre.id === "management")!;
  const shooter = metrics.genres.find((genre) => genre.id === "shooter")!;
  assert.equal(acgn.newGames7d, 3);
  assert.equal(acgn.newGames30d, 8);
  assert.equal(acgn.newReservations7d, 1);
  assert.equal(management.newGames7d, 2);
  assert.equal(management.newGames30d, 5);
  assert.equal(shooter.newGames7d, 1);
  assert.ok(acgn.boardShare > 0);
  assert.equal(typeof acgn.crowding.score, "number");
  assert.equal(
    acgn.crowding.level,
    acgn.crowding.score! >= 70 ? "high" : acgn.crowding.score! >= 40 ? "medium" : "low",
  );
});

test("missing previous snapshot only disables rank changes", () => {
  const snapshot = makeSnapshot({ events: events() });
  const metrics = computeMetrics(snapshot, null, GENERATED_AT);
  assert.equal(metrics.previousReportDate, null);
  assert.equal(metrics.boards.download.items[0]!.rankChange, null);
  assert.ok(metrics.warnings.some((warning) => warning.code === "previous_snapshot_missing"));
  assert.equal(metrics.dataQuality, "ok");
});

test("short calendar window degrades quality and warns", () => {
  const snapshot = makeSnapshot({ events: events(), windowDays: 7 });
  const metrics = computeMetrics(snapshot, null, GENERATED_AT);
  assert.ok(metrics.warnings.some((warning) => warning.code === "calendar_window_short"));
  assert.equal(metrics.dataQuality, "degraded");
});

test("degraded board degrades quality", () => {
  const snapshot = makeSnapshot({ events: [], degradedBoards: ["pop"] });
  const metrics = computeMetrics(snapshot, null, GENERATED_AT);
  assert.equal(metrics.dataQuality, "degraded");
  assert.ok(metrics.warnings.some((warning) => warning.code === "board_degraded"));
});
