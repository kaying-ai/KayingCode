// 会话活动摘要收起边界（docs/ui/chat-summary-panel.md §8）：
// CLI 权威投影在**真实用户输入被接纳**时记录上一批已结束身份，客户端据此收起旧结束明细；
// 同一 work / child / runId 重新运行时必须移除收起标记，否则新一轮结果会被历史边界永久隐藏。
//
// 这里钉住三件事：
// 1. 只有 realUser 输入（不是 backgroundResult / 系统续跑）推进收起水位；
// 2. 只收「已结束」身份，运行中的活动与发送失败都不改变水位；
// 3. 冷回放（hydration）与实时投影得到同一份 activitySummaryDismissed。
import { describe, expect, it } from "vitest";
import {
  SessionEventType,
  type SessionEvent,
  type SessionEventType as SessionEventTypeUnion,
} from "@zcode/contracts";
import { ProductProjection, deltaBumpsRevision } from "../src/kayingcode-protocol-v4/index.js";

const BASE_TIMESTAMP_MS = 1_700_000_000_000;

class EventLog {
  private sequence = 0;
  readonly events: SessionEvent[] = [];

  push(projection: ProductProjection, type: SessionEventTypeUnion, payload: unknown): void {
    this.sequence += 1;
    const event = {
      eventId: `activity-${this.sequence}`,
      sessionId: "session",
      turnId: `turn-${this.sequence}`,
      traceId: "trace",
      timestamp: new Date(BASE_TIMESTAMP_MS + this.sequence),
      sequenceNumber: this.sequence,
      type,
      payload,
    } as SessionEvent;
    this.events.push(event);
    projection.applyEvent(event);
  }

  replay(seed?: (projection: ProductProjection) => void): ProductProjection {
    const cold = new ProductProjection("session", "epoch");
    cold.beginHydrationReplay();
    for (const event of this.events) cold.applyHydrationEvent(event);
    cold.completeHydrationReplay();
    seed?.(cold);
    return cold;
  }
}

describe("activitySummaryDismissed 投影", () => {
  it("收起水位是 revision-bearing 状态键", () => {
    expect(
      deltaBumpsRevision({
        op: "state.updated",
        patch: {
          activitySummaryDismissed: {
            at: BASE_TIMESTAMP_MS,
            workIds: [],
            subagentIds: [],
            workflowRunIds: [],
          },
        },
      }),
    ).toBe(true);
  });

  it("只有真实用户输入接纳才收起已结束的后台工作", () => {
    const projection = new ProductProjection("session", "epoch");
    const log = new EventLog();
    const send = (type: SessionEventTypeUnion, payload: unknown) =>
      log.push(projection, type, payload);

    send(SessionEventType.SessionCreated, { mode: "build", contextWindow: 200000 });
    send(SessionEventType.BackgroundTaskStarted, {
      taskId: "bash",
      taskKind: "bash",
      command: "echo test",
      status: "running",
    });
    send(SessionEventType.TurnStarted, { turnNumber: 1, input: "while running", messageId: "u1" });
    // 运行中的 work 不属于上一批结束结果。
    expect(projection.getSnapshot().activitySummaryDismissed?.workIds).toEqual([]);

    send(SessionEventType.BackgroundTaskCompleted, {
      taskId: "bash",
      taskKind: "bash",
      status: "completed",
    });
    expect(projection.getSnapshot().backgroundWorks[0]?.status).toBe("resultPending");
    expect(projection.getSnapshot().activitySummaryDismissed?.workIds).toEqual([]);

    const beforeFailure = projection.getSnapshot().activitySummaryDismissed;
    send(SessionEventType.TurnError, { error: { message: "send failed" } });
    expect(projection.getSnapshot().activitySummaryDismissed).toEqual(beforeFailure);

    // 系统来源的输入不是「真实用户消息」，不推进收起水位。
    send(SessionEventType.TurnStarted, {
      turnNumber: 2,
      input: "background result",
      messageId: "u2",
      inputSource: "background_task",
    });
    expect(projection.getSnapshot().activitySummaryDismissed).toEqual(beforeFailure);

    send(SessionEventType.BackgroundTaskStarted, {
      taskId: "still-running",
      taskKind: "bash",
      command: "wait",
      status: "running",
    });
    send(SessionEventType.TurnStarted, { turnNumber: 3, input: "next", messageId: "u3" });
    expect(projection.getSnapshot().activitySummaryDismissed).toEqual({
      at: BASE_TIMESTAMP_MS + 8,
      workIds: ["bash"],
      subagentIds: [],
      workflowRunIds: [],
    });
    expect(log.replay().getSnapshot().activitySummaryDismissed).toEqual(
      projection.getSnapshot().activitySummaryDismissed,
    );
  });

  it("同一 workId 重新运行时移除收起标记", () => {
    const projection = new ProductProjection("session", "epoch");
    const log = new EventLog();
    const send = (type: SessionEventTypeUnion, payload: unknown) =>
      log.push(projection, type, payload);

    send(SessionEventType.BackgroundTaskStarted, {
      taskId: "bash",
      taskKind: "bash",
      command: "echo test",
      status: "running",
    });
    send(SessionEventType.BackgroundTaskCompleted, {
      taskId: "bash",
      taskKind: "bash",
      status: "completed",
    });
    send(SessionEventType.TurnStarted, { turnNumber: 1, input: "next", messageId: "u1" });
    expect(projection.getSnapshot().activitySummaryDismissed?.workIds).toEqual(["bash"]);

    send(SessionEventType.BackgroundTaskStarted, {
      taskId: "bash",
      taskKind: "bash",
      command: "echo again",
      status: "running",
    });
    expect(projection.getSnapshot().activitySummaryDismissed).toEqual({
      at: BASE_TIMESTAMP_MS + 3,
      workIds: [],
      subagentIds: [],
      workflowRunIds: [],
    });
    expect(log.replay().getSnapshot().activitySummaryDismissed).toEqual(
      projection.getSnapshot().activitySummaryDismissed,
    );
  });

  it("已结束 subagent 在输入接纳后收起，恢复运行时移除", () => {
    const projection = new ProductProjection("session", "epoch");
    const log = new EventLog();
    const send = (type: SessionEventTypeUnion, payload: unknown) =>
      log.push(projection, type, payload);

    send(SessionEventType.SubagentSpawned, {
      agentId: "agent",
      childSessionId: "child",
      agentType: "Explore",
      description: "Inspect project",
    });
    send(SessionEventType.TurnStarted, { turnNumber: 1, input: "while running", messageId: "u1" });
    // 运行中的 child 不能被收起。
    expect(projection.getSnapshot().activitySummaryDismissed?.subagentIds).toEqual([]);

    send(SessionEventType.SubagentStopped, {
      agentId: "agent",
      childSessionId: "child",
      status: "success",
      summaryText: "Actual result",
    });
    send(SessionEventType.TurnStarted, { turnNumber: 2, input: "next", messageId: "u2" });
    expect(projection.getSnapshot().activitySummaryDismissed?.subagentIds).toEqual(["child"]);
    expect(projection.getSnapshot().activitySummaryDismissed?.at).toBe(BASE_TIMESTAMP_MS + 4);

    // SendMessage resume：同一 child 重新运行，旧的收起边界不再适用。
    send(SessionEventType.SubagentSpawned, {
      agentId: "agent",
      childSessionId: "child",
      agentType: "Explore",
      description: "Resume project",
      background: true,
      resumed: true,
    });
    expect(projection.getSnapshot().subagents?.running.map((item) => item.childSessionId)).toEqual([
      "child",
    ]);
    expect(projection.getSnapshot().activitySummaryDismissed?.subagentIds).toEqual([]);
    expect(log.replay().getSnapshot().activitySummaryDismissed).toEqual(
      projection.getSnapshot().activitySummaryDismissed,
    );
  });

  it("已结束 workflow run 在输入接纳后收起，恢复运行时移除", () => {
    const projection = new ProductProjection("session", "epoch");
    const log = new EventLog();
    const send = (type: SessionEventTypeUnion, payload: unknown) =>
      log.push(projection, type, payload);

    send(SessionEventType.DynamicWorkflowRunProgress, {
      runId: "run-1",
      sequence: 1,
      eventType: "run-started",
      payload: {},
    });
    send(SessionEventType.DynamicWorkflowRunProgress, {
      runId: "run-settled",
      sequence: 1,
      eventType: "run-started",
      payload: {},
    });
    send(SessionEventType.DynamicWorkflowRunProgress, {
      runId: "run-settled",
      sequence: 2,
      eventType: "run-settled",
      payload: { status: "completed" },
    });
    send(SessionEventType.TurnStarted, { turnNumber: 1, input: "next", messageId: "u1" });
    // run-1 仍在运行；只有终态 run 进入上一批结束身份。
    expect(projection.getSnapshot().activitySummaryDismissed?.workflowRunIds).toEqual([
      "run-settled",
    ]);
    expect(projection.getSnapshot().activitySummaryDismissed?.at).toBe(BASE_TIMESTAMP_MS + 4);

    // 同 runId 恢复运行：移除收起标记，新一轮结束结果仍可见。
    send(SessionEventType.DynamicWorkflowRunProgress, {
      runId: "run-settled",
      sequence: 3,
      eventType: "run-started",
      payload: {},
    });
    expect(projection.getSnapshot().workflowRuns?.runs).toContainEqual(
      expect.objectContaining({ runId: "run-settled", status: "running" }),
    );
    expect(projection.getSnapshot().activitySummaryDismissed?.workflowRunIds).toEqual([]);
    expect(log.replay().getSnapshot().activitySummaryDismissed).toEqual(
      projection.getSnapshot().activitySummaryDismissed,
    );
  });
});
