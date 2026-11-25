// 受管 worktree 的后端装配验收：project-storage 放置、Git 仓储创建/归类/回收、创建状态机与
// Hook Trust identity。UI 波次不在本文件覆盖。
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  buildServerRemoteWorkspaceIdentity,
  KAYINGCODE_AGENT_PROVIDER,
  remoteHostIdFromWorkspaceIdentity,
  ServiceChannels,
} from "@zcode/shared";
import type { CommandAck, CommandEnvelope } from "@zcode/shared/zcode-protocol-v4";
import { isSamePath, resolveWorkspaceHookTrustIdentity } from "@zcode/shared/managed-worktree";
import { createGitWorktreeRepo } from "../src/git/managed-worktree/gitWorktreeRepo.js";
import { createGitCommandProvider } from "../src/git/providers/gitCommandProvider.js";
import {
  IManagedWorktreeService,
  createManagedWorktreeService,
  createWorktreeRemovalGate,
  type ManagedWorktreeServicePorts,
} from "../src/managed-worktree-tasks/index.js";
import { getDataBaseDir, setDataBaseDir } from "../src/paths.js";
import { TaskIndexRepo } from "../src/session/taskIndexRepo.js";

const previousDataBaseDir = getDataBaseDir();
const tempRoots: string[] = [];

afterAll(async () => {
  setDataBaseDir(previousDataBaseDir);
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function makeTempRoot(prefix: string): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  tempRoots.push(root);
  return root;
}

function runGit(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.email=test@example.com", "-c", "user.name=Test", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  );
}

async function createGitRepository(root: string): Promise<string> {
  const repo = join(root, "repo");
  await mkdir(repo, { recursive: true });
  runGit(repo, "init", "-b", "main");
  await writeFile(join(repo, "README.md"), "managed worktree fixture\n");
  runGit(repo, "add", "README.md");
  runGit(repo, "commit", "-m", "initial");
  return repo;
}

function createRealGitRepo(dataBaseDir: string) {
  return createGitWorktreeRepo({
    commandProvider: createGitCommandProvider(),
    dataBaseDir: () => dataBaseDir,
    platform: "linux",
  });
}

describe("git worktree repo", () => {
  it("creates under .kayingcode/worktrees, lists managed entries and prunes missing ones", async () => {
    const root = await makeTempRoot("kayingcode-mw-git-");
    const repo = await createGitRepository(root);
    const worktrees = createRealGitRepo(root);

    const created = await worktrees.create({ sourcePath: repo });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.worktree.path).toContain(join(root, ".kayingcode", "worktrees"));
    expect(created.worktree.state).toBe("ok");
    expect(created.worktree.dirty).toBe(false);
    expect(isSamePath(created.cwd, created.worktree.path)).toBe(true);

    // 用户自建 worktree 不属于受管布局，不能出现在列表里。
    const userWorktree = join(root, "user-worktree");
    runGit(repo, "worktree", "add", "--detach", userWorktree, "HEAD");

    const listed = await worktrees.list({ sourcePath: repo });
    expect(listed.sourceRoot && isSamePath(listed.sourceRoot, repo)).toBe(true);
    expect(listed.worktrees).toHaveLength(1);
    expect(isSamePath(listed.worktrees[0]!.path, created.worktree.path)).toBe(true);
    expect(listed.worktrees[0]!.bucket).toBe(created.worktree.bucket);

    const resolved = await worktrees.resolveManagedWorktree(created.worktree.path);
    expect(resolved && isSamePath(resolved.sourceRoot, repo)).toBe(true);
    expect(await worktrees.resolveManagedWorktree(userWorktree)).toBeNull();

    // 目录被手动删除 → 归类为 missing，仍保留登记；prune 后登记消失。
    await rm(created.worktree.path, { recursive: true, force: true });
    const missing = await worktrees.list({ sourcePath: repo });
    expect(missing.worktrees).toHaveLength(1);
    expect(missing.worktrees[0]!.state).toBe("missing");
    await worktrees.prune({ sourcePath: repo });
    expect((await worktrees.list({ sourcePath: repo })).worktrees).toEqual([]);
  });

  it("classifies dirty worktrees and refuses non-managed removals", async () => {
    const root = await makeTempRoot("kayingcode-mw-dirty-");
    const repo = await createGitRepository(root);
    const worktrees = createRealGitRepo(root);

    const created = await worktrees.create({ sourcePath: repo });
    if (!created.ok) throw new Error("worktree create failed");
    await writeFile(join(created.worktree.path, "dirty.txt"), "x");

    expect(await worktrees.isDirty(created.worktree.path)).toBe(true);
    await expect(worktrees.remove({ path: created.worktree.path })).resolves.toEqual({
      ok: false,
      error: { code: "worktree-dirty" },
    });
    await expect(worktrees.remove({ path: repo })).resolves.toEqual({
      ok: false,
      error: { code: "not-managed" },
    });
    await expect(worktrees.remove({ path: created.worktree.path, force: true })).resolves.toEqual({
      ok: true,
    });
    expect((await worktrees.list({ sourcePath: repo })).worktrees).toEqual([]);
  });
});

describe("project-storage worktree placement", () => {
  it("persists cwd/worktree_root once and lists tasks by exact worktree root", async () => {
    const root = await makeTempRoot("kayingcode-mw-store-");
    setDataBaseDir(root);
    const taskIndex = new TaskIndexRepo(join(root, "tasks-index.sqlite"), 5_000, "local");
    try {
      await taskIndex.ensureReady();
      const repository = await taskIndex.getProjectRepository();
      const projectRoot = join(root, "project");
      const project = repository.saveProject({ roots: [projectRoot] });
      const worktreeRoot = join(root, ".kayingcode", "worktrees", "3f2a", "project");
      const cwd = join(worktreeRoot, "packages", "app");
      const task = { workspacePath: projectRoot, taskId: "sess_wt" };

      const reserved = repository.reserveCreatedTask({
        task,
        projectId: project.id,
        cwd,
        worktreeRoot,
        additionalDirectories: [worktreeRoot],
      });
      expect(reserved).toMatchObject({ workspacePath: projectRoot, cwd, taskId: "sess_wt" });

      const directories = repository.resolveSessionDirectories(task);
      expect(directories).toMatchObject({
        workspacePath: projectRoot,
        cwd,
        additionalDirectories: [worktreeRoot],
        projectId: project.id,
      });
      expect(repository.readTaskCwd(task)).toBe(cwd);
      expect(repository.listTasksByWorktree({ worktreeRoot })).toEqual([
        {
          taskId: "sess_wt",
          workspacePath: projectRoot,
          projectId: project.id,
          title: "",
          archived: false,
        },
      ]);
      expect(repository.listTasksByWorktree({ worktreeRoot: cwd })).toEqual([]);

      // 无 CLI 事实的预留行不进入 readTree；有事实后按 workspace/cwd/worktreeRoot 投影。
      repository.reserveCreatedTask({
        task: { workspacePath: projectRoot, taskId: "sess_tree" },
        projectId: project.id,
        cwd,
        worktreeRoot,
      });
      (await taskIndex.getOrganizationDatabase())
        .prepare("UPDATE tasks SET cli_created_at=1,cli_updated_at=1,provider=? WHERE task_id=?")
        .run(KAYINGCODE_AGENT_PROVIDER, "sess_tree");
      const treeTask = repository.readTree().tasks.find((entry) => entry.taskId === "sess_tree");
      expect(treeTask).toMatchObject({ workspacePath: projectRoot, cwd, worktreeRoot });

      // releaseReservedTask 的三种结果必须分开。
      expect(repository.releaseReservedTask({ task })).toBe("released");
      expect(repository.releaseReservedTask({ task })).toBe("absent");

      repository.reserveCreatedTask({ task: { ...task, taskId: "sess_kept" }, projectId: project.id });
      (await taskIndex.getOrganizationDatabase())
        .prepare("UPDATE tasks SET cli_created_at=1 WHERE task_id=?")
        .run("sess_kept");
      expect(
        repository.releaseReservedTask({ task: { ...task, taskId: "sess_kept" } }),
      ).toBe("kept");
      expect(repository.readTaskCwd({ ...task, taskId: "sess_kept" })).toBe(projectRoot);
    } finally {
      taskIndex.close();
    }
  });

  it("rejects incomplete or cross-identity worktree placement", async () => {
    const root = await makeTempRoot("kayingcode-mw-invalid-");
    setDataBaseDir(root);
    const taskIndex = new TaskIndexRepo(join(root, "tasks-index.sqlite"), 5_000, "local");
    try {
      await taskIndex.ensureReady();
      const repository = await taskIndex.getProjectRepository();
      const projectRoot = join(root, "project");
      const project = repository.saveProject({ roots: [projectRoot] });
      const worktreeRoot = join(root, ".kayingcode", "worktrees", "aa11", "project");
      const base = { task: { workspacePath: projectRoot, taskId: "sess_bad" }, projectId: project.id };

      expect(() => repository.reserveCreatedTask({ ...base, cwd: worktreeRoot })).toThrow(
        "project.worktree-placement-incomplete",
      );
      expect(() =>
        repository.reserveCreatedTask({
          ...base,
          projectId: null,
          cwd: worktreeRoot,
          worktreeRoot,
        }),
      ).toThrow("project.worktree-requires-project");
      expect(() =>
        repository.reserveCreatedTask({
          ...base,
          cwd: join(root, "outside"),
          worktreeRoot,
        }),
      ).toThrow("project.worktree-cwd-outside-root");
      expect(() =>
        repository.reserveCreatedTask({
          ...base,
          task: { ...base.task, workspaceIdentity: "remote:server:srv:/remote" },
          cwd: worktreeRoot,
          worktreeRoot,
        }),
      ).toThrow("project.worktree-local-only");
    } finally {
      taskIndex.close();
    }
  });

  it("inherits the parent worktree placement for same-directory forks", async () => {
    const root = await makeTempRoot("kayingcode-mw-fork-");
    setDataBaseDir(root);
    const taskIndex = new TaskIndexRepo(join(root, "tasks-index.sqlite"), 5_000, "local");
    try {
      await taskIndex.ensureReady();
      const repository = await taskIndex.getProjectRepository();
      const projectRoot = join(root, "project");
      const project = repository.saveProject({ roots: [projectRoot] });
      const worktreeRoot = join(root, ".kayingcode", "worktrees", "bb22", "project");
      const cwd = join(worktreeRoot, "app");
      repository.reserveCreatedTask({
        task: { workspacePath: projectRoot, taskId: "sess_parent" },
        projectId: project.id,
        cwd,
        worktreeRoot,
        additionalDirectories: [join(worktreeRoot, "lib")],
      });

      const child = { workspacePath: projectRoot, taskId: "sess_child" };
      repository.reserveCreatedTask({ task: child, parentTaskId: "sess_parent" });

      expect(repository.readTaskCwd(child)).toBe(cwd);
      expect(repository.resolveSessionDirectories(child)).toMatchObject({
        workspacePath: projectRoot,
        cwd,
        additionalDirectories: [join(worktreeRoot, "lib")],
      });
      expect(repository.listTasksByWorktree({ worktreeRoot }).map((row) => row.taskId).sort()).toEqual(
        ["sess_child", "sess_parent"],
      );
    } finally {
      taskIndex.close();
    }
  });
});

function createProjectTree(projectRoot: string) {
  return {
    projects: [
      {
        id: "project-1",
        hostId: "local",
        name: "repo",
        nameOverridden: false,
        roots: [{ rootPath: projectRoot, position: 0, isPrimary: true }],
        position: 0,
        pinned: false,
        deleted: false,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    tasks: [],
  };
}

function createServiceHarness(projectRoot: string, worktreeRoot: string, cwd: string) {
  const reserveCreatedTask = vi.fn(() => ({
    workspacePath: projectRoot,
    additionalDirectories: [] as string[],
    projectId: "project-1",
    taskId: "sess_wt",
  }));
  const releaseReservedTask = vi.fn(() => "released" as const);
  const remove = vi.fn(async () => ({ ok: true as const }));
  const sendCommand = vi.fn(
    async (): Promise<CommandAck> => ({
      commandId: "cmd-1",
      status: "accepted",
      revisionAtDecision: 0,
    }),
  );
  const queryCommandResult = vi.fn(async (): Promise<CommandAck | "unknown"> => "unknown");
  const ports: ManagedWorktreeServicePorts = {
    isLocalHost: true,
    repository: async () => ({
      readTree: () => createProjectTree(projectRoot),
      resolveSessionDirectories: () => ({
        workspacePath: projectRoot,
        additionalDirectories: [],
        projectId: "project-1",
      }),
      listTasksByWorktree: () => [],
      reserveCreatedTask,
      releaseReservedTask,
    }),
    git: {
      list: async () => ({ sourceRoot: projectRoot, worktrees: [] }),
      create: async () => ({
        ok: true,
        worktree: {
          path: worktreeRoot,
          bucket: "3f2a",
          sourceRoot: projectRoot,
          head: "abc",
          branchName: null,
          state: "ok",
          dirty: false,
        },
        cwd,
      }),
      remove,
      prune: async () => {},
      listStartRefs: async () => null,
      isDirty: async () => false,
      resolveManagedWorktree: async () => ({ worktreeRoot, sourceRoot: projectRoot }),
    },
    removalGate: createWorktreeRemovalGate(),
    runtime: {
      hasTerminalsUnder: async () => false,
      releaseSessionsUnder: async () => ({ released: [], busy: [] }),
    },
    agent: {
      supportsWorktreeCwd: async () => true,
      sendCommand,
      queryCommandResult,
    },
  };
  return {
    service: createManagedWorktreeService(ports),
    ports,
    reserveCreatedTask,
    releaseReservedTask,
    remove,
    sendCommand,
    queryCommandResult,
  };
}

function newTaskEnvelope(commandId = "cmd-1"): CommandEnvelope {
  return {
    commandId,
    clientId: "client-1",
    sessionId: null,
    type: "createSession",
    payload: { workspaceId: "/projects/repo", firstInput: { text: "first input" } },
    issuedAt: Date.now(),
  };
}

describe("managed worktree service", () => {
  it("exposes the managed-worktrees channel contract", () => {
    expect(IManagedWorktreeService.channelName).toBe(ServiceChannels.ManagedWorktrees);
    const harness = createServiceHarness(
      "/projects/repo",
      join("/data", ".kayingcode", "worktrees", "3f2a", "repo"),
      join("/data", ".kayingcode", "worktrees", "3f2a", "repo", "app"),
    );
    for (const method of [
      "startNewTask",
      "forkToWorktree",
      "retryCreation",
      "continueWithoutWorktree",
      "dismissCreation",
      "listCreations",
      "listWorktrees",
      "removeWorktree",
      "pruneWorktrees",
      "listStartRefs",
      "isWorktreeAvailable",
      "supportsWorktreeCwd",
    ] as const) {
      expect(typeof harness.service[method]).toBe("function");
    }
    expect(typeof harness.service.onDidChangeCreations).toBe("function");
    expect(typeof harness.service.onDidSettleCreation).toBe("function");
  });

  it("creates a worktree, reserves the placement, then recovers a failed session", async () => {
    const projectRoot = "/projects/repo";
    const worktreeRoot = join("/data", ".kayingcode", "worktrees", "3f2a", "repo");
    const cwd = join(worktreeRoot, "app");
    const harness = createServiceHarness(projectRoot, worktreeRoot, cwd);
    harness.sendCommand.mockResolvedValueOnce({
      commandId: "cmd-1",
      status: "rejected",
      reasonCode: "session-failed",
      revisionAtDecision: 0,
    });

    const settled: unknown[] = [];
    harness.service.onDidSettleCreation((settlement) => settled.push(settlement));
    const started = await harness.service.startNewTask({
      workspacePath: projectRoot,
      projectId: "project-1",
      ref: null,
      envelope: newTaskEnvelope(),
    });
    expect(started.ok).toBe(true);

    await vi.waitFor(async () => {
      const creations = await harness.service.listCreations();
      expect(creations[0]?.phase).toBe("failed");
    });
    expect(harness.reserveCreatedTask).toHaveBeenCalledWith(
      expect.objectContaining({ cwd, worktreeRoot, projectId: "project-1" }),
    );

    // 重试前先向 CLI 确认上一次命令；确认未执行后换新命令再发送。
    await harness.service.retryCreation({
      creationId: (await harness.service.listCreations())[0]!.id,
    });
    await vi.waitFor(() => expect(settled).toHaveLength(1));
    expect(settled[0]).toMatchObject({ outcome: "session-started" });
    await vi.waitFor(async () => {
      expect(await harness.service.listCreations()).toEqual([]);
    });
    expect(harness.queryCommandResult).toHaveBeenCalledTimes(1);
    expect(harness.sendCommand).toHaveBeenCalledTimes(2);
  });

  it("dismisses a failed creation by releasing the reservation and removing the worktree", async () => {
    const projectRoot = "/projects/repo";
    const worktreeRoot = join("/data", ".kayingcode", "worktrees", "3f2a", "repo");
    const cwd = join(worktreeRoot, "app");
    const harness = createServiceHarness(projectRoot, worktreeRoot, cwd);
    harness.sendCommand.mockResolvedValue({
      commandId: "cmd-1",
      status: "rejected",
      reasonCode: "session-failed",
      revisionAtDecision: 0,
    });

    const settled: unknown[] = [];
    harness.service.onDidSettleCreation((settlement) => settled.push(settlement));
    await harness.service.startNewTask({
      workspacePath: projectRoot,
      projectId: "project-1",
      ref: null,
      envelope: newTaskEnvelope(),
    });
    await vi.waitFor(async () => {
      expect((await harness.service.listCreations())[0]?.phase).toBe("failed");
    });

    await harness.service.dismissCreation({
      creationId: (await harness.service.listCreations())[0]!.id,
    });
    await vi.waitFor(() => expect(settled).toHaveLength(1));
    expect(settled[0]).toMatchObject({ outcome: "dismissed", promptText: "first input" });
    expect(harness.releaseReservedTask).toHaveBeenCalled();
    expect(harness.remove).toHaveBeenCalledWith({ path: worktreeRoot, force: true });
    await expect(harness.service.listCreations()).resolves.toEqual([]);
  });

  it("reports the worktree as unavailable after its directory disappears", async () => {
    const root = await makeTempRoot("kayingcode-mw-available-");
    const repo = await createGitRepository(root);
    const worktrees = createRealGitRepo(root);
    const projectRoot = repo;
    const worktreeRoot = join(root, ".kayingcode", "worktrees", "3f2a", "repo");
    const harness = createServiceHarness(projectRoot, worktreeRoot, worktreeRoot);
    const service = createManagedWorktreeService({ ...harness.ports, git: worktrees });

    const created = await worktrees.create({ sourcePath: repo });
    if (!created.ok) throw new Error("worktree create failed");
    await expect(
      service.isWorktreeAvailable({ worktreeRoot: created.worktree.path }),
    ).resolves.toBe(true);
    await rm(created.worktree.path, { recursive: true, force: true });
    await expect(
      service.isWorktreeAvailable({ worktreeRoot: created.worktree.path }),
    ).resolves.toBe(false);
  });
});

describe("worktree assembly wiring", () => {
  it("registers the service and shares the removal gate in node.ts", async () => {
    const source = await readFile(new URL("../src/node.ts", import.meta.url), "utf8");
    expect(source).toContain(".register(IManagedWorktreeService, managedWorktreeService)");
    expect(source).toContain("isCwdBlocked: (cwd) => worktreeRemovalGate.isRemoving(cwd)");
    expect(source).toContain("runSessionOperation: (target, operation)");
    expect(source).toContain("[HOST_WORKTREE_COMMAND]: true");
    expect(source).toContain("repository: () => taskIndexRepo.getProjectRepository()");
  });
});

describe("managed worktree hook trust identity", () => {
  const fsPort = {
    // Host 侧的 fs adapter 必须以 utf8 读取 .git / gitdir / commondir 指针文件。
    readFile: (path: string) => readFile(path, "utf8"),
    realpath,
    stat: async (path: string) => {
      try {
        const info = await stat(path);
        return { isFile: info.isFile(), isDirectory: info.isDirectory() };
      } catch {
        return null;
      }
    },
  };

  it("maps a managed worktree to its source repository", async () => {
    const root = await makeTempRoot("kayingcode-mw-trust-");
    const repo = await createGitRepository(root);
    const worktrees = createRealGitRepo(root);
    const created = await worktrees.create({ sourcePath: repo });
    if (!created.ok) throw new Error("worktree create failed");

    const identity = await resolveWorkspaceHookTrustIdentity(
      { workspacePath: created.worktree.path, dataBaseDir: root },
      fsPort,
    );
    expect(isSamePath(identity, repo)).toBe(true);
  });

  it("keeps remote identities in their host namespace instead of inheriting the worktree", async () => {
    const root = await makeTempRoot("kayingcode-mw-trust-remote-");
    const repo = await createGitRepository(root);
    const worktrees = createRealGitRepo(root);
    const created = await worktrees.create({ sourcePath: repo });
    if (!created.ok) throw new Error("worktree create failed");
    const remoteIdentity = buildServerRemoteWorkspaceIdentity({
      serverId: "srv-1",
      workspacePath: created.worktree.path,
    });

    const identity = await resolveWorkspaceHookTrustIdentity(
      {
        workspacePath: created.worktree.path,
        workspaceIdentity: remoteIdentity,
        dataBaseDir: root,
      },
      fsPort,
    );
    // 远程 identity 不进入本地与受管 worktree 分支，不能命中源仓库的本地授权。
    expect(identity).not.toBe(repo);
    expect(isSamePath(identity, repo)).toBe(false);
    expect(identity.startsWith("remote:")).toBe(true);
    expect(remoteHostIdFromWorkspaceIdentity(remoteIdentity)).not.toBeNull();
  });
});
