import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { normalizeApp, type RawHitsData } from "../src/collector/normalize.js";
import type { CalendarEvent } from "../src/types.js";

const fixtureDir = join(import.meta.dirname, "..", "fixtures", "raw");

test("parses a real TapTap board response fixture", async () => {
  const envelope = JSON.parse(await readFile(join(fixtureDir, "board-page1.json"), "utf8")) as {
    data: RawHitsData;
  };
  const data = envelope.data;
  assert.ok(Array.isArray(data.list));
  assert.equal(data.list.length, 2);
  for (const item of data.list) {
    const app = normalizeApp(item.app);
    assert.ok(app);
    assert.ok(app.appId > 0);
    assert.ok(app.title.length > 0);
    assert.equal(app.sourceUrl, `https://www.taptap.cn/app/${app.appId}`);
    assert.ok(app.platforms.length > 0);
  }
});

test("keeps the real calendar fixture internally consistent", async () => {
  const data = JSON.parse(await readFile(join(fixtureDir, "calendar-day.json"), "utf8")) as {
    date: string;
    events: CalendarEvent[];
  };
  assert.equal(data.date, "2026-11-16");
  assert.ok(data.events.length > 0);
  for (const event of data.events) {
    assert.ok(event.appId > 0);
    assert.ok(event.evidenceId.startsWith("event:"));
    assert.equal(event.eventDate, "2026-11-16");
    assert.ok(event.sourceUrl.startsWith("https://www.taptap.cn/app/"));
  }
});
