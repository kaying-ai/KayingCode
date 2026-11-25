// 会话活动摘要收起（docs/ui/chat-summary-panel.md §8）在 UI 模型侧的语义：
// - 收起水位只过滤「已结束」的同一身份；结束时间晚于水位说明有新一批结果，继续展示。
// - 运行中的 work / child / run 永远优先展示，不因旧收起标记被隐藏（恢复时由 CLI 清除标记）。
import { describe, expect, it } from "vitest";
import type {
  ActivitySummaryDismissed,
  BackgroundWorkSummary,
  RunningSubagentSummary,
  WorkflowRunState,
} from "@zcode/shared/kayingcode-protocol-v4";
import {
  buildConversationStatusPanelModel,
  isDismissedBackgroundWorkResult,
  isDismissedSubagentResult,
  isDismissedWorkflowRunResult,
} from "../src/v4/conversationStatusPanelModel.js";

const dismissed: ActivitySummaryDismissed = {
  at: 2_000,
  workIds: ["bash", "run-1"],
  subagentIds: ["child"],
  workflowRunIds: ["run-1"],
};

const runningWork: BackgroundWorkSummary = {
  workId: "bash",
  kind: "bash",
  title: "npm test",
  status: "running",
  startedAt: 1_000,
  anchorRowId: null,
};

function runningSubagent(childSessionId: string): RunningSubagentSummary {
  return {
    childSessionId,
    subagentType: "Explore",
    title: "Inspect project",
    status: "running",
    startedAt: 1_000,
  };
}

const pendingRun: WorkflowRunState = {
  runId: "run-1",
  status: "running",
  usage: { spentTokens: 0, nodesUsed: 0 },
  actors: [],
  nodes: [],
  lastEventSequence: 1,
};

describe("activitySummaryDismissed 判定", () => {
  it("subagent 只收起水位之前结束的结果", () => {
    expect(isDismissedSubagentResult(dismissed, { childSessionId: "child", endedAt: 2_000 })).toBe(
      true,
    );
    expect(isDismissedSubagentResult(dismissed, { childSessionId: "child", endedAt: 2_001 })).toBe(
      false,
    );
    expect(
      isDismissedSubagentResult(dismissed, { childSessionId: "child", endedAt: undefined }),
    ).toBe(true);
    expect(isDismissedSubagentResult(dismissed, { childSessionId: "other", endedAt: 1 })).toBe(
      false,
    );
    expect(isDismissedSubagentResult(undefined, { childSessionId: "child" })).toBe(false);
  });

  it("work 与 workflow run 按稳定身份收起", () => {
    expect(isDismissedBackgroundWorkResult(dismissed, "bash")).toBe(true);
    expect(isDismissedBackgroundWorkResult(dismissed, "npm-install")).toBe(false);
    expect(isDismissedBackgroundWorkResult(undefined, "bash")).toBe(false);
    expect(isDismissedWorkflowRunResult(dismissed, "run-1")).toBe(true);
    expect(isDismissedWorkflowRunResult(dismissed, "run-2")).toBe(false);
    expect(isDismissedWorkflowRunResult(undefined, "run-1")).toBe(false);
  });
});

describe("buildConversationStatusPanelModel 的活动收起", () => {
  it("运行中的同一身份不受旧收起标记影响", () => {
    const model = buildConversationStatusPanelModel({
      backgroundWorks: [runningWork],
      runningSubagents: [runningSubagent("child")],
      workflowRuns: [pendingRun],
      activitySummaryDismissed: dismissed,
    });
    expect(model.runningBashWorks.map((work) => work.workId)).toEqual(["bash"]);
    expect(model.runningSubagentWorks.map((agent) => agent.childSessionId)).toEqual(["child"]);
    expect(model.runningWorkflowRuns.map((run) => run.runId)).toEqual(["run-1"]);
    expect(model.hasContent).toBe(true);
  });

  it("已收起的终态输入不参与活动模型", () => {
    const endedWork: BackgroundWorkSummary = {
      ...runningWork,
      status: "resultPending",
      endedAt: 1_500,
    };
    const endedRun: WorkflowRunState = { ...pendingRun, status: "completed" };
    const model = buildConversationStatusPanelModel({
      backgroundWorks: [endedWork],
      workflowRuns: [endedRun],
      activitySummaryDismissed: dismissed,
    });
    expect(model.runningBashWorks).toEqual([]);
    expect(model.runningWorkflowRuns).toEqual([]);
    expect(model.hasContent).toBe(false);
  });
});
