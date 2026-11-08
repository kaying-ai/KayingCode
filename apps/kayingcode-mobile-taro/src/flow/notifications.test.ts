// 通知域壳层服务单测：门控、去重、偏好、未读计数与释放。
// 纯 TS，不需要 Taro（前台/可见会话由 setter 注入）。
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { SessionSummary } from "@zcode/shared/kayingcode-protocol-v4";
import {
  clearUnread,
  ingestSessionsIndex,
  markSessionRead,
  resetNotifyStateForTest,
  setAppResumed,
  setNotifyPrefs,
  setVisibleSession,
  subscribeNotifyAlerts,
  unreadFor,
  unreadTotal,
} from "./notifications";

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

beforeEach(() => {
  resetNotifyStateForTest();
});

/** 先喂一拍 running，再喂终态，构成一次真实跃迁。 */
function completeTask(sessionId: string, phase: SessionSummary["phase"], title = "任务"): void {
  ingestSessionsIndex([session({ sessionId, phase: "running", title })]);
  ingestSessionsIndex([session({ sessionId, phase, title, lastActivityAt: 10 })]);
}

test("running → 终态产生一条完成告警并累加未读", () => {
  const alerts: string[] = [];
  subscribeNotifyAlerts((alert) => alerts.push(alert.title));
  completeTask("s1", "completedSuccess", "修 bug");
  assert.deepEqual(alerts, ["任务完成"]);
  assert.equal(unreadFor("s1"), 1);
  assert.equal(unreadTotal(), 1);
});

test("失败/中断用对应标题，不宣称为完成", () => {
  completeTask("s1", "error");
  completeTask("s2", "completedInterrupted");
  assert.equal(unreadFor("s1"), 1);
  assert.equal(unreadFor("s2"), 1);

  const failureTitles: string[] = [];
  resetNotifyStateForTest();
  subscribeNotifyAlerts((alert) => failureTitles.push(alert.title));
  completeTask("s1", "error");
  completeTask("s2", "completedInterrupted");
  assert.deepEqual(failureTitles, ["任务失败", "任务中断"]);
});

test("三重门控：前台正看该会话不推，看别的会话或后台都推", () => {
  setAppResumed(true);
  setVisibleSession("s1");
  assert.deepEqual(ingestSessionsIndex([session({ sessionId: "s1", phase: "running" })]), []);

  // 前台但在看别的会话 → 推。
  ingestSessionsIndex([session({ sessionId: "s2", phase: "running" })]);
  const other = ingestSessionsIndex([session({ sessionId: "s2", phase: "completedSuccess" })]);
  assert.equal(other.length, 1);

  // 正看的会话完成 → 不推（相位仍被记录）。
  const watched = ingestSessionsIndex([session({ sessionId: "s1", phase: "completedSuccess" })]);
  assert.deepEqual(watched, []);

  // 后台 → 即使正看的会话也推（重新跑一轮）。
  setAppResumed(false);
  ingestSessionsIndex([session({ sessionId: "s3", phase: "running" })]);
  const background = ingestSessionsIndex([session({ sessionId: "s3", phase: "completedSuccess" })]);
  assert.equal(background.length, 1);
});

test("偏好关闭时抑制对应类别（完成 / 失败 / 待作答各自独立）", () => {
  setNotifyPrefs({ completions: false });
  completeTask("s1", "completedSuccess");
  assert.equal(unreadTotal(), 0);

  resetNotifyStateForTest();
  setNotifyPrefs({ failures: false });
  completeTask("s2", "error");
  assert.equal(unreadTotal(), 0, "失败开关不影响成功开关的语义");

  resetNotifyStateForTest();
  setNotifyPrefs({ approvals: false });
  ingestSessionsIndex([
    session({
      sessionId: "s3",
      phase: "running",
      pendingInteraction: { interactionId: "i-1", kind: "permission", toolName: "Bash" },
    }),
  ]);
  assert.equal(unreadTotal(), 0);
});

test("完成去重：终态重复不再是跃迁；活动标记不回退则不重复提醒", () => {
  ingestSessionsIndex([session({ sessionId: "s1", phase: "running" })]);
  const first = ingestSessionsIndex([
    session({ sessionId: "s1", phase: "completedSuccess", lastActivityAt: 100 }),
  ]);
  assert.equal(first.length, 1);

  // 重连快照重放：相位仍是终态，没有 running→终态 的跃迁 → 不出事件。
  const replay = ingestSessionsIndex([
    session({ sessionId: "s1", phase: "completedSuccess", lastActivityAt: 100 }),
  ]);
  assert.deepEqual(replay, []);

  // 抖动：回到 running 再完成，但活动标记没有前进 → 被去重拦下。
  ingestSessionsIndex([session({ sessionId: "s1", phase: "running" })]);
  const sameMarker = ingestSessionsIndex([
    session({ sessionId: "s1", phase: "completedSuccess", lastActivityAt: 100 }),
  ]);
  assert.deepEqual(sameMarker, []);

  // 真·重跑：标记前进 → 重新提醒。
  ingestSessionsIndex([session({ sessionId: "s1", phase: "running" })]);
  const advanced = ingestSessionsIndex([
    session({ sessionId: "s1", phase: "completedSuccess", lastActivityAt: 200 }),
  ]);
  assert.equal(advanced.length, 1);
  assert.equal(unreadTotal(), 2);
});

test("待作答交互：一个 interactionId 只提醒一次，解决后释放 id", () => {
  const approval = () =>
    session({
      sessionId: "s1",
      phase: "running",
      title: "改配置",
      pendingInteraction: { interactionId: "i-1", kind: "permission", toolName: "Write" },
    });
  const first = ingestSessionsIndex([approval()]);
  assert.equal(first.length, 1);
  assert.equal(first[0]!.kind, "approval");
  assert.equal(first[0]!.title, "权限请求 · Write");
  assert.equal(first[0]!.text, "改配置");

  // 同一 interactionId 再现 → 静默。
  assert.deepEqual(ingestSessionsIndex([approval()]), []);

  // 交互解决（快照里没有它）→ 释放 id；再次出现按新事件提醒。
  assert.deepEqual(ingestSessionsIndex([session({ sessionId: "s1", phase: "running" })]), []);
  const again = ingestSessionsIndex([approval()]);
  assert.equal(again.length, 1);
});

test("userInput 类交互用「等待你的输入」标题", () => {
  const alerts = ingestSessionsIndex([
    session({
      sessionId: "s1",
      phase: "running",
      pendingInteraction: { interactionId: "i-9", kind: "userInput" },
    }),
  ]);
  assert.equal(alerts[0]!.title, "等待你的输入");
});

test("未读：按会话计数，打开会话清零，总数随之下降", () => {
  completeTask("s1", "completedSuccess");
  completeTask("s2", "completedSuccess");
  assert.equal(unreadTotal(), 2);
  markSessionRead("s1");
  assert.equal(unreadFor("s1"), 0);
  assert.equal(unreadTotal(), 1);
  clearUnread();
  assert.equal(unreadTotal(), 0);
});

test("running / prewarming 不产生告警，只记录相位", () => {
  assert.deepEqual(ingestSessionsIndex([session({ sessionId: "s1", phase: "prewarming" })]), []);
  assert.deepEqual(ingestSessionsIndex([session({ sessionId: "s1", phase: "running" })]), []);
  assert.equal(unreadTotal(), 0);
});
