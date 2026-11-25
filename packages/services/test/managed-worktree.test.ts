import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseWorktreeListPorcelain } from "../src/git/managed-worktree/worktreeList.js";
import type { ManagedWorktreeServicePorts } from "../src/managed-worktree-tasks/ports.js";
import {
  WORKTREE_REMOVING_ERROR,
  createWorktreeRemovalGate,
} from "../src/managed-worktree-tasks/removal-gate.js";
import { createWorktreeRemoval } from "../src/managed-worktree-tasks/removal.js";

const SOURCE = "/projects/repo";
const WORKTREE = join("/data", ".kayingcode", "worktrees", "3f2a", "repo");
const PROJECT_ID = "project-1";

function taskRow(taskId: string) {
  return { taskId, workspacePath: SOURCE, title: taskId, archived: false, projectId: PROJECT_ID };
}

function createHarness(
  options: {
    creating?: boolean;
    manageNotFound?: boolean;
    managedSourceRoot?: string;
    tasks?: ReturnType<typeof taskRow>[];
    terminals?: boolean;
    dirty?: boolean | null;
    cli?: { released: string[]; busy: string[] };
    cliThrows?: boolean;
  } = {},
) {
  const remove = vi.fn(async () => ({ ok: true as const }));
  const afterChange = vi.fn(async () => {});
  const releaseSessionsUnder = vi.fn(async () => {
    if (options.cliThrows) throw new Error("cli offline");
    return options.cli ?? { released: [], busy: [] };
  });
  const gate = createWorktreeRemovalGate();
  const ports: ManagedWorktreeServicePorts = {
    isLocalHost: true,
    repository: async () => ({
      readTree: () => ({ projects: [], tasks: [] }),
      resolveSessionDirectories: () => ({
        workspacePath: SOURCE,
        additionalDirectories: [],
        projectId: PROJECT_ID,
      }),
      listTasksByWorktree: () => options.tasks ?? [],
      reserveCreatedTask: () => ({
        workspacePath: SOURCE,
        additionalDirectories: [],
        projectId: PROJECT_ID,
        taskId: "reserved",
      }),
      releaseReservedTask: () => "absent",
    }),
    git: {
      list: async () => ({ sourceRoot: null, worktrees: [] }),
      create: async () => ({ ok: false, error: { code: "git-failed" } }),
      remove,
      prune: async () => {},
      listStartRefs: async () => null,
      isDirty: async () => (options.dirty === undefined ? false : options.dirty),
      resolveManagedWorktree: async () =>
        options.manageNotFound
          ? null
          : { worktreeRoot: WORKTREE, sourceRoot: options.managedSourceRoot ?? SOURCE },
    },
    removalGate: gate,
    runtime: {
      hasTerminalsUnder: async () => options.terminals ?? false,
      releaseSessionsUnder,
    },
    agent: {
      supportsWorktreeCwd: async () => true,
      sendCommand: async () => ({ commandId: "cmd", status: "accepted", revisionAtDecision: 0 }),
      queryCommandResult: async () => "unknown",
    },
    afterChange,
  };
  const removal = createWorktreeRemoval({
    ports,
    requireProject: async (projectId) => ({
      id: projectId,
      roots: [{ rootPath: SOURCE }],
    }),
    isCreatingAt: () => options.creating ?? false,
  });
  return { removal, gate, ports, remove, afterChange, releaseSessionsUnder };
}

describe("worktree removal gate", () => {
  it("holds a lease for the worktree root and all nested paths", () => {
    const gate = createWorktreeRemovalGate();
    expect(gate.isRemoving(WORKTREE)).toBe(false);
    expect(gate.acquire(WORKTREE)).toBe(true);
    expect(gate.acquire(WORKTREE)).toBe(false);
    expect(gate.isRemoving(WORKTREE)).toBe(true);
    expect(gate.isRemoving(join(WORKTREE, "src"))).toBe(true);
    expect(gate.isRemoving(join(WORKTREE, "..", "repo"))).toBe(true);
    expect(gate.isRemoving("/data/other")).toBe(false);
    gate.release(WORKTREE);
    expect(gate.isRemoving(WORKTREE)).toBe(false);
  });

  it("rejects session operations whose cwd is inside or unknown while removing", async () => {
    const gate = createWorktreeRemovalGate();
    gate.acquire(WORKTREE);
    await expect(
      gate.runSessionOperation(
        "s-in",
        async () => join(WORKTREE, "src"),
        async () => "ran",
      ),
    ).rejects.toThrow(WORKTREE_REMOVING_ERROR);
    await expect(
      gate.runSessionOperation(
        "s-unknown",
        async () => null,
        async () => "ran",
      ),
    ).rejects.toThrow(WORKTREE_REMOVING_ERROR);
    await expect(
      gate.runSessionOperation(
        "s-out",
        async () => "/projects/other",
        async () => "ran",
      ),
    ).resolves.toBe("ran");
  });

  it("skips cwd resolution when no lease is held", async () => {
    const gate = createWorktreeRemovalGate();
    const resolveCwd = vi.fn(async () => null);
    await expect(gate.runSessionOperation("s1", resolveCwd, async () => "ran")).resolves.toBe(
      "ran",
    );
    expect(resolveCwd).not.toHaveBeenCalled();
  });

  it("settle waits for in-flight session operations", async () => {
    const gate = createWorktreeRemovalGate();
    let finish!: () => void;
    const operation = gate.runSessionOperation(
      "s1",
      async () => null,
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    let settled = false;
    const settledPromise = gate.settle().then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    await operation;
    await settledPromise;
    expect(settled).toBe(true);
  });
});

describe("removeWorktree", () => {
  it("rejects paths that are not managed worktrees of the project", async () => {
    const missing = createHarness({ manageNotFound: true });
    await expect(
      missing.removal.removeWorktree({ projectId: PROJECT_ID, path: WORKTREE }),
    ).resolves.toEqual({ ok: false, error: { code: "not-managed" } });
    expect(missing.remove).not.toHaveBeenCalled();

    const foreign = createHarness({ managedSourceRoot: "/elsewhere" });
    await expect(
      foreign.removal.removeWorktree({ projectId: PROJECT_ID, path: WORKTREE }),
    ).resolves.toEqual({ ok: false, error: { code: "not-managed" } });
  });

  it("rejects while a creation is in flight as well as a concurrent removal", async () => {
    const creating = createHarness({ creating: true });
    await expect(
      creating.removal.removeWorktree({ projectId: PROJECT_ID, path: WORKTREE }),
    ).resolves.toEqual({ ok: false, error: { code: "worktree-in-use", detail: "creating" } });
    expect(creating.remove).not.toHaveBeenCalled();

    const harness = createHarness();
    harness.gate.acquire(WORKTREE);
    await expect(
      harness.removal.removeWorktree({ projectId: PROJECT_ID, path: WORKTREE }),
    ).resolves.toEqual({ ok: false, error: { code: "worktree-in-use", detail: "removing" } });
    harness.gate.release(WORKTREE);
  });

  it("rejects dirty worktrees before releasing CLI sessions", async () => {
    const harness = createHarness({ dirty: true });
    await expect(
      harness.removal.removeWorktree({ projectId: PROJECT_ID, path: WORKTREE }),
    ).resolves.toEqual({ ok: false, error: { code: "worktree-dirty" } });
    expect(harness.releaseSessionsUnder).not.toHaveBeenCalled();
    expect(harness.remove).not.toHaveBeenCalled();
    // 拒绝后租约必须释放，后续删除仍可取得。
    expect(harness.gate.acquire(WORKTREE)).toBe(true);
    harness.gate.release(WORKTREE);
  });

  it("treats an unreadable git status as a git failure", async () => {
    const harness = createHarness({ dirty: null });
    await expect(
      harness.removal.removeWorktree({ projectId: PROJECT_ID, path: WORKTREE }),
    ).resolves.toEqual({ ok: false, error: { code: "git-failed" } });
  });

  it("rejects terminals and running CLI sessions under the worktree", async () => {
    const terminal = createHarness({ terminals: true });
    await expect(
      terminal.removal.removeWorktree({ projectId: PROJECT_ID, path: WORKTREE }),
    ).resolves.toEqual({ ok: false, error: { code: "worktree-in-use", detail: "terminal" } });

    const busy = createHarness({ cli: { released: [], busy: ["s1"] } });
    await expect(
      busy.removal.removeWorktree({ projectId: PROJECT_ID, path: WORKTREE }),
    ).resolves.toEqual({ ok: false, error: { code: "worktree-in-use", detail: "running" } });
    expect(busy.remove).not.toHaveBeenCalled();
  });

  it("refuses a forced removal that would drop task rows or live CLI sessions", async () => {
    const forcedTasks = createHarness({ tasks: [taskRow("t1")] });
    await expect(
      forcedTasks.removal.removeWorktree({ projectId: PROJECT_ID, path: WORKTREE, force: true }),
    ).resolves.toEqual({ ok: false, error: { code: "worktree-in-use", detail: "tasks" } });

    const forcedSessions = createHarness({ cli: { released: ["s1"], busy: [] } });
    await expect(
      forcedSessions.removal.removeWorktree({ projectId: PROJECT_ID, path: WORKTREE, force: true }),
    ).resolves.toEqual({ ok: false, error: { code: "worktree-in-use", detail: "tasks" } });
    expect(forcedSessions.remove).not.toHaveBeenCalled();
  });

  it("surfaces CLI release failures without deleting the directory", async () => {
    const harness = createHarness({ cliThrows: true });
    const result = await harness.removal.removeWorktree({
      projectId: PROJECT_ID,
      path: WORKTREE,
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.code).toBe("session-close-failed");
    expect(harness.remove).not.toHaveBeenCalled();
  });

  it("removes the worktree after all checks and publishes the change", async () => {
    const harness = createHarness();
    await expect(
      harness.removal.removeWorktree({ projectId: PROJECT_ID, path: WORKTREE }),
    ).resolves.toEqual({ ok: true });
    expect(harness.releaseSessionsUnder).toHaveBeenCalledWith({
      workspacePath: SOURCE,
      directory: WORKTREE,
    });
    expect(harness.remove).toHaveBeenCalledWith({ path: WORKTREE });
    expect(harness.afterChange).toHaveBeenCalledTimes(1);
    expect(harness.gate.isRemoving(WORKTREE)).toBe(false);
  });
});

describe("parseWorktreeListPorcelain", () => {
  it("parses NUL-separated records with branch, detached, prunable and bare markers", () => {
    const output = [
      "worktree /repo",
      "HEAD aaa",
      "branch refs/heads/main",
      "",
      "worktree /repo-wt",
      "HEAD bbb",
      "detached",
      "prunable",
      "",
      "worktree /bare",
      "bare",
      "",
    ].join("\0");
    expect(parseWorktreeListPorcelain(output)).toEqual([
      { path: "/repo", head: "aaa", branchName: "main", prunable: false, bare: false },
      { path: "/repo-wt", head: "bbb", branchName: null, prunable: true, bare: false },
      { path: "/bare", head: null, branchName: null, prunable: false, bare: true },
    ]);
  });
});
