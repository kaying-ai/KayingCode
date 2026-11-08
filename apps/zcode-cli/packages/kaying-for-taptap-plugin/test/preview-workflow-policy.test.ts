import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { publishTool } from "../src/tools/high-level-tools.js";
import { KAYING_FOR_TAPTAP_WORKFLOW_RULES } from "../src/tools/workflow-rules.js";

test("publish discovery and loaded skills keep right-side preview ahead of local simulator", async () => {
  const guidance = [
    publishTool.description,
    ...KAYING_FOR_TAPTAP_WORKFLOW_RULES.map((rule) => rule.content),
    ...(await Promise.all(
      ["game-publisher", "game-qa", "autodev-loop"].map((name) =>
        readFile(new URL(`../skills/${name}/SKILL.md`, import.meta.url), "utf8"),
      ),
    )),
  ];
  for (const content of guidance) {
    assert.match(content, /right-side/);
    assert.match(content, /[Ll]ocal simulator\s+preview is a fallback only/);
    assert.match(content, /remote diagnostics are insufficient/);
  }
  assert.match(publishTool.description, /taptap-preview:\*/);
  assert.match(publishTool.description, /do not open the preview URL in a new browser tab/);
});

test("upstream diagnostic guidance preserves plugin runtime and local project ownership", async () => {
  const publisher = await readFile(
    new URL("../skills/game-publisher/SKILL.md", import.meta.url),
    "utf8",
  );
  const engineer = await readFile(
    new URL("../skills/gameplay-engineer/SKILL.md", import.meta.url),
    "utf8",
  );
  assert.match(publisher, /cloud_workspace_blocked/);
  assert.match(publisher, /cloudRepair/);
  assert.match(publisher.replace(/\s+/g, " "), /Do not run.*git sync/);
  assert.match(engineer, /\.project\/settings\.json/);
  assert.match(engineer, /@runtime/);
  assert.match(engineer, /identity.*entry.*version/);
  for (const skill of [publisher, engineer]) {
    assert.doesNotMatch(skill, /npx\s+.*@taptap\/maker|taptap-maker upgrade/);
  }
});
