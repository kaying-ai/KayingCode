import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("空会话引导在消息区域居中，并与顶部 AI 标识分层", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../../pages/chat/index.tsx", import.meta.url), "utf8"),
    readFile(new URL("./chat.css", import.meta.url), "utf8"),
  ]);

  assert.match(
    page,
    /const emptyConversation = state\.rows\.length === 0 && pending\.length === 0;/,
  );
  assert.match(
    page,
    /className="chat-empty-state"[\s\S]*?sessionId \? "暂无消息" : "输入消息开始新会话"/,
  );
  const emptyStateIndex = page.indexOf('className="chat-empty-state"');
  const scrollViewIndex = page.indexOf("<ScrollView", emptyStateIndex);
  assert.ok(emptyStateIndex > 0);
  assert.ok(scrollViewIndex > emptyStateIndex);

  const emptyState = /\.chat \.chat-empty-state \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(emptyState, /position: absolute;/);
  assert.match(emptyState, /top: 0;/);
  assert.match(emptyState, /right: 0;/);
  assert.match(emptyState, /bottom: 0;/);
  assert.match(emptyState, /left: 0;/);
  assert.match(emptyState, /display: flex;/);
  assert.match(emptyState, /align-items: center;/);
  assert.match(emptyState, /justify-content: center;/);
  assert.match(emptyState, /pointer-events: none;/);
});
