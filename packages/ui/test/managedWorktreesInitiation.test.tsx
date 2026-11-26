// @vitest-environment jsdom
// worktree 创建的发起与交接（managed-worktrees/CONTRACT.md §8）。
// SessionPane 的发送/分叉点击由 startWorktreeTask / forkSessionToWorktree 收口，这里用同一组
// 生产函数驱动真实 Provider + Host 服务 double，断言信封形状、幂等与结束事件语义。
import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import {
  ForkDestinationMenu,
  ManagedWorktreeComposerEntry,
  ManagedWorktreeProvider,
  forkSessionToWorktree,
  managedWorktreeTestIds,
  readWorktreeDraftSelection,
  recordWorktreeCreationIntent,
  resetWorktreeCreationLifecycleForTests,
  resetWorktreeDraftSelectionsForTests,
  startWorktreeTask,
  type IManagedWorktreeService,
  type WorktreeCreationStartOutcome,
  type WorktreeFirstInput,
} from "@/managed-worktrees/index.js";
import { useKayingCodeSessionStore } from "@/store/kayingcodeSessionStore.js";
import {
  cleanup,
  clickAsync,
  createService,
  deferred,
  installBaseManagedWorktreeService,
  query,
  render,
  resetManagedWorktreeTestStores,
  rerender,
  settle,
} from "./managedWorktreesHarness.js";

vi.mock("@/i18n/IntlProvider.js", async () => {
  const enUS = (await import("@/i18n/locales/en-US.js")).default;
  const formatMessage = (
    descriptor: { id: string },
    values?: Record<string, string | number>,
  ): string =>
    (enUS[descriptor.id] ?? descriptor.id).replace(/\{(\w+)\}/g, (_match, key: string) =>
      values?.[key] !== undefined ? String(values[key]) : `{${key}}`,
    );
  return {
    useKayingCodeIntl: () => ({
      intl: { formatMessage },
      locale: "en-US",
      localePreference: "en-US",
      setLocalePreference: () => {},
    }),
  };
});

const WORKSPACE = "/repo";

function firstInput(overrides: Partial<WorktreeFirstInput> = {}): WorktreeFirstInput {
  return {
    text: "hello worktree",
    submission: {
      modelSelection: {
        providerId: "glm",
        modelId: "glm-4.6",
        options: { reasoningLevel: "high" },
      },
      mode: "build",
      planEnabled: false,
    },
    configPayload: { config: { followupMode: "queue" } },
    ...overrides,
  };
}

/** 代表 SessionPane 的发送/分叉点击：只调用发起收口，不重复实现分支逻辑。 */
function ActionProbe({ run }: { run: () => Promise<WorktreeCreationStartOutcome> }) {
  const [status, setStatus] = useState("idle");
  return (
    <div>
      <button
        data-testid="action-run"
        onClick={() => {
          void run().then((result) => setStatus(result.status));
        }}
      />
      <span data-testid="action-status">{status}</span>
    </div>
  );
}

beforeEach(() => {
  resetManagedWorktreeTestStores();
  resetWorktreeDraftSelectionsForTests();
  resetWorktreeCreationLifecycleForTests();
});

afterEach(() => {
  cleanup();
  resetManagedWorktreeTestStores();
  resetWorktreeDraftSelectionsForTests();
  resetWorktreeCreationLifecycleForTests();
});

describe("worktree draft selection projection", () => {
  it("keeps the entry disabled and publishes no selection when the Agent lacks worktree cwd", async () => {
    const onChange = vi.fn();
    render(
      <ManagedWorktreeProvider projectId="p1" workspacePath={WORKSPACE}>
        <TooltipProvider>
          <ManagedWorktreeComposerEntry
            projectId="p1"
            currentBranchLabel="main"
            value={undefined}
            onChange={onChange}
            support={{ visible: true, available: false, disabledReason: "unsupported" }}
          />
        </TooltipProvider>
      </ManagedWorktreeProvider>,
    );
    await settle();
    const checkbox = query(managedWorktreeTestIds.toggle)?.querySelector<HTMLElement>(
      '[role="checkbox"]',
    );
    expect(checkbox?.hasAttribute("disabled")).toBe(true);
    await clickAsync(checkbox);
    expect(onChange).not.toHaveBeenCalled();
    expect(readWorktreeDraftSelection(WORKSPACE)).toBeUndefined();
  });

  it("projects the controlled selection for the send path", async () => {
    const entry = (value: string | null | undefined) => (
      <ManagedWorktreeProvider projectId="p1" workspacePath={WORKSPACE}>
        <TooltipProvider>
          <ManagedWorktreeComposerEntry
            projectId="p1"
            currentBranchLabel="main"
            value={value}
            onChange={() => {}}
            support={{ visible: true, available: true, disabledReason: null }}
          />
        </TooltipProvider>
      </ManagedWorktreeProvider>
    );
    render(entry(null));
    await settle();
    expect(readWorktreeDraftSelection(WORKSPACE)).toBeNull();

    rerender(entry("origin/main"));
    await settle();
    expect(readWorktreeDraftSelection(WORKSPACE)).toBe("origin/main");
  });
});

describe("new task in a worktree", () => {
  it("starts exactly one creation with the product createSession envelope", async () => {
    const { service } = createService();
    render(
      <ActionProbe
        run={() =>
          startWorktreeTask({
            service,
            workspacePath: WORKSPACE,
            projectId: "p1",
            ref: "feature/x",
            firstInput: firstInput(),
          })
        }
      />,
    );
    await clickAsync(query("action-run"));
    expect(query("action-status")?.textContent).toBe("started");

    const startNewTask = vi.mocked(service.startNewTask);
    expect(startNewTask).toHaveBeenCalledTimes(1);
    const params = startNewTask.mock.calls[0]![0];
    expect(params).toMatchObject({
      workspacePath: WORKSPACE,
      projectId: "p1",
      ref: "feature/x",
    });
    expect(params.envelope.type).toBe("createSession");
    expect(params.envelope.sessionId).toBeNull();
    expect(params.envelope.commandId).toBeTruthy();
    const payload = params.envelope.payload as {
      workspaceId: string;
      firstInput: unknown;
      config?: unknown;
    };
    expect(payload.workspaceId).toBe(WORKSPACE);
    expect(payload.firstInput).toEqual({
      text: "hello worktree",
      modelSelection: {
        providerId: "glm",
        modelId: "glm-4.6",
        options: { reasoningLevel: "high" },
      },
      mode: "build",
      planEnabled: false,
    });
    expect(payload.config).toEqual({ followupMode: "queue" });
  });

  it("guards double initiation while the first creation is being submitted", async () => {
    const pending = deferred<Awaited<ReturnType<IManagedWorktreeService["startNewTask"]>>>();
    const startNewTask = vi.fn(() => pending.promise);
    const { service } = createService({ startNewTask });
    render(
      <ActionProbe
        run={() =>
          startWorktreeTask({
            service,
            workspacePath: WORKSPACE,
            projectId: "p1",
            ref: null,
            firstInput: firstInput(),
          })
        }
      />,
    );
    await clickAsync(query("action-run"));
    await clickAsync(query("action-run"));
    expect(startNewTask).toHaveBeenCalledTimes(1);

    pending.resolve({ ok: true, creationId: "c-guard" });
    await settle();
    expect(query("action-status")?.textContent).toBe("started");

    // 第一笔落定后发起权释放；下一次点击是新创建，而不是双击重放。
    await clickAsync(query("action-run"));
    expect(startNewTask).toHaveBeenCalledTimes(2);
  });

  it("blocks without a service or draft project", async () => {
    const { service } = createService();
    const run = (overrides: {
      service: IManagedWorktreeService | undefined;
      projectId: string | null;
    }) =>
      startWorktreeTask({
        service: overrides.service,
        workspacePath: WORKSPACE,
        projectId: overrides.projectId,
        ref: null,
        firstInput: firstInput(),
      });
    const noService = await run({ service: undefined, projectId: "p1" });
    expect(noService.status).toBe("unavailable");
    const noProject = await run({ service, projectId: null });
    expect(noProject.status).toBe("unavailable");
    expect(service.startNewTask).not.toHaveBeenCalled();
  });
});

describe("fork into a worktree", () => {
  it("sends a forkAssistant envelope with the product CAS inputs", async () => {
    const { service } = createService();
    render(
      <ActionProbe
        run={() =>
          forkSessionToWorktree({
            service,
            workspacePath: WORKSPACE,
            sessionId: "parent-session",
            target: { rowId: 7, entityId: "assistant-1" },
            baseRevision: 42,
            baseLogEpoch: "epoch-1",
          })
        }
      />,
    );
    await clickAsync(query("action-run"));
    expect(query("action-status")?.textContent).toBe("started");

    const forkToWorktree = vi.mocked(service.forkToWorktree);
    expect(forkToWorktree).toHaveBeenCalledTimes(1);
    const params = forkToWorktree.mock.calls[0]![0];
    expect(params.workspacePath).toBe(WORKSPACE);
    expect(params.envelope.type).toBe("forkAssistant");
    expect(params.envelope.sessionId).toBe("parent-session");
    expect(params.envelope.baseRevision).toBe(42);
    expect(params.envelope.baseLogEpoch).toBe("epoch-1");
    expect(params.envelope.payload).toEqual({
      target: { rowId: 7, entityId: "assistant-1" },
    });
  });

  it("offers both fork destinations and disables the worktree item without support", async () => {
    const onForkHere = vi.fn();
    const onForkToWorktree = vi.fn();
    const menu = (worktreeAvailable: boolean) => (
      <ForkDestinationMenu
        open
        onOpenChange={() => {}}
        anchor={{ x: 12, y: 24 }}
        worktreeAvailable={worktreeAvailable}
        inWorktree={false}
        onForkHere={onForkHere}
        onForkToWorktree={onForkToWorktree}
      />
    );
    render(menu(false));
    await settle();
    const worktreeItem = query(managedWorktreeTestIds.forkToWorktree);
    expect(worktreeItem?.hasAttribute("disabled")).toBe(true);
    expect(worktreeItem?.getAttribute("title")).toContain("doesn't support worktrees");

    rerender(menu(true));
    await settle();
    expect(query(managedWorktreeTestIds.forkToWorktree)?.hasAttribute("disabled")).toBe(false);
    await clickAsync(query(managedWorktreeTestIds.forkToWorktree));
    expect(onForkToWorktree).toHaveBeenCalledTimes(1);
    await clickAsync(query(managedWorktreeTestIds.forkHere));
    expect(onForkHere).toHaveBeenCalledTimes(1);
  });
});

describe("creation settlement", () => {
  function renderProvider(service: IManagedWorktreeService) {
    installBaseManagedWorktreeService(service);
    render(
      <ManagedWorktreeProvider projectId="p1" workspacePath={WORKSPACE}>
        <span data-testid="provider-child" />
      </ManagedWorktreeProvider>,
    );
  }

  it("selects the new session on session-started and leaves the draft to the send boundary", async () => {
    const { service, emitSettlement } = createService();
    recordWorktreeCreationIntent({
      creationId: "c-started",
      kind: "new-task",
      workspacePath: WORKSPACE,
      promptText: "hello worktree",
    });
    renderProvider(service);
    await settle();
    const workspaceState = () =>
      useKayingCodeSessionStore.getState().getWorkspaceState(WORKSPACE);
    expect(workspaceState().activeTaskId).toBeNull();

    await act(async () => {
      emitSettlement({
        creationId: "c-started",
        outcome: "session-started",
        workspacePath: WORKSPACE,
        sessionId: "session-9",
      });
    });
    await settle();
    expect(workspaceState().activeTaskId).toBe("session-9");
    // 正文/附件已在发送 accepted 时由 composer 清空；settlement 不回填、不重复清空。
    expect(workspaceState().composerTextInsertRequest).toBeNull();
    // 结束事件后重新读取 worktree 列表（初始一次 + 结束后一次）。
    expect(vi.mocked(service.listWorktrees).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("restores the first prompt into the draft on dismissed without sending", async () => {
    const { service, emitSettlement } = createService();
    recordWorktreeCreationIntent({
      creationId: "c-dismissed",
      kind: "new-task",
      workspacePath: WORKSPACE,
      promptText: "hello worktree",
    });
    renderProvider(service);
    await settle();

    await act(async () => {
      emitSettlement({
        creationId: "c-dismissed",
        outcome: "dismissed",
        workspacePath: WORKSPACE,
        promptText: "hello worktree",
      });
    });
    await settle();
    const state = useKayingCodeSessionStore.getState().getWorkspaceState(WORKSPACE);
    expect(state.composerTextInsertRequest?.text).toBe("hello worktree");
    expect(state.activeTaskId).toBeNull();
  });

  it("ignores stale settlements this window never started or already consumed", async () => {
    const { service, emitSettlement } = createService();
    recordWorktreeCreationIntent({
      creationId: "c-once",
      kind: "new-task",
      workspacePath: WORKSPACE,
      promptText: "hello worktree",
    });
    renderProvider(service);
    await settle();

    const started = {
      creationId: "c-once",
      outcome: "session-started" as const,
      workspacePath: WORKSPACE,
      sessionId: "session-first",
    };
    await act(async () => {
      emitSettlement(started);
    });
    await settle();
    const state = () => useKayingCodeSessionStore.getState().getWorkspaceState(WORKSPACE);
    expect(state().activeTaskId).toBe("session-first");

    // 重复的结束事件与未知 creationId 都不能再次改写选择或草稿。
    await act(async () => {
      emitSettlement({ ...started, sessionId: "session-late" });
      emitSettlement({
        creationId: "c-unknown",
        outcome: "dismissed",
        workspacePath: WORKSPACE,
        promptText: "late prompt",
      });
    });
    await settle();
    expect(state().activeTaskId).toBe("session-first");
    expect(state().composerTextInsertRequest).toBeNull();
  });
});
