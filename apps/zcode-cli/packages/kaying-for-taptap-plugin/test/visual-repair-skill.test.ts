import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readSkill(relativePath: string): Promise<string> {
  return readFile(path.join(packageRoot, "skills", relativePath), "utf8");
}

test("visual repair skill defines a bounded right-preview-only workflow", async () => {
  const skill = await readSkill("visual-repair-loop/SKILL.md");

  assert.match(skill, /name: visual-repair-loop/u);
  assert.match(skill, /explicitly asks to create or change a visible game result/u);
  assert.match(skill, /Do not trigger it for logic-only/u);
  assert.match(skill, /taptap-preview:/u);
  assert.match(skill, /browser\.user\.openTabs\(\)/u);
  assert.match(skill, /nodeRepl\.emitImage\(await tab\.screenshot\(\)\)/u);
  assert.match(skill, /screenshotWithObservation/u);
  assert.match(skill, /clickScreenshot/u);
  assert.match(skill, /tapScreenshot/u);
  assert.match(skill, /touchStart/u);
  assert.match(skill, /scaleApplied: false/u);
  assert.match(skill, /without converting them to viewport or\s+desktop coordinates/u);
  assert.match(skill, /Do not pass `fullPage: true`/u);
  assert.match(skill, /at most three review screenshots and two repair rounds/u);
  assert.match(skill, /Every `tab\.screenshot\(\)` call consumes one review screenshot/u);
  assert.match(skill, /Do not retry the\s+same publication, tab and viewport/u);
  assert.match(skill, /insufficient evidence/u);
  assert.doesNotMatch(skill, /captureWindowScreenshot/u);
});

test("TapTap skills route current visual work without legacy preview tools", async () => {
  const skillPaths = [
    "autodev-loop/SKILL.md",
    "autodev-loop/references/interaction.md",
    "game-director/SKILL.md",
    "game-qa/SKILL.md",
    "gameplay-engineer/SKILL.md",
    "visual-repair-loop/SKILL.md",
  ];
  const contents = await Promise.all(skillPaths.map(readSkill));
  const combined = contents.join("\n");

  assert.match(combined, /visual-repair-loop/u);
  assert.match(combined, /Browser Use/u);
  assert.doesNotMatch(
    combined,
    /taptap_preview_(?:screenshot|inspect|input|refresh)/u,
    "migrated skills must not advertise the removed Pi preview tool host",
  );
});
