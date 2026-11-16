import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadImportSource } from "../src/collector/importSource.js";

const CAPTURED_AT = "2026-11-16T01:00:00.000Z";

test("loads JSON import fallback and filters the calendar window", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kaying-taptap-import-"));
  try {
    await writeFile(
      join(dir, "boards.json"),
      JSON.stringify({
        download: [
          { appId: 1, title: "游戏一", tags: ["二次元"], rank: 1, rating: 9.1, reserveCount: 100 },
          { appId: 2, title: "游戏二", tags: ["模拟经营"], rank: 2 },
        ],
        reserve: [{ appId: 3, title: "预约游戏", tags: ["射击"], rank: 1 }],
        pop: [],
      }),
    );
    await writeFile(
      join(dir, "calendar.json"),
      JSON.stringify({
        events: [
          {
            eventId: 101,
            appId: 1,
            title: "游戏一",
            eventDate: "2026-11-16",
            subEventTypeTitle: "首发",
            tags: ["二次元"],
            sourceUrl: "https://www.taptap.cn/app/1",
          },
          {
            eventId: 102,
            appId: 2,
            title: "游戏二",
            eventDate: "2026-09-01",
            subEventTypeTitle: "首发",
            tags: ["模拟经营"],
          },
        ],
      }),
    );
    const result = await loadImportSource(dir, "2026-11-16", 30, CAPTURED_AT);
    assert.equal(result.boards.download.items.length, 2);
    assert.equal(result.boards.reserve.items.length, 1);
    assert.equal(result.boards.pop.items.length, 0);
    assert.equal(result.boards.pop.degraded, true);
    assert.equal(result.calendar.events.length, 1);
    assert.equal(result.calendar.events[0]!.eventId, 101);
    assert.ok(result.evidence.some((item) => item.id === "event:101"));
    assert.ok(result.warnings.some((warning) => warning.code === "import_board_empty"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loads CSV import fallback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kaying-taptap-import-csv-"));
  try {
    await writeFile(
      join(dir, "boards.csv"),
      [
        "board,rank,appId,title,tags,rating,reserveCount",
        "download,1,10,CSV游戏,二次元|角色扮演,8.8,500",
        "reserve,1,11,CSV预约,射击,8.2,300",
        "pop,1,12,CSV热玩,模拟经营,8.0,200",
      ].join("\n"),
    );
    await writeFile(
      join(dir, "calendar.csv"),
      [
        "eventId,eventDate,appId,title,subEventTypeTitle,tags,sourceUrl",
        "103,2026-11-16,10,CSV游戏,首发,二次元|角色扮演,https://www.taptap.cn/app/10",
      ].join("\n"),
    );
    const result = await loadImportSource(dir, "2026-11-16", 30, CAPTURED_AT);
    assert.equal(result.boards.download.items.length, 1);
    assert.deepEqual(result.boards.download.items[0]!.tags, ["二次元", "角色扮演"]);
    assert.equal(result.calendar.events.length, 1);
    assert.equal(result.calendar.events[0]!.category, "release");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
