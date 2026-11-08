import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readSkill(relativePath: string): Promise<string> {
  return readFile(path.join(packageRoot, "skills", relativePath), "utf8");
}

test("transcription skill routes each game workflow to the correct right-side panel", async () => {
  const skill = await readSkill("threejs-to-taptapmaker/SKILL.md");

  assert.match(skill, /TapTap 游戏预览/u);
  assert.match(skill, /转写对比/u);
  assert.match(skill, /普通 Maker.*TapTap 游戏预览/su);
  assert.match(skill, /网页游戏转写.*转写对比/su);
  assert.match(skill, /转写.*不得.*TapTap 游戏预览/su);
});

test("transcription skill keeps current-revision comparison ahead of LocalRuntime", async () => {
  const skill = await readSkill("threejs-to-taptapmaker/SKILL.md");
  const runtimeLoop = await readSkill("threejs-to-taptapmaker/references/runtime-loop.md");
  const combined = `${skill}\n${runtimeLoop}`;

  assert.match(combined, /每次.*publish.*prepare_visual_comparison/su);
  assert.match(combined, /旧.*comparison receipt.*不得.*LocalRuntime/su);
  assert.match(combined, /未指定.*--dir.*rlog.*不得.*降级/su);
  assert.match(combined, /当前.*revision.*operation.*原因/su);
  assert.match(combined, /远端.*runtime log.*不足以定位.*本地/su);
});

test("transcription orientation obeys explicit user direction before portrait preference", async () => {
  const skill = await readSkill("threejs-to-taptapmaker/SKILL.md");
  const visualCompare = await readSkill("threejs-to-taptapmaker/references/visual-compare.md");
  const combined = `${skill}\n${visualCompare}`;

  assert.match(combined, /用户明确.*竖屏.*横屏.*用户要求.*最高优先级/su);
  assert.match(combined, /用户未指定.*source guest/su);
  assert.match(combined, /竖屏.*完整.*交互.*优先竖屏/su);
  assert.match(combined, /横屏.*保底/su);
});
