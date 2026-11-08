import assert from "node:assert/strict";
import test from "node:test";
import { chatPageUrl, resolveInitialChatSessionId } from "./chatRoute";

test("新建会话入口显式打开空白草稿", () => {
  assert.equal(chatPageUrl(null), "/pages/chat/index?new=1");
  assert.equal(resolveInitialChatSessionId({ new: "1" }, "old-session"), null);
});

test("已有会话路由可往返编解码，无参数旧链接保留当前会话", () => {
  const sessionId = "workspace/session #1";
  assert.equal(chatPageUrl(sessionId), "/pages/chat/index?sessionId=workspace%2Fsession%20%231");
  assert.equal(
    resolveInitialChatSessionId({ sessionId: encodeURIComponent(sessionId) }, "old-session"),
    sessionId,
  );
  assert.equal(resolveInitialChatSessionId({}, "old-session"), "old-session");
});
