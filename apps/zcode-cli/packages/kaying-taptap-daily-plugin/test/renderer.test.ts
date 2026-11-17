import assert from "node:assert/strict";
import test from "node:test";

import { computeMetrics } from "../src/metrics/computeMetrics.js";
import { renderArchiveIndex } from "../src/renderer/html.js";
import { renderReport } from "../src/renderer/renderReport.js";
import type { Insights } from "../src/types.js";
import { makeEvent, makeSnapshot } from "./helpers.js";

const GENERATED_AT = "2026-11-16T01:30:00.000Z";

function setup() {
  const snapshot = makeSnapshot({
    events: [
      makeEvent(3001, "二次元新游A", ["二次元"], "release", "2026-11-16", {
        rating: 9.2,
        reserveCount: 12_345,
        developers: ["测试厂商"],
        iconUrl: "https://img.example/icon.png",
      }),
      makeEvent(3101, "模拟经营新游", ["模拟经营"], "release", "2026-11-15"),
      makeEvent(3301, "二次元预约", ["二次元"], "reservation", "2026-11-16"),
    ],
  });
  snapshot.boards.download.items[0]!.iconUrl = "https://img.example/board-icon.png";
  const metrics = computeMetrics(snapshot, null, GENERATED_AT);
  const insights: Insights = {
    schemaVersion: 1,
    generatedAt: GENERATED_AT,
    summary: ["今日信号 A"],
    newGames: [
      {
        appId: 3001,
        title: "二次元新游A",
        oneLiner: "一句话定位",
        audience: "二次元用户",
        comparables: [{ title: "可比游戏", reason: "同赛道" }],
        signals: [{ label: "预约", value: "12345", evidenceIds: ["event:30010"] }],
        risks: ["竞争激烈"],
        confidence: "high",
        evidenceIds: ["event:30010"],
      },
    ],
    boards: [
      {
        board: "download",
        summary: "榜单稳定",
        movers: ["A +2"],
        crossBoard: [],
        evidenceIds: ["app:1000"],
      },
    ],
    tracks: [
      {
        genreId: "acgn",
        crowdingLevel: "high",
        rationale: "供给密集",
        notableGames: [
          { appId: 3001, title: "二次元新游A", reason: "首日预约高", evidenceIds: ["event:30010"] },
        ],
        opportunities: ["细分题材"],
        risks: ["买量成本"],
        evidenceIds: ["event:30010"],
      },
    ],
    opportunities: [{ text: "机会一", kind: "fact", evidenceIds: ["event:30010"] }],
    risks: [{ text: "风险一", kind: "inference", evidenceIds: ["event:30010"] }],
    dataNotes: ["口径说明"],
  };
  return { snapshot, metrics, insights };
}

test("renders markdown, html and report json with fixed sections", () => {
  const { snapshot, metrics, insights } = setup();
  const rendered = renderReport({
    snapshot,
    metrics,
    insights,
    publicBaseUrl: "https://example.com/kaying-bot/kaying-taptap-daily",
    generatedAt: GENERATED_AT,
  });

  assert.match(rendered.markdown, /# TapTap 游戏日报 · 2026-11-16/);
  for (const heading of [
    "01 今日速览",
    "02 新游发现",
    "03 热门游戏",
    "04 题材赛道",
    "05 机会与风险",
    "06 数据说明",
    "07 附录",
  ]) {
    assert.match(rendered.markdown, new RegExp(heading));
  }
  assert.match(rendered.markdown, /今日信号 A/);
  assert.match(rendered.markdown, /二次元新游A/);
  assert.match(rendered.markdown, /https:\/\/www\.taptap\.cn\/app\/3001/);
  assert.match(rendered.markdown, /事件:30010|event:30010/);
  assert.match(rendered.markdown, /<img src="https:\/\/img\.example\/icon\.png"/);
  assert.match(rendered.markdown, /更多报告联系.*service@kayingai\.com/);

  assert.match(rendered.html, /<!doctype html>/);
  assert.match(rendered.html, /<h1>TapTap 游戏日报 · 2026-11-16<\/h1>/);
  assert.match(rendered.html, /今日信号 A/);
  assert.match(rendered.html, /<img class="game-icon" src="https:\/\/img\.example\/icon\.png"/);
  assert.match(
    rendered.html,
    /<img class="game-icon" src="https:\/\/img\.example\/board-icon\.png"/,
  );
  assert.doesNotMatch(rendered.html, /<script\b/);
  assert.match(rendered.html, /更多报告联系/);
  assert.match(rendered.html, /service@kayingai\.com/);
  assert.match(rendered.html, /由 KayingCode kaying-taptap-daily 生成/);
  assert.match(rendered.html, /开源一站式游戏开发Harness/);
  assert.match(rendered.html, /https:\/\/kayingai\.com/);
  assert.match(rendered.html, /加群交流/);
  assert.match(rendered.html, /alt="客服二维码"/);
  assert.match(rendered.html, /src="data:image\/png;base64,/);

  assert.equal(rendered.reportJson.counts.release7d, 2);
  assert.equal(rendered.reportJson.counts.reservation7d, 1);
  assert.equal(
    rendered.reportJson.reportUrl,
    "https://example.com/kaying-bot/kaying-taptap-daily/2026-11-16/",
  );
  assert.equal(rendered.reportJson.insights.summary[0], "今日信号 A");
  assert.ok(rendered.reportJson.topGenres.length > 0);
  assert.ok(
    rendered.reportJson.newGames.topReleases.some(
      (item) => item.iconUrl === "https://img.example/icon.png",
    ),
  );
  assert.equal(
    rendered.reportJson.boards.download.items[0]!.iconUrl,
    "https://img.example/board-icon.png",
  );
});

test("rejects non-http icon urls", () => {
  const { snapshot, metrics, insights } = setup();
  snapshot.calendar.events[0]!.iconUrl = "javascript:alert(1)";
  snapshot.boards.download.items[0]!.iconUrl = "data:image/svg+xml,<svg/>";
  const rendered = renderReport({
    snapshot,
    metrics,
    insights,
    publicBaseUrl: "",
    generatedAt: GENERATED_AT,
  });
  assert.doesNotMatch(rendered.html, /javascript:/);
  assert.doesNotMatch(rendered.html, /<img class="game-icon" src="data:image/);
  assert.doesNotMatch(rendered.markdown, /javascript:|data:image/);
});

test("drops unknown evidence ids and records a warning", () => {
  const { snapshot, metrics, insights } = setup();
  insights.newGames[0]!.evidenceIds = ["event:30010", "event:missing"];
  insights.opportunities[0]!.evidenceIds = ["event:missing"];
  const rendered = renderReport({
    snapshot,
    metrics,
    insights,
    publicBaseUrl: "",
    generatedAt: GENERATED_AT,
  });
  assert.deepEqual(rendered.reportJson.insights.newGames[0]!.evidenceIds, ["event:30010"]);
  assert.deepEqual(rendered.reportJson.insights.opportunities[0]!.evidenceIds, []);
  assert.ok(
    rendered.reportJson.warnings.some((warning) => warning.code === "insights_evidence_unknown"),
  );
});

test("escapes untrusted text in html", () => {
  const { snapshot, metrics, insights } = setup();
  insights.summary = ["<script>alert(1)</script>"];
  const rendered = renderReport({
    snapshot,
    metrics,
    insights,
    publicBaseUrl: "",
    generatedAt: GENERATED_AT,
  });
  assert.doesNotMatch(rendered.html, /<script>alert/);
  assert.match(rendered.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("renders an archive index", () => {
  const html = renderArchiveIndex([
    { date: "2026-11-15", dataQuality: "ok", releases7d: 1, reservations7d: 2, topTrack: "二次元" },
    {
      date: "2026-11-16",
      dataQuality: "degraded",
      releases7d: 3,
      reservations7d: 4,
      topTrack: "射击",
    },
  ]);
  assert.match(html, /历史归档/);
  assert.match(html, /2026-11-16/);
  assert.match(html, /\.\/2026-11-15\//);
  assert.match(html, /加群交流/);
  assert.match(html, /alt="客服二维码"/);
  assert.match(html, /由 KayingCode kaying-taptap-daily 生成/);
  assert.match(html, /开源一站式游戏开发Harness/);
});
