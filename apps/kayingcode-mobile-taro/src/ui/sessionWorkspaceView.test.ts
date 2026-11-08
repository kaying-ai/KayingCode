import assert from "node:assert/strict";
import test from "node:test";
import type { SessionSummary } from "@zcode/shared/kayingcode-protocol-v4";
import {
  getSessionPreviewLabel,
  getWorkspaceSessionPreview,
  isWorkspaceExpanded,
  normalizeSessionPreview,
} from "./sessionWorkspaceView";

const sessions = Array.from({ length: 7 }, (_, index) => ({
  sessionId: `session-${index + 1}`,
  title: `会话 ${index + 1}`,
  lastAssistantPreview: "",
})) as SessionSummary[];

test("目录首项默认展开，显式选择在刷新和排序后仍优先", () => {
  const choices = new Map<string, boolean>();
  assert.equal(isWorkspaceExpanded(choices, "a", "a"), true);
  assert.equal(isWorkspaceExpanded(choices, "b", "a"), false);
  choices.set("a", false);
  choices.set("b", true);
  assert.equal(isWorkspaceExpanded(choices, "a", "a"), false);
  assert.equal(isWorkspaceExpanded(choices, "b", "a"), true);
  assert.equal(isWorkspaceExpanded(choices, "a", "b"), false);
  assert.equal(isWorkspaceExpanded(new Map(), "b", "b"), true);
});

test("空工作区强调创建入口，搜索无结果和未连接工作区不强调", () => {
  assert.equal(getWorkspaceSessionPreview([], "a", "a", false, "").isEmpty, true);
  assert.equal(getWorkspaceSessionPreview(sessions, "a", "a", false, "没有匹配").isEmpty, false);
  assert.equal(getWorkspaceSessionPreview([], "a", "b", false, "").isEmpty, false);
});

test("只有当前 attachment 的工作区能展示会话", () => {
  assert.equal(
    getWorkspaceSessionPreview(sessions, "workspace-a", "workspace-b", false, "").kind,
    "unavailable",
  );
  assert.deepEqual(
    getWorkspaceSessionPreview(sessions, "workspace-a", "workspace-a", false, "").sessions.map(
      (item) => item.sessionId,
    ),
    ["session-1", "session-2", "session-3", "session-4", "session-5"],
  );
});

test("查看全部及搜索覆盖第 6 条之后的会话", () => {
  assert.equal(
    getWorkspaceSessionPreview(sessions, "workspace-a", "workspace-a", true, "").sessions.length,
    7,
  );
  assert.deepEqual(
    getWorkspaceSessionPreview(
      sessions,
      "workspace-a",
      "workspace-a",
      false,
      "会话 7",
    ).sessions.map((item) => item.sessionId),
    ["session-7"],
  );
});

test("会话摘要归一为单行纯文本", () => {
  const preview = [
    "**KayingCode** 是 AI 编程助手。",
    "",
    "- 编写、修改代码",
    "- 用 `pnpm` 运行测试",
    "> 查看[文档](https://example.com/docs)。",
  ].join("\n");

  assert.equal(
    normalizeSessionPreview(preview),
    "KayingCode 是 AI 编程助手。 编写、修改代码 用 pnpm 运行测试 查看文档。",
  );
  assert.equal(normalizeSessionPreview("```ts\nconst value = 1;\n```"), "const value = 1;");
});

test("空摘要按会话阶段回退", () => {
  assert.equal(
    getSessionPreviewLabel({ lastAssistantPreview: "\n- \n", phase: "running" }),
    "工作中",
  );
  assert.equal(getSessionPreviewLabel({ lastAssistantPreview: "", phase: "draft" }), "空闲");
});
