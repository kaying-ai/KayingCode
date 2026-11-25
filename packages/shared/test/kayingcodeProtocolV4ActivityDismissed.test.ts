// 会话活动摘要收起边界（docs/ui/chat-summary-panel.md §8）的协议面：
// additive 的 activitySummaryDismissed 只做 optional 兼容，旧快照/旧发送端缺字段时仍按
// 「本批未收起」处理；字段一旦在场，数组与时间戳必须是严格形状，不能靠默认值兜底。
import { describe, expect, it } from "vitest";
import {
  activitySummaryDismissedSchema,
  conversationSnapshotSchema,
  statePatchSchema,
} from "../src/kayingcode-protocol-v4/index.js";

const dismissed = {
  at: 1_700_000_000_000,
  workIds: ["bash"],
  subagentIds: ["child"],
  workflowRunIds: ["run-1"],
};

/** 最小合法快照（与 projection-state 的初始态同形），用于验证 optional 字段的 wire 兼容。 */
function createSnapshot(withDismissed: boolean) {
  return {
    protocolVersion: 1,
    sessionId: "session",
    logEpoch: "epoch",
    seq: 0,
    revision: 0,
    control: {
      phase: "draft",
      sessionEnded: false,
      canStop: false,
      stopState: "idle",
      stopTargetKind: "unknown",
      activeWorks: [],
      lastError: null,
      apiRetry: null,
    },
    availability: {
      fork: { allowed: false, reasonCode: "forkTargetNotStable" },
      compact: { allowed: false, reasonCode: "idleCannotCompact" },
      switchModelConfig: { allowed: true },
      setFollowupMode: { allowed: true },
      queueEdit: { allowed: true },
      sendQueuedNow: { allowed: false, reasonCode: "sendQueuedNowRequiresRunning" },
      pauseGoal: { allowed: false, reasonCode: "noGoalToPause" },
      resumeGoal: { allowed: false, reasonCode: "noGoalToResume" },
    },
    inputRouting: { mode: "startNow" },
    meta: { title: "", titleSource: "default" },
    config: {
      provider: "",
      model: "",
      thought: "",
      thoughtLevels: [],
      followupMode: "queue",
      mode: "build",
    },
    modelTransition: null,
    usage: {
      contextWindow: null,
      cumulative: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    },
    queue: { items: [], autoDrain: true },
    pendingInteractions: [],
    pendingCommands: [],
    backgroundWorks: [],
    ...(withDismissed ? { activitySummaryDismissed: dismissed } : {}),
    subagents: { revision: 0, childSessionIds: [], running: [], endedTotal: 0 },
    goal: null,
    plan: null,
    workspaceHookAdmission: null,
    rows: { window: [], totalCount: 0, firstRowId: null },
  };
}

describe("v4 activitySummaryDismissed 协议", () => {
  it("解析结束水位、work/child/run 三类身份", () => {
    expect(activitySummaryDismissedSchema.parse(dismissed)).toEqual(dismissed);
    expect(activitySummaryDismissedSchema.safeParse({ at: 1 }).success).toBe(false);
    expect(
      activitySummaryDismissedSchema.safeParse({ ...dismissed, workIds: undefined }).success,
    ).toBe(false);
    expect(activitySummaryDismissedSchema.safeParse({ ...dismissed, at: "now" }).success).toBe(
      false,
    );
    expect(
      activitySummaryDismissedSchema.safeParse({ ...dismissed, subagentIds: [1] }).success,
    ).toBe(false);
  });

  it("旧快照缺字段仍可解析，新快照保留收起水位", () => {
    const legacy = conversationSnapshotSchema.parse(createSnapshot(false));
    expect(legacy.activitySummaryDismissed).toBeUndefined();
    const current = conversationSnapshotSchema.parse(createSnapshot(true));
    expect(current.activitySummaryDismissed).toEqual(dismissed);
  });

  it("state.updated 可以单独携带收起水位并拒绝非法形状", () => {
    expect(statePatchSchema.parse({ activitySummaryDismissed: dismissed })).toEqual({
      activitySummaryDismissed: dismissed,
    });
    expect(statePatchSchema.safeParse({ activitySummaryDismissed: { at: 1 } }).success).toBe(false);
    expect(
      statePatchSchema.safeParse({ activitySummaryDismissed: { ...dismissed, at: null } }).success,
    ).toBe(false);
  });
});
