import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Bot 卡片图标共享垂直中心，右侧操作图标同轴对齐", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("./botList.tsx", import.meta.url), "utf8"),
    readFile(new URL("./shell.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /<View className="bot-card-actions">/);
  assert.match(source, /className="icon-button bot-card-edit"/);
  assert.match(source, /name="check_circle"[\s\S]*name="edit_outlined"/);
  assert.match(styles, /\.bot-card\s*\{[^}]*align-items:\s*center;/s);
  assert.match(styles, /\.bot-card-actions\s*\{[^}]*align-items:\s*center;/s);
  assert.match(styles, /\.bot-card-actions\s*\{[^}]*align-self:\s*center;/s);
  assert.match(styles, /\.bot-card-icon\s*\{[^}]*width:\s*26px;[^}]*height:\s*26px;/s);
});
