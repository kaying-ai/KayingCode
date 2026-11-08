import { test, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskIndexRepo } from "../src/session/taskIndexRepo.js";
import { createTaskFacts } from "../src/task-facts/index.js";
import { Emitter } from "@zcode/rpc";
import { createKayingCodeTaskIndexSyncer } from "../src/kayingcode-agent/kayingcodeTaskIndexSyncer.js";
import type { IKayingCodeAgentService } from "../src/kayingcode-agent/kayingcodeAgent.js";
import {
  V4_WIRE_PROTOCOL_VERSION,
  sessionsIndexTopic,
  type SessionSummary,
  type SessionsIndexTopicWireCandidate,
} from "@zcode/shared/kayingcode-protocol-v4";
import { setDataBaseDir } from "../src/paths.js";
test("CLI facts materialize a reserved persisted session before the upstream draft promotion barrier", async () => {
  const root = await mkdtemp(join(tmpdir(), "remote-first-send-"));
  setDataBaseDir(root);
  const repo = new TaskIndexRepo(join(root, "tasks-index.sqlite"), 5000, "local");
  try {
    await repo.ensureReady();
    const projects = await repo.getProjectRepository();
    const target = { workspacePath: join(root, "workspace"), taskId: "qa-session" };
    projects.reserveCreatedTask({ task: target, projectId: null });
    expect(projects.readTree().tasks.some((task) => task.taskId === target.taskId)).toBe(false);
    const db = await repo.getOrganizationDatabase();
    db.prepare("UPDATE tasks SET pinned=1,archived=1,unread_at=77 WHERE task_id=?").run(
      target.taskId,
    );
    const facts = createTaskFacts({
      store: repo,
      source: { reconcile: async () => ({ sessions: [] }), execute: async () => {} },
      changed: () => {},
    });
    const summary = {
      sessionId: target.taskId,
      title: "QA first input",
      createdAt: 100,
      lastActivityAt: 110,
      phase: "draft",
      workspaceId: target.workspacePath,
      sessionEnded: false,
      hasBackgroundWork: false,
      titleSource: "default",
    } satisfies SessionSummary;
    await facts.ingest(target, summary);
    const row = projects.readTree().tasks.find((task) => task.taskId === target.taskId)!;
    expect(row).toMatchObject({
      taskId: target.taskId,
      createdAt: 100,
      updatedAt: 110,
      pinned: true,
      archived: true,
      unreadAt: 77,
    });
    const before = db
      .prepare("SELECT cli_created_at,cli_updated_at FROM tasks WHERE task_id=?")
      .get(target.taskId);
    expect(before).toEqual({ cli_created_at: 100, cli_updated_at: 110 });
    await facts.ingest(target, {
      ...summary,
      lastActivityAt: 120,
      phase: "completedSuccess",
      lastOutcome: "completed",
    });
    expect(projects.readTree().tasks.filter((task) => task.taskId === target.taskId)).toHaveLength(
      1,
    );
    expect(projects.readTree().tasks.find((task) => task.taskId === target.taskId)?.status).toBe(
      "completed",
    );
    await facts.ingest(target, { ...summary, title: "stale baseline" });
    expect(await repo.getTaskMeta(target)).toMatchObject({
      title: "QA first input",
      updatedAt: 120,
      status: "completed",
    });
    expect((await repo.listTaskMetas(target))[0]).toMatchObject({
      title: "QA first input",
      updatedAt: 120,
      status: "completed",
    });
  } finally {
    setDataBaseDir(null);
    await rm(root, { recursive: true, force: true });
  }
});

test("sessions-index repairs existing rows and publishes persisted draft-phase sessions after commit", async () => {
  const root = await mkdtemp(join(tmpdir(), "remote-first-send-syncer-"));
  setDataBaseDir(root);
  const repo = new TaskIndexRepo(join(root, "tasks-index.sqlite"), 5000, "local");
  const frames = new Emitter<SessionsIndexTopicWireCandidate>();
  const configFrames = new Emitter<never>();
  const workspace = { workspacePath: join(root, "workspace") };
  const subscribe = vi.fn(async () => ({
    ack: { subscriptionId: "owned", mode: "snapshot", logEpoch: "epoch" },
  }));
  const agent = {
    onDynamicSessionsIndexFrame: () => frames.event,
    onDynamicWorkspaceConfigFrame: () => configFrames.event,
    subscribeSessionsIndexV4: subscribe,
    subscribeWorkspaceConfigV4: async () => ({
      ack: { subscriptionId: "config", mode: "snapshot", logEpoch: "epoch" },
    }),
    unsubscribeSessionsIndexV4: async () => {},
    unsubscribeWorkspaceConfigV4: async () => {},
    listSessions: async () => [],
  } as unknown as IKayingCodeAgentService;
  const syncer = createKayingCodeTaskIndexSyncer({ agentService: agent, taskIndexRepo: repo });
  try {
    await repo.ensureReady();
    const projects = await repo.getProjectRepository();
    const summary: SessionSummary = {
      sessionId: "old-hidden",
      workspaceId: workspace.workspacePath,
      title: "QA restored",
      titleSource: "default",
      createdAt: 100,
      lastActivityAt: 110,
      phase: "draft",
      sessionEnded: false,
      hasBackgroundWork: false,
    };
    // 旧 metadata 行存在仍需补齐 CLI 列，不能使用 insert-if-missing 跳过。
    await repo.seedTaskMetaIfMissing({
      ...workspace,
      taskId: summary.sessionId,
      traceId: "qa",
      title: summary.title,
      createdAt: 100,
      updatedAt: 110,
      provider: "glm",
      mode: "default",
    });
    const notifications: Array<{ reason: string; persisted: boolean }> = [];
    syncer.onDynamicWorkspaceEvent(workspace)((event) => {
      if (event.type === "workspace_task_list_changed")
        notifications.push({
          reason: event.reason,
          persisted: projects.readTree().tasks.some((task) => task.taskId === event.taskId),
        });
    });
    syncer.ensureWorkspaceSubscription(workspace);
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
    const send = (seq: number, payload: unknown, subscriptionId = "owned") =>
      frames.fire({
        wireVersion: V4_WIRE_PROTOCOL_VERSION,
        kind: "complete",
        deliveryKind: seq === 1 ? "initial" : "online",
        logicalFrameId: `frame-${seq}-${subscriptionId}`,
        logicalFrameOrdinal: seq,
        topic: sessionsIndexTopic(workspace.workspacePath),
        subscriptionId,
        frame: {
          topic: sessionsIndexTopic(workspace.workspacePath),
          subscriptionId,
          fromSeq: seq - 1,
          toSeq: seq,
          sentAt: 110 + seq,
          payload,
        },
      } as SessionsIndexTopicWireCandidate);
    send(1, {
      kind: "snapshot",
      snapshot: {
        protocolVersion: 1,
        workspaceId: workspace.workspacePath,
        logEpoch: "epoch",
        sessions: [summary],
      },
    });
    await vi.waitFor(() =>
      expect(projects.readTree().tasks.map((task) => task.taskId)).toContain("old-hidden"),
    );
    expect(notifications).toHaveLength(0);
    const fresh = { ...summary, sessionId: "new-draft" };
    projects.reserveCreatedTask({
      task: { ...workspace, taskId: fresh.sessionId },
      projectId: null,
    });
    send(2, { kind: "deltas", deltas: [{ op: "session.upserted", session: fresh }] }, "stale");
    expect(projects.readTree().tasks.map((task) => task.taskId)).not.toContain("new-draft");
    send(2, { kind: "deltas", deltas: [{ op: "session.upserted", session: fresh }] });
    await vi.waitFor(() =>
      expect(notifications).toContainEqual({ reason: "task_created", persisted: true }),
    );
    send(3, { kind: "deltas", deltas: [{ op: "session.removed", sessionId: fresh.sessionId }] });
    await vi.waitFor(() =>
      expect(projects.readTree().tasks.map((task) => task.taskId)).not.toContain("new-draft"),
    );
  } finally {
    syncer.disposeAll();
    frames.dispose();
    configFrames.dispose();
    setDataBaseDir(null);
    await rm(root, { recursive: true, force: true });
  }
});
