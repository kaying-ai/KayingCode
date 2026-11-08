// 通知推导单测：运行中 / running→终态跃迁（去重）/ 待作答快照 / 文案。
import { test } from "vitest";
import assert from "node:assert/strict";
import type { SessionSummary } from "@zcode/shared/kayingcode-protocol-v4";
import {
  attentionTitleFor,
  completionTitleFor,
  computeNotifyUpdate,
  formatRunningText,
  NOTIFY_RUNNING_PHASES,
  NOTIFY_TERMINAL_PHASES,
} from "./notifyProjection.js";

/** 造一条最小可用 SessionSummary（只填本模块读到的字段）。 */
function session(overrides: Partial<SessionSummary> & { sessionId: string }): SessionSummary {
  return {
    workspaceId: "ws-1",
    title: "",
    phase: "running",
    sessionEnded: false,
    hasBackgroundWork: false,
    lastActivityAt: 0,
    createdAt: 0,
    ...overrides,
  } as SessionSummary;
}

test("相位集合与 Dart 常量一致（含旧相位兼容项）", () => {
  assert.deepEqual([...NOTIFY_RUNNING_PHASES].sort(), ["prewarming", "running"]);
  assert.ok(NOTIFY_TERMINAL_PHASES.has("completedSuccess"));
  assert.ok(NOTIFY_TERMINAL_PHASES.has("completedInterrupted"));
  assert.ok(NOTIFY_TERMINAL_PHASES.has("error"));
  assert.ok(NOTIFY_TERMINAL_PHASES.has("cancelled"));
  assert.equal(NOTIFY_TERMINAL_PHASES.has("running"), false);
});

test("running / prewarming 进入运行中列表，title 缺省回退 sessionId", () => {
  const update = computeNotifyUpdate({
    sessions: [
      session({
        sessionId: "s1",
        phase: "running",
        title: "修 bug",
        lastAssistantPreview: "正在读文件",
      }),
      session({ sessionId: "s2", phase: "prewarming" }),
      session({ sessionId: "s3", phase: "completedSuccess", title: "已完成" }),
    ],
    previousPhases: new Map(),
  });
  assert.deepEqual(
    update.running.map((task) => task.taskId),
    ["s1", "s2"],
  );
  assert.equal(update.running[0]!.preview, "正在读文件");
  assert.equal(update.running[1]!.title, "s2", "无标题时应回退到 sessionId");
  assert.deepEqual(update.completed, []);
});

test("running → 终态才产生完成事件；未变与反向不产生", () => {
  const update = computeNotifyUpdate({
    sessions: [
      session({
        sessionId: "done",
        phase: "completedSuccess",
        title: "已完成",
        lastActivityAt: 42,
      }),
      session({ sessionId: "still", phase: "running" }),
      session({ sessionId: "was-idle", phase: "running" }),
    ],
    previousPhases: new Map([
      ["done", "running"],
      ["still", "running"],
      ["was-idle", "draft"],
      ["gone", "running"],
    ]),
  });
  assert.deepEqual(
    update.completed.map((event) => event.taskId),
    ["done"],
  );
  assert.equal(update.completed[0]!.phase, "completedSuccess");
  assert.equal(update.completed[0]!.lastActivityAt, 42);
  assert.equal(update.completed[0]!.title, "已完成");
});

test("完成去重：同一相位重复推导不会重复出事件", () => {
  const sessions = [session({ sessionId: "s1", phase: "error", title: "崩了" })];
  const first = computeNotifyUpdate({ sessions, previousPhases: new Map([["s1", "running"]]) });
  assert.equal(first.completed.length, 1);
  // 用上一拍的相位再跑：此时 previous 已是终态，不再算跃迁。
  const second = computeNotifyUpdate({ sessions, previousPhases: new Map([["s1", "error"]]) });
  assert.deepEqual(second.completed, []);
});

test("重跑任务：再次 running→终态仍会触发", () => {
  const rerun = computeNotifyUpdate({
    sessions: [session({ sessionId: "s1", phase: "completedSuccess" })],
    previousPhases: new Map([
      ["s1", "running"],
      ["s1-retry", "running"],
    ]),
  });
  assert.equal(rerun.completed.length, 1);
});

test("待作答交互是全量快照，缺 interactionId 的条目被跳过", () => {
  const update = computeNotifyUpdate({
    sessions: [
      session({
        sessionId: "ask",
        phase: "running",
        title: "改配置",
        pendingInteraction: { interactionId: "i-1", kind: "permission", toolName: "Bash" },
      }),
      session({
        sessionId: "ask2",
        phase: "running",
        pendingInteraction: { interactionId: "i-2", kind: "userInput" },
      }),
      session({
        sessionId: "broken",
        phase: "running",
        pendingInteraction: { interactionId: "", kind: "permission" },
      }),
      session({ sessionId: "idle", phase: "completedSuccess" }),
    ],
    previousPhases: new Map(),
  });
  assert.deepEqual(
    update.pendingInteractions.map((event) => event.interactionId),
    ["i-1", "i-2"],
  );
  assert.equal(update.pendingInteractions[0]!.toolName, "Bash");
  assert.equal(update.pendingInteractions[1]!.toolName, "", "toolName 缺省为空串");
  assert.equal(update.pendingInteractions[1]!.title, "ask2");
});

test("空输入得到空结果", () => {
  const update = computeNotifyUpdate({ sessions: [], previousPhases: new Map() });
  assert.deepEqual(update, { running: [], completed: [], pendingInteractions: [] });
});

test("完成标题区分成功/失败/中断", () => {
  assert.equal(completionTitleFor("completedSuccess"), "任务完成");
  assert.equal(completionTitleFor("completed"), "任务完成");
  assert.equal(completionTitleFor("failed"), "任务失败");
  assert.equal(completionTitleFor("error"), "任务失败");
  assert.equal(completionTitleFor("completedInterrupted"), "任务中断");
  assert.equal(completionTitleFor("cancelled"), "任务中断");
});

test("待作答标题区分权限请求（带工具名）与用户输入", () => {
  assert.equal(attentionTitleFor("permission", "Bash"), "权限请求 · Bash");
  assert.equal(attentionTitleFor("permission", ""), "权限请求等待批准");
  assert.equal(attentionTitleFor("userInput", "AskUserQuestion"), "等待你的输入");
});

test("运行中提示文案：有无 preview 两种排布", () => {
  assert.equal(formatRunningText([]), "");
  assert.equal(
    formatRunningText([
      { taskId: "a", title: "编译", preview: "   " },
      { taskId: "b", title: "测试", preview: "跑 12 个用例" },
    ]),
    "• 编译\n\n• 测试\n  跑 12 个用例",
  );
});
