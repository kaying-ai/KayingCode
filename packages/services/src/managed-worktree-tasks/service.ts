// 受管 worktree 的编排（上游 4.0.0 docs/git/worktree.md §3.3–§3.6、§3.11、§8）。
// 本服务是 worktree 生命周期的唯一执行者；git 操作、任务行、会话命令、终端查询都经注入端口完成。
// 创建记录只在内存中，是创建阶段的唯一数据源；renderer 只订阅，不推算。
// 创建失败后的恢复流程拆在 creation-recovery.ts，状态与判定拆在 creation-state.ts。
import { randomUUID } from "node:crypto";
import { Emitter } from "@zcode/rpc";
import {
  MANAGED_WORKTREE_OUTPUT_LIMIT,
  type ManagedWorktreeCreation,
  type ManagedWorktreeCreationSettlement,
  type ManagedWorktreeError,
} from "@zcode/shared";
import { isPathInside, isSamePath } from "@zcode/shared/managed-worktree";
import type { CommandEnvelope } from "@zcode/shared/zcode-protocol-v4";
import type { ManagedWorktreeServicePorts } from "#src/managed-worktree-tasks/ports.js";
import { createWorktreeRemoval, errorOf } from "#src/managed-worktree-tasks/removal.js";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import { resolveWorktreeAdditionalDirectories } from "./creation-directories.js";
import {
  SESSION_ID_PREFIX,
  isAccepted,
  sessionIdOf,
  startedSessionId,
  type CreationState,
} from "./creation-state.js";
import { createWorktreeCreationRecovery } from "./creation-recovery.js";
import type {
  IManagedWorktreeService,
  ManagedWorktreeGroup,
  ManagedWorktreeWorkspace,
  StartManagedWorktreeCreationResult,
} from "./contract.js";

const log = createServiceLogger("managed-worktree");

export function createManagedWorktreeService(
  ports: ManagedWorktreeServicePorts,
): IManagedWorktreeService {
  const now = ports.now ?? Date.now;
  const creations = new Map<string, CreationState>();
  const changeEmitter = new Emitter<ManagedWorktreeCreation[]>();
  const settleEmitter = new Emitter<ManagedWorktreeCreationSettlement>();

  function snapshot(): ManagedWorktreeCreation[] {
    return [...creations.values()].map((state) => ({ ...state.record }));
  }

  function publish(): void {
    changeEmitter.fire(snapshot());
    ports.reportCreatingCount?.(
      [...creations.values()].filter((state) => state.record.phase !== "failed").length,
    );
  }

  function appendOutput(state: CreationState, text: string): void {
    const output = state.record.output + text;
    state.record.output =
      output.length > MANAGED_WORKTREE_OUTPUT_LIMIT
        ? output.slice(output.length - MANAGED_WORKTREE_OUTPUT_LIMIT)
        : output;
    publish();
  }

  function fail(state: CreationState, error: ManagedWorktreeError): void {
    state.record.phase = "failed";
    state.record.error = error;
    log.warn(undefined, "worktree 创建失败", {
      creationId: state.record.id,
      kind: state.record.kind,
      code: error.code,
      // detail 是结构化原因码或 git stderr 摘要，不含用户输入。
      detail: error.detail,
    });
    publish();
  }

  function settle(state: CreationState, settlement: ManagedWorktreeCreationSettlement): void {
    creations.delete(state.record.id);
    // 先发结束事件再推送列表：renderer 先切到真实会话，避免创建视图消失后闪出空草稿。
    settleEmitter.fire(settlement);
    publish();
    void ports.afterChange?.();
  }

  function assertLocal(): void {
    if (!ports.isLocalHost) throw new Error("worktree.local-only");
  }

  async function requireProject(projectId: string) {
    assertLocal();
    const project = (await ports.repository())
      .readTree({ includeTasks: false })
      .projects.find((item) => item.id === projectId && !item.deleted);
    if (!project) throw new Error("project.not-found");
    return project;
  }

  /**
   * worktree 任务的附加目录（上游 I3/I16 与 §2.1）：源仓库内的 root 映射到 worktree 中对应的路径，
   * 起点中不存在的目录不加入；worktree 任务不能拿到源仓库主 checkout 的写权限。
   */
  async function explicitDirectories(
    projectId: string,
    placement: { sourceRoot: string; worktreeRoot: string; cwd: string },
  ): Promise<string[]> {
    const project = await requireProject(projectId);
    return await resolveWorktreeAdditionalDirectories(
      project.roots.map((root) => root.rootPath),
      placement,
    );
  }

  const removal = createWorktreeRemoval({
    ports,
    requireProject,
    // 创建中的 worktree 由创建记录的"放弃"处理，不允许从管理弹窗删除。
    isCreatingAt: (worktreeRoot) =>
      [...creations.values()].some(
        (state) =>
          state.record.worktreePath !== null && isSamePath(state.record.worktreePath, worktreeRoot),
      ),
  });

  function settleStarted(state: CreationState, sessionId: string): void {
    log.info(undefined, "worktree 任务已启动", {
      creationId: state.record.id,
      kind: state.record.kind,
      sessionId,
    });
    settle(state, {
      creationId: state.record.id,
      outcome: "session-started",
      workspacePath: state.record.workspacePath,
      sessionId,
    });
  }

  async function createWorktree(state: CreationState): Promise<boolean> {
    const created = await ports.git.create(
      {
        sourcePath: state.sourcePath,
        ...(state.record.ref ? { startRef: state.record.ref } : {}),
        // fork 的新 worktree 是父任务 cwd 当前状态的副本，带入未提交改动。
        ...(state.record.kind === "fork" ? { carryChanges: true } : {}),
      },
      {
        onOutput: (text) => appendOutput(state, text),
        onPathAllocated: (path) => {
          state.record.worktreePath = path;
          publish();
        },
      },
    );
    if (!created.ok) {
      state.record.worktreePath = null;
      fail(state, created.error);
      return false;
    }
    state.created = created;
    state.record.worktreePath = created.worktree.path;
    return true;
  }

  async function startSession(state: CreationState): Promise<void> {
    const created = state.created!;
    state.record.phase = "starting-session";
    state.record.error = null;
    publish();
    const repository = await ports.repository();
    const worktreeCreation = {
      path: created.worktree.path,
      sha: created.worktree.head ?? "",
      ref: state.record.ref,
      output: state.record.output,
    };
    // 先于 CLI 写入任务行：workspace = 项目，cwd 与 worktree 根只在这里写一次。
    repository.reserveCreatedTask({
      task: {
        workspacePath: state.record.workspacePath,
        ...(state.workspaceIdentity ? { workspaceIdentity: state.workspaceIdentity } : {}),
        taskId: state.sessionId,
      },
      projectId: state.record.projectId,
      cwd: created.cwd,
      worktreeRoot: created.worktree.path,
      additionalDirectories: await explicitDirectories(state.record.projectId, {
        sourceRoot: created.worktree.sourceRoot,
        worktreeRoot: created.worktree.path,
        cwd: created.cwd,
      }),
    });
    const payload = state.envelope.payload as Record<string, unknown>;
    const envelope: CommandEnvelope =
      state.record.kind === "new-task"
        ? {
            ...state.envelope,
            commandId: state.commandId,
            payload: { ...payload, sessionId: state.sessionId, cwd: created.cwd, worktreeCreation },
          }
        : {
            ...state.envelope,
            commandId: state.commandId,
            payload: {
              ...payload,
              targetCwd: { cwd: created.cwd, childSessionId: state.sessionId, worktreeCreation },
            },
          };
    state.sentCommand = {
      key: {
        sessionId: state.record.kind === "new-task" ? null : (state.envelope.sessionId ?? null),
        commandId: envelope.commandId,
      },
      sessionId: state.sessionId,
    };
    const ack = await ports.agent.sendCommand({
      workspacePath: state.record.workspacePath,
      ...(state.workspaceIdentity ? { workspaceIdentity: state.workspaceIdentity } : {}),
      ...(state.record.kind === "new-task" ? { projectId: state.record.projectId } : {}),
      envelope,
    });
    if (!isAccepted(ack)) {
      // worktree 保留：重试只重做会话创建，重发前先向 CLI 确认这次命令的结果。
      fail(state, errorOf("session-failed", ack.reasonCode ?? ack.status));
      return;
    }
    settleStarted(state, startedSessionId(ack, state.sessionId));
  }

  async function run(state: CreationState): Promise<void> {
    if (state.running) return;
    state.running = true;
    try {
      if (!state.created) {
        state.record.phase = "creating";
        state.record.error = null;
        publish();
        if (!(await createWorktree(state))) return;
      }
      await startSession(state);
    } catch (error) {
      fail(
        state,
        errorOf("session-failed", error instanceof Error ? error.message : String(error)),
      );
    } finally {
      state.running = false;
    }
  }

  function findByCommand(commandId: string): CreationState | undefined {
    return [...creations.values()].find((state) => state.envelope.commandId === commandId);
  }

  function begin(state: CreationState): StartManagedWorktreeCreationResult {
    creations.set(state.record.id, state);
    publish();
    void run(state);
    return { ok: true, creationId: state.record.id };
  }

  async function supports(target: ManagedWorktreeWorkspace): Promise<boolean> {
    if (!ports.isLocalHost || target.workspaceIdentity?.trim()) return false;
    return await ports.agent.supportsWorktreeCwd(target);
  }

  /**
   * 同一 commandId 只启动一次创建：在第一次 await 之前同步登记，并发重放复用同一结果。
   * 修复原因：曾在幂等查找之后经过多次 await 才登记创建记录，并发重放会建出第二个 worktree。
   * 只需在本 Host 内去重：一台机器只有一个本地 Host，renderer 的命令只发往它。
   */
  const pendingStarts = new Map<string, Promise<StartManagedWorktreeCreationResult>>();
  function startOnce(
    commandId: string,
    start: () => Promise<StartManagedWorktreeCreationResult>,
  ): Promise<StartManagedWorktreeCreationResult> {
    const existing = findByCommand(commandId);
    if (existing) return Promise.resolve({ ok: true, creationId: existing.record.id });
    const pending = pendingStarts.get(commandId);
    if (pending) return pending;
    const started = start().finally(() => pendingStarts.delete(commandId));
    pendingStarts.set(commandId, started);
    return started;
  }

  async function startNewTaskNow(
    params: Parameters<IManagedWorktreeService["startNewTask"]>[0],
  ): Promise<StartManagedWorktreeCreationResult> {
    if (params.workspaceIdentity?.trim()) return { ok: false, error: errorOf("local-only") };
    const { envelope } = params;
    const payload = envelope.payload as { firstInput?: { text?: unknown } } | null;
    if (envelope.type !== "createSession" || !payload?.firstInput)
      throw new Error("worktree.invalid-command");
    const project = await requireProject(params.projectId);
    // worktree 只从项目主目录检出；其他目录说明草稿与项目不一致。
    const primary = project.roots.find((root) => root.isPrimary)?.rootPath;
    if (!primary || !isSamePath(primary, params.workspacePath))
      throw new Error("worktree.not-primary-root");
    if (!(await supports(params))) return { ok: false, error: errorOf("unsupported-agent") };
    return begin({
      record: {
        id: randomUUID(),
        kind: "new-task",
        projectId: params.projectId,
        workspacePath: params.workspacePath,
        phase: "creating",
        ref: params.ref,
        worktreePath: null,
        output: "",
        error: null,
        promptText: typeof payload.firstInput.text === "string" ? payload.firstInput.text : "",
        parentSessionId: null,
        createdAt: now(),
      },
      envelope,
      sourcePath: params.workspacePath,
      created: null,
      sessionId: sessionIdOf(envelope) ?? `${SESSION_ID_PREFIX}${randomUUID()}`,
      sentCommand: null,
      commandId: envelope.commandId,
      localMode: false,
      running: false,
    });
  }

  async function forkToWorktreeNow(
    params: Parameters<IManagedWorktreeService["forkToWorktree"]>[0],
  ): Promise<StartManagedWorktreeCreationResult> {
    if (!ports.isLocalHost || params.workspaceIdentity?.trim())
      return { ok: false, error: errorOf("local-only") };
    const { envelope } = params;
    if (envelope.type !== "forkAssistant" || !envelope.sessionId)
      throw new Error("worktree.invalid-command");
    if (!(await supports(params))) return { ok: false, error: errorOf("unsupported-agent") };
    // 父任务的 cwd 与项目取 tasks-index（不信任 UI 传入）。
    const parent = (await ports.repository()).resolveSessionDirectories({
      workspacePath: params.workspacePath,
      taskId: envelope.sessionId,
    });
    if (!parent.projectId) throw new Error("worktree.requires-project");
    return begin({
      record: {
        id: randomUUID(),
        kind: "fork",
        projectId: parent.projectId,
        workspacePath: params.workspacePath,
        phase: "creating",
        ref: null,
        worktreePath: null,
        output: "",
        error: null,
        promptText: null,
        parentSessionId: envelope.sessionId,
        createdAt: now(),
      },
      envelope,
      // worktree 从父任务 cwd 检出（父任务本身可能在另一个 worktree 中）。
      sourcePath: parent.cwd ?? parent.workspacePath,
      created: null,
      sessionId: `${SESSION_ID_PREFIX}${randomUUID()}`,
      sentCommand: null,
      commandId: envelope.commandId,
      localMode: false,
      running: false,
    });
  }

  const recovery = createWorktreeCreationRecovery({
    ports,
    releaseCliSessionsUnder: removal.releaseCliSessionsUnder,
    fail,
    publish,
    settle,
    settleStarted,
    run,
    getState: (creationId) => creations.get(creationId),
  });

  return {
    startNewTask: (params) => startOnce(params.envelope.commandId, () => startNewTaskNow(params)),

    forkToWorktree: (params) =>
      startOnce(params.envelope.commandId, () => forkToWorktreeNow(params)),

    retryCreation: recovery.retryCreation,
    continueWithoutWorktree: recovery.continueWithoutWorktree,
    dismissCreation: recovery.dismissCreation,

    async listCreations() {
      return ports.isLocalHost ? snapshot() : [];
    },

    onDidChangeCreations: changeEmitter.event,
    onDidSettleCreation: settleEmitter.event,

    async listWorktrees(params) {
      const project = await requireProject(params.projectId);
      const repository = await ports.repository();
      const groups = new Map<string, ManagedWorktreeGroup>();
      const owned = [...creations.values()]
        .map((state) => state.record.worktreePath)
        .filter((path): path is string => Boolean(path));
      // 项目可有多个 root 属于同一仓库；按源仓库去重，每个仓库只列一次。
      for (const root of project.roots) {
        const listed = await ports.git.list({ sourcePath: root.rootPath }).catch(() => null);
        if (!listed?.sourceRoot || groups.has(listed.sourceRoot)) continue;
        groups.set(listed.sourceRoot, {
          sourceRoot: listed.sourceRoot,
          worktrees: listed.worktrees.map((worktree) => ({
            ...worktree,
            creating: owned.some((path) => isSamePath(path, worktree.path)),
            tasks: repository
              .listTasksByWorktree({ worktreeRoot: worktree.path })
              .map(({ taskId, workspacePath, workspaceIdentity, title, archived }) => ({
                taskId,
                workspacePath,
                ...(workspaceIdentity ? { workspaceIdentity } : {}),
                title,
                archived,
              })),
          })),
        });
      }
      return { groups: [...groups.values()] };
    },

    removeWorktree: (params) => removal.removeWorktree(params),

    async pruneWorktrees(params) {
      const project = await requireProject(params.projectId);
      if (!project.roots.some((root) => isPathInside(params.sourceRoot, root.rootPath)))
        throw new Error("worktree.not-managed");
      await ports.git.prune({ sourcePath: params.sourceRoot });
    },

    async listStartRefs(params) {
      const project = await requireProject(params.projectId);
      const primary = project.roots.find((root) => root.isPrimary)?.rootPath;
      return primary ? await ports.git.listStartRefs({ sourcePath: primary }) : null;
    },

    async isWorktreeAvailable(params) {
      if (!ports.isLocalHost) return true;
      return (await ports.git.resolveManagedWorktree(params.worktreeRoot)) !== null;
    },

    async supportsWorktreeCwd(params) {
      return await supports(params);
    },
  };
}
