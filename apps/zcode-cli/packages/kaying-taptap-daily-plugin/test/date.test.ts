import assert from "node:assert/strict";
import test from "node:test";

import { calendarDayTimestamp, addDays, dateRange, isDateString } from "../src/lib/date.js";

test("calendarDayTimestamp matches TapTap SSR day encoding", () => {
  assert.equal(calendarDayTimestamp("2026-11-16"), 1_794_787_200);
});

test("date arithmetic and range", () => {
  assert.equal(addDays("2026-11-16", -6), "2026-11-10");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.deepEqual(dateRange("2026-11-16", 3), ["2026-11-14", "2026-11-15", "2026-11-16"]);
  assert.equal(isDateString("2026-02-30"), false);
  assert.equal(isDateString("2026-11-16"), true);
});
