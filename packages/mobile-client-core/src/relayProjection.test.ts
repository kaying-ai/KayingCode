// 最小会话投影测试：snapshot 替换 + 五种 delta 的行为（不校验 wire 装配，那属
// shared 的 assembler 测试面；这里只验证消费侧投影语义）。
import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  ConversationDelta,
  ConversationRow,
  ConversationTopicFrame,
  SessionSummary,
  SessionsIndexTopicFrame,
} from "@zcode/shared/kayingcode-protocol-v4";

import { RelayConversationProjection, RelaySessionsIndexProjection } from "./relayProjection.js";

let nextRowId = 1;
function row(
  kind: "assistantText" | "toolCall" | "userInput",
  extra: Record<string, unknown> = {},
) {
  nextRowId += 1;
  return {
    rowId: nextRowId,
    turnId: "turn-1",
    createdAt: 0,
    createdAtSeq: nextRowId,
    kind,
    ...extra,
  } as unknown as ConversationRow;
}

function deltasFrame(deltas: ConversationDelta[]): ConversationTopicFrame {
  return {
    topic: "conversation/session-1",
    subscriptionId: "sub-1",
    fromSeq: 0,
    toSeq: 1,
    sentAt: 0,
    payload: { kind: "deltas", deltas },
  } as unknown as ConversationTopicFrame;
}

test("投影：row.appended 追加、row.upserted 替换或补齐", () => {
  const projection = new RelayConversationProjection();
  const first = row("userInput", { text: "hi", origin: "realUser" });
  const second = row("assistantText", { text: "hel", state: "streaming" });
  projection.applyFrame(
    deltasFrame([
      { op: "row.appended", row: first },
      { op: "row.appended", row: second },
    ]),
  );
  assert.equal(projection.rows.length, 2);
  assert.equal(projection.totalCount, 2);

  const completed = { ...second, state: "complete" } as unknown as ConversationRow;
  projection.applyFrame(deltasFrame([{ op: "row.upserted", row: completed }]));
  assert.equal((projection.rows[1] as unknown as { state?: string })?.state, "complete");
  assert.equal(projection.rows.length, 2);
});

test("投影：row.removed 按 fromRowId 截断", () => {
  const projection = new RelayConversationProjection();
  const rows = [row("userInput"), row("assistantText"), row("assistantText")];
  projection.applyFrame(deltasFrame(rows.map((r) => ({ op: "row.appended", row: r }))));
  const keepFrom = rows[1]!.rowId;
  projection.applyFrame(deltasFrame([{ op: "row.removed", fromRowId: keepFrom }]));
  assert.equal(projection.rows.length, 1);
  assert.equal(projection.rows[0]?.rowId, rows[0]!.rowId);
});

test("投影：row.delta 流式追加 text / inputText / output.text", () => {
  const projection = new RelayConversationProjection();
  const textRow = row("assistantText", { text: "", state: "streaming" });
  const toolRow = row("toolCall", {
    toolName: "Bash",
    status: "running",
    inputText: "",
    output: { text: "" },
  });
  projection.applyFrame(
    deltasFrame([
      { op: "row.appended", row: textRow },
      { op: "row.appended", row: toolRow },
    ]),
  );

  projection.applyFrame(
    deltasFrame([
      { op: "row.delta", rowId: textRow.rowId, path: "text", append: "he" },
      { op: "row.delta", rowId: textRow.rowId, path: "text", append: "llo" },
      { op: "row.delta", rowId: toolRow.rowId, path: "inputText", append: "ls -l" },
      { op: "row.delta", rowId: toolRow.rowId, path: "output.text", append: "total 4" },
    ]),
  );

  const [streamed, tool] = projection.rows as Array<{
    text: string;
    inputText?: string;
    output?: { text: string };
  }>;
  assert.equal(streamed?.text, "hello");
  assert.equal(tool?.inputText, "ls -l");
  assert.equal(tool?.output?.text, "total 4");
});

test("投影：state.updated 应用 control / pendingInteractions 补丁", () => {
  const projection = new RelayConversationProjection();
  projection.applyFrame(
    deltasFrame([
      {
        op: "state.updated",
        patch: {
          control: {
            phase: "running",
            canStop: true,
            stopState: "stoppable",
            lastError: null,
          },
          pendingInteractions: [{ interactionId: "i1" }],
        },
      } as unknown as ConversationDelta,
    ]),
  );
  assert.equal(projection.phase, "running");
  assert.equal(projection.canStop, true);
  assert.equal(projection.pendingInteractionCount, 1);
});

test("投影：snapshot 全量替换 rows 与控制状态", () => {
  const projection = new RelayConversationProjection();
  projection.applyFrame({
    topic: "conversation/session-1",
    subscriptionId: "sub-1",
    fromSeq: 0,
    toSeq: 1,
    sentAt: 0,
    payload: {
      kind: "snapshot",
      snapshot: {
        sessionId: "session-1",
        rows: { window: [row("userInput")], totalCount: 7, firstRowId: 1 },
        control: { phase: "idle", canStop: false },
        pendingInteractions: [],
      },
    },
  } as unknown as ConversationTopicFrame);

  assert.equal(projection.rows.length, 1);
  assert.equal(projection.totalCount, 7);
  assert.equal(projection.phase, "idle");
  // 快照截断（totalCount > window）时判定还有更早历史（MOB-C-005）。
  assert.equal(projection.olderHasMore, true);
});

test("投影：pendingInteractions 保存全集供作答（MOB-C-006）", () => {
  const projection = new RelayConversationProjection();
  const interaction = {
    interactionId: "i1",
    kind: "permission",
    anchorRowId: null,
    createdAt: 0,
    payload: { kind: "permission", toolName: "Bash", summary: "ls", options: [] },
  };
  projection.applyFrame(
    deltasFrame([
      {
        op: "state.updated",
        patch: { pendingInteractions: [interaction] },
      },
    ] as unknown as ConversationDelta[]),
  );
  assert.equal(projection.pendingInteractions.length, 1);
  assert.equal(projection.pendingInteractions[0]?.interactionId, "i1");
  // 键级整体替换：下一次 patch 直接换数组引用，不深合并（与 statePatch 语义一致）。
  projection.applyFrame(deltasFrame([{ op: "state.updated", patch: { pendingInteractions: [] } }]));
  assert.equal(projection.pendingInteractions.length, 0);
  assert.equal(projection.pendingInteractionCount, 0);
});

test("投影：prependRows 前插更早历史并去重（MOB-C-005）", () => {
  const projection = new RelayConversationProjection();
  const later = [row("assistantText"), row("assistantText")];
  projection.applyFrame(deltasFrame(later.map((r) => ({ op: "row.appended", row: r }))));
  const earlier = [row("userInput"), row("assistantText")];
  projection.prependRows(earlier);
  assert.equal(projection.rows.length, 4);
  assert.deepEqual(
    projection.rows.map((r) => r.rowId),
    [...earlier, ...later].map((r) => r.rowId),
  );
  // 重叠批次按 rowId 去重，不产生重复行。
  projection.prependRows([earlier[1]!, row("userInput")]);
  assert.equal(projection.rows.length, 5);
  // 空批次不改动引用。
  const before = projection.rows;
  projection.prependRows([]);
  assert.equal(projection.rows, before);
});

// ── 任务列表投影（v4 sessions-index）──

function summary(sessionId: string, extra: Record<string, unknown> = {}) {
  return {
    sessionId,
    workspaceId: "ws",
    title: `任务 ${sessionId}`,
    phase: "idle",
    sessionEnded: false,
    hasBackgroundWork: false,
    lastActivityAt: 1000,
    createdAt: 1000,
    ...extra,
  } as unknown as SessionSummary;
}

function indexFrame(payload: SessionsIndexTopicFrame["payload"]): SessionsIndexTopicFrame {
  return {
    topic: "sessions-index/ws",
    subscriptionId: "sub-idx",
    fromSeq: 0,
    toSeq: 1,
    sentAt: 0,
    payload,
  } as unknown as SessionsIndexTopicFrame;
}

test("任务列表投影：snapshot 全量替换 + upserted/removed", () => {
  const projection = new RelaySessionsIndexProjection();
  projection.applyFrame(
    indexFrame({
      kind: "snapshot",
      snapshot: {
        protocolVersion: 1,
        workspaceId: "ws",
        logEpoch: "e1",
        sessions: [summary("s1"), summary("s2")],
      },
    } as never),
  );
  assert.equal(projection.sessions.length, 2);

  projection.applyFrame(
    indexFrame({
      kind: "deltas",
      deltas: [{ op: "session.upserted", session: summary("s2", { phase: "running" }) }],
    }),
  );
  assert.equal(projection.sessions.length, 2);
  assert.equal(projection.sessions[1]?.phase, "running");

  projection.applyFrame(
    indexFrame({ kind: "deltas", deltas: [{ op: "session.upserted", session: summary("s3") }] }),
  );
  assert.equal(projection.sessions.length, 3);

  projection.applyFrame(
    indexFrame({ kind: "deltas", deltas: [{ op: "session.removed", sessionId: "s1" }] }),
  );
  assert.deepEqual(
    projection.sessions.map((s) => s.sessionId),
    ["s2", "s3"],
  );
});
