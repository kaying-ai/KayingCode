import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { reportData } from "../runtime/report-data.mjs";
import { generateReport } from "../runtime/report.mjs";
import { applyReview } from "../runtime/session-updates.mjs";
import { validateReview } from "../runtime/review.mjs";

const fixture = () => ({
  id: "test",
  title: "runtime session title",
  createdAt: new Date(0).toISOString(),
  status: "stopped",
  source: { kind: "android", packageName: "test.game" },
  actions: [],
  events: [],
  limitations: [],
  goals: [],
  artifacts: [
    {
      id: "board",
      kind: "screenshot",
      path: "screenshots/board.png",
      label: "raw",
      offsetSeconds: 0,
    },
    { id: "log", kind: "log", path: "logs/raw.txt", label: "raw log", offsetSeconds: 1 },
  ],
  review: {
    gameName: "示例游戏",
    lede: "用消除关卡推进庭院整理的休闲游戏。",
    sections: [
      {
        key: "mechanics",
        text: "交换同色棋子，清除木箱。",
        certainty: "observed",
        status: "partial",
        evidenceIds: ["board"],
        media: [{ artifactId: "board", caption: "<木箱>是这一关的目标" }],
      },
    ],
  },
});
test("reader report leads with design and gameplay; technical material follows in a closed appendix", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "reader-report-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const folder of ["screenshots", "logs"]) await mkdir(join(directory, folder));
  const s = fixture();
  const data = reportData(s, 10000);
  assert.equal(data.title, "示例游戏｜新游戏试玩报告");
  assert.ok(
    data.sections.findIndex((x) => x.key === "audiovisual") <
      data.sections.findIndex((x) => x.key === "mechanics"),
  );
  assert.equal(data.sections.at(-1).key, "coverage");
  await generateReport(directory, s, 10000);
  const html = await readFile(join(directory, "report.html"), "utf8");
  const markdown = await readFile(join(directory, "report.md"), "utf8");
  const appendix = html.indexOf('<details id="technical-appendix"');
  assert.ok(appendix > html.indexOf('id="mechanics"'));
  assert.ok(html.indexOf("运行耗时") > appendix);
  assert.ok(!html.slice(0, appendix).includes("评分维度覆盖率"));
  assert.ok(!html.includes("依据与来源"));
  assert.ok(!html.includes('class="sources"'));
  assert.ok(!markdown.slice(0, markdown.indexOf("## 附录：")).includes("来源："));
  assert.deepEqual(data.sections.find((s) => s.key === "mechanics").evidenceIds, ["board"]);
  assert.ok(html.includes("&lt;木箱&gt;是这一关的目标"));
  assert.ok(markdown.indexOf("核心玩法") < markdown.indexOf("运行耗时"));
  assert.ok(markdown.includes("screenshots/board.png"));
  s.reportKind = "diagnostic";
  const diagnostic = reportData(s, 10000);
  assert.equal(diagnostic.title, s.title);
  assert.equal(diagnostic.sections[2].key, "coverage");
});
test("curated media belongs to section evidence and may not be a log", () => {
  const s = fixture();
  assert.doesNotThrow(() => validateReview(s, s.review));
  const section = s.review.sections[0];
  section.media = [{ artifactId: "log", caption: "不能把日志当配图" }];
  assert.throws(() => validateReview(s, s.review), /media/i);
  section.evidenceIds.push("log");
  assert.throws(() => validateReview(s, s.review), /media/i);
});
test("game name and lede survive section-only patches", () => {
  const s = fixture();
  applyReview(
    s,
    {
      sections: [
        { key: "summary", text: "庭院三消", certainty: "observed", evidenceIds: ["board"] },
      ],
    },
    "merge",
    1000,
  );
  assert.equal(s.review.gameName, "示例游戏");
  assert.equal(s.review.lede, "用消除关卡推进庭院整理的休闲游戏。");
});
