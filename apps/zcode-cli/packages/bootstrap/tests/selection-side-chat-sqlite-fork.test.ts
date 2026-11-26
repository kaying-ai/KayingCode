import { describe, expect, it } from "vitest";
import type { MessageId, MessageWithParts, SessionId } from "@zcode/contracts";
import { createSqliteSessionStore } from "../../adapters/src/storage/session-store/sqlite-session-store.js";
import { createSelectionSideConversation } from "../../core/src/runtime/methods/session-fork.js";
import { ProductProjection } from "../src/kayingcode-protocol-v4/index.js";
import {
  eventsCoverTranscript,
  synthesizeEventsFromMessages,
} from "../src/kayingcode-protocol-v4/transcript-hydration.js";

const parentId = "fork-sql-parent" as SessionId;
const ids = ["user-first", "assistant-first", "user-next", "assistant-active"] as MessageId[];
const worktreeCreation = {
  path: "/workspace-worktrees/a1b2/repo",
  sha: "0123456789abcdef0123456789abcdef01234567",
  ref: null,
  output: "Preparing worktree (detached HEAD 0123456)\n",
};

function history(): MessageWithParts[] {
  return ids.map((id, index) => {
    const user = index % 2 === 0;
    const time = { created: index + 1, completed: index + 2 };
    return {
      info: {
        id,
        sessionID: parentId,
        role: user ? "user" : "assistant",
        time,
        agent: "build",
        tools: {},
        ...(user
          ? { modelSelection: { providerId: "glm", modelId: "glm-4-air" } }
          : {
              parentID: ids[index - 1],
              providerId: "glm",
              modelId: "glm-4-air",
              cost: 0,
              tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
            }),
        anchor: {
          origin: user ? "realUser" : "assistant",
          turnId: `turn-${Math.floor(index / 2)}`,
          productTurnId: `product-${Math.floor(index / 2)}`,
        },
      },
      parts: [
        {
          id: `text-${index}`,
          messageID: id,
          sessionID: parentId,
          type: "text",
          text: `body ${id}: ${"large output ".repeat(500)}`,
        },
      ],
    } as MessageWithParts;
  });
}

/** 与 `persistAssistantTimelinePartForSession` 写入的时间线标记同形：kind=timeline_event、UI 可见。 */
function timelineMessage(
  id: string,
  created: number,
  parts: Record<string, unknown>[],
): MessageWithParts {
  return {
    info: {
      id,
      sessionID: parentId,
      role: "assistant",
      time: { created, completed: created },
      parentID: id,
      providerId: "glm",
      modelId: "glm-4-air",
      agent: "build",
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      finish: "completed",
      semantics: {
        origin: "system",
        kind: "timeline_event",
        uiVisibility: "visible",
        providerVisibility: "hidden",
        transcriptVisibility: "visible",
      },
    },
    parts: parts.map((part, index) => ({
      id: `${id}-part-${index}`,
      sessionID: parentId,
      messageID: id,
      type: "timeline",
      status: "completed",
      ...part,
    })),
  } as MessageWithParts;
}

describe("selection side chat SQLite fork integration", () => {
  // 适配说明：上游本文件还包含三条 SQLite 侧「forkFromSource 不把正文读进 JS」的用例。
  // 该数据库内 fork 重构（contracts ForkFromSourceInput / adapter commitForkFromSource）与
  // 本次 worktree cwd 波次无关，产品尚未采纳；这里只保留与 worktree 时间线隐藏相关的验收。
  // SSC19：worktree 任务首条「已创建 worktree」和 fork 到新 worktree 的分叉标记都是 timeline_event。
  // 复制进辅助对话时只改可见性、保留 kind；冷恢复必须按继承历史隐藏，不能显示在辅助对话里。
  it("keeps inherited timeline markers out of the child timeline", async () => {
    const store = await createSqliteSessionStore({ dbPath: ":memory:" });
    try {
      await store.createSession({
        id: parentId,
        projectID: "project" as never,
        slug: "parent",
        directory: worktreeCreation.path,
        title: "parent",
        version: "test",
      });
      const messages = [
        timelineMessage("worktree-created", 0, [
          { timelineType: "worktree_creation", display: "worklog", worktreeCreation },
        ]),
        ...history(),
        timelineMessage("fork-notice", 9, [
          {
            timelineType: "session_fork",
            display: "separator",
            anchorMessageId: ids[3],
            anchorTurnId: "turn-1",
            parentSessionId: "grandparent",
            targetMessageId: "grandparent-message",
            restoredFileCount: 0,
          },
          {
            timelineType: "worktree_creation",
            display: "worklog",
            anchorMessageId: ids[3],
            anchorTurnId: "turn-1",
            worktreeCreation,
          },
        ]),
      ];
      for (const message of messages) {
        await store.saveMessage(message.info);
        for (const part of message.parts) await store.savePart(part);
      }
      const runtime = {
        sessionId: parentId,
        sessionStore: store,
        activeTurn: null,
        rootTraceContext: { traceId: "trace-fork-sql-timeline" },
        config: { agentName: "build", mode: "build" },
        getSessionModelSelection: () => ({ providerId: "glm", modelId: "glm-4-air" }),
        workingDirectory: worktreeCreation.path,
        workspaceRoot: worktreeCreation.path,
      };
      const result = await createSelectionSideConversation.call(runtime as never, {
        sourceCommandId: "create-child-timeline",
      });
      // 「已创建 worktree」暂存到首个 TurnStarted 才落位，所以要有辅助对话自己的第一问。
      const questionId = "side-question" as MessageId;
      await store.saveMessage({
        id: questionId,
        sessionID: result.forkedSessionId,
        role: "user",
        time: { created: 20 },
        agent: "build",
        modelSelection: { providerId: "glm", modelId: "glm-4-air" },
      } as MessageWithParts["info"]);
      await store.savePart({
        id: "side-question-text",
        sessionID: result.forkedSessionId,
        messageID: questionId,
        type: "text",
        text: "side question",
      } as MessageWithParts["parts"][number]);
      const child = await store.messages({ sessionID: result.forkedSessionId });
      expect(child[0]!.info).toMatchObject({
        visibility: "model-only",
        semantics: { kind: "timeline_event", uiVisibility: "hidden" },
      });

      const events = synthesizeEventsFromMessages(child, { sessionId: result.forkedSessionId });
      const projection = new ProductProjection(result.forkedSessionId, "epoch");
      for (const event of events) projection.applyEvent(event);
      const rows = projection.getSnapshot().rows.window;
      expect(rows.filter((row) => row.kind === "timelineMarker")).toEqual([]);
      expect(rows.flatMap((row) => (row.kind === "userInput" ? [row.text] : []))).toEqual([
        "side question",
      ]);
      expect(eventsCoverTranscript(events, child)).toBe(true);
    } finally {
      store.close();
    }
  });
});
