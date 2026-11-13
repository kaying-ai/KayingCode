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

test("transcription skill enforces the source-first iron rule", async () => {
  const skill = await readSkill("threejs-to-taptapmaker/SKILL.md");
  const command = await readFile(
    path.join(packageRoot, "commands", "transcribe-web-game.md"),
    "utf8",
  );
  const combined = `${skill}\n${command}`;

  assert.match(combined, /截图\/对比图只回答.*哪里不一样/su);
  assert.match(combined, /文件:行号.*具体值.*分支.*资源.*期望行为/su);
  assert.match(combined, /找不到源码证据.*禁止编辑/su);
  assert.match(combined, /按根因批量/su);
  assert.match(combined, /最多 2 轮/su);
  assert.match(combined, /source\/SOURCE_NOTES\.md/su);
  assert.match(combined, /visual_fixes/su);
});

test("transcription skill defines a read-only subagent policy", async () => {
  const skill = await readSkill("threejs-to-taptapmaker/SKILL.md");
  const subagents = await readSkill("threejs-to-taptapmaker/references/subagents.md");
  const combined = `${skill}\n${subagents}`;

  assert.match(combined, /1 个主写手.*N 个只读分析员/su);
  assert.match(combined, /主 agent 独占/su);
  assert.match(combined, /禁止.*子 agent.*publish|子 agent.*不.*publish/su);
  assert.match(combined, /file:line/su);
  assert.match(combined, /子 agent 的输出是\*\*假设\*\*/su);
});

test("transcription references require source audits and deterministic comparison", async () => {
  const pipeline = await readSkill("threejs-to-taptapmaker/references/pipeline.md");
  const visualCompare = await readSkill("threejs-to-taptapmaker/references/visual-compare.md");
  const acceptance = await readSkill("threejs-to-taptapmaker/references/acceptance.md");
  const workspace = await readSkill("threejs-to-taptapmaker/references/workspace.md");
  const combined = `${pipeline}\n${visualCompare}\n${acceptance}\n${workspace}`;

  assert.match(combined, /source\/audit\/control-flow\.md/su);
  assert.match(combined, /source\/audit\/shaders\.md/su);
  assert.match(combined, /source\/audit\/materials\.md/su);
  assert.match(combined, /source\/audit\/animations\.md/su);
  assert.match(combined, /t3m audit/su);
  assert.match(combined, /source\/SOURCE_NOTES\.md/su);
  assert.match(combined, /visual_fixes/su);
  assert.match(combined, /gameplay_screenshot/su);
  assert.match(combined, /diff 是线索，不是规格/su);
  assert.match(combined, /冻结.*时间|暂停.*再截/su);
  assert.match(combined, /compare_metrics/su);
  assert.match(combined, /kayingcode-side-pane.*拒绝 accept|拒绝 accept.*kayingcode-side-pane/su);
});

test("transcription pitfalls record the Turbo Tails anti-patterns", async () => {
  const pitfalls = await readSkill("threejs-to-taptapmaker/references/pitfalls.md");

  assert.match(pitfalls, /H\. 转写流程反例（Turbo Tails 实测）/su);
  assert.match(pitfalls, /4\.45 m/su);
  assert.match(pitfalls, /rb\(\).*ab\(\)|ab\(\).*rb\(\)/su);
  assert.match(pitfalls, /clearcoat/su);
});

test("visual repair skill defers transcription to the source-first workflow", async () => {
  const skill = await readSkill("visual-repair-loop/SKILL.md");

  assert.match(skill, /transcription.*source-first rule/su);
  assert.match(skill, /screenshots are clues, not specs/su);
});
