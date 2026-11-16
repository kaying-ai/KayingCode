import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyEvent,
  dedupeEvents,
  normalizeApp,
  normalizeCalendarEvent,
  selectRepresentativeEvents,
} from "../src/collector/normalize.js";

test("normalizes a TapTap board app", () => {
  const app = normalizeApp({
    id: 165287,
    identifier: "com.PigeonGames.Phigros",
    title: "Phigros",
    tags: [{ value: "音游" }, { value: "节奏" }],
    developers: [{ name: "鸽游" }],
    stat: {
      rating: { score: "9.5" },
      reserve_count: 49_391,
      hits_total: 57_477_110,
      play_total: 140_427,
    },
    released_time: 1_567_220_233,
    icon: { url: "https://img.example/icon.png" },
    platform_info: { supported_platforms: [{ key: "android" }, { key: "ios" }] },
  });
  assert.ok(app);
  assert.equal(app.appId, 165287);
  assert.equal(app.title, "Phigros");
  assert.equal(app.rating, 9.5);
  assert.equal(app.reserveCount, 49_391);
  assert.deepEqual(app.tags, ["音游", "节奏"]);
  assert.deepEqual(app.developers, ["鸽游"]);
  assert.deepEqual(app.platforms, ["android", "ios"]);
  assert.equal(app.sourceUrl, "https://www.taptap.cn/app/165287");
});

test("missing id or title returns null", () => {
  assert.equal(normalizeApp({ title: "no id" }), null);
  assert.equal(normalizeApp({ id: 1 }), null);
});

test("classifies calendar event titles", () => {
  assert.equal(classifyEvent("首发"), "release");
  assert.equal(classifyEvent("预下载"), "release-preload");
  assert.equal(classifyEvent("新游预约"), "reservation");
  assert.equal(classifyEvent("不限量测试"), "test");
  assert.equal(classifyEvent("新版本更新"), "update");
  assert.equal(classifyEvent("折扣"), "discount");
  assert.equal(classifyEvent("其他"), "other");
});

test("calendar event date follows start_time in Asia/Shanghai", () => {
  const normalized = normalizeCalendarEvent(
    {
      id: 269748,
      game_id: 919537,
      event_type: 1,
      sub_event_type: 2,
      sub_event_type_title: "首发",
      start_time: 1_794_798_000, // 2026-11-16 11:00 Asia/Shanghai
      app_card_info: {
        id: 919537,
        title: "心动都市",
        tags: [{ value: "经营" }],
      },
    },
    "2026-11-15",
  );
  assert.ok(normalized.event);
  assert.equal(normalized.event.eventDate, "2026-11-16");
  assert.equal(normalized.event.category, "release");
  assert.equal(normalized.event.evidenceId, "event:269748");
});

test("dedupe and representative selection", () => {
  const release = normalizeCalendarEvent(
    {
      id: 1,
      game_id: 10,
      sub_event_type_title: "首发",
      start_time: 1_794_798_000,
      app_card_info: { id: 10, title: "A", tags: [] },
    },
    "2026-11-16",
  ).event!;
  const reservation = normalizeCalendarEvent(
    {
      id: 2,
      game_id: 10,
      sub_event_type_title: "新游预约",
      start_time: 1_794_711_600,
      app_card_info: { id: 10, title: "A", tags: [] },
    },
    "2026-11-15",
  ).event!;
  assert.equal(dedupeEvents([release, release]).length, 1);
  const representative = selectRepresentativeEvents([reservation, release]);
  assert.equal(representative.length, 1);
  assert.equal(representative[0]!.category, "release");
});
