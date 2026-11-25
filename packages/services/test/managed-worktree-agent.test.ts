// 受管 worktree 的 Agent 服务协议接线验收：worktreeCwd 探测、目录级会话卸载、
// sessions-index 的 worktree id 与 rename/delete 冷恢复 workspace。
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { kayingcodeProtocolMethods, KAYINGCODE_AGENT_PROVIDER } from "@zcode/shared";
import { V4_METHODS } from "@zcode/shared/kayingcode-protocol-v4";
import type { IKayingCodeAgentService } from "../src/kayingcode-agent/kayingcodeAgent.js";
import { HOST_WORKTREE_COMMAND } from "../src/kayingcode-agent/kayingcodeAgent.js";
import { isKayingCodeWorktreeReleaseFailedError } from "../src/kayingcode-agent/worktreeCwdSupport.js";
import { getTasksIndexDatabasePath, setDataBaseDir } from "../src/paths.js";
import { TaskIndexRepo } from "../src/session/taskIndexRepo.js";

const host = vi.hoisted(() => {
  const state: {
    capabilities: Record<string, unknown>;
    capabilityError: Error | undefined;
    capabilityCalls: number;
    commandEnvelopes: Array<Record<string, unknown>>;
    subscribeParams: Array<Record<string, unknown>>;
    releaseResult: { released: string[]; busy: string[] };
    releaseError: Error | undefined;
    releaseCalls: number;
    hasExistingClient: boolean;
  } = {
    capabilities: {},
    capabilityError: undefined,
    capabilityCalls: 0,
    commandEnvelopes: [],
    subscribeParams: [],
    releaseResult: { released: [], busy: [] },
    releaseError: undefined,
    releaseCalls: 0,
    hasExistingClient: true,
  };

  // 能力探测与卸载都按 client 缓存/分派，测试必须为每个 service 实例提供新的 client。
  const createClient = () => ({
    isDisposed: false,
    request: vi.fn(async (method: string, params: Record<string, unknown>) => {
      if (method === kayingcodeProtocolMethods.runtimeCapabilities) {
        state.capabilityCalls += 1;
        if (state.capabilityError) throw state.capabilityError;
        return state.capabilities;
      }
      if (method === kayingcodeProtocolMethods.sessionReleaseUnderDirectory) {
        state.releaseCalls += 1;
        if (state.releaseError) throw state.releaseError;
        return state.releaseResult;
      }
      if (method === V4_METHODS.command) {
        state.commandEnvelopes.push(params);
        return {
          commandId: params.commandId,
          status: "accepted",
          revisionAtDecision: 0,
        };
      }
      if (method === V4_METHODS.conversationSubscribe) {
        state.subscribeParams.push(params);
        return { ack: { subscriptionId: "sub-1" } };
      }
      throw new Error(`unexpected protocol method: ${method}`);
    }),
    onNotification: vi.fn(() => ({ dispose: () => undefined })),
    onRequest: vi.fn(() => ({ dispose: () => undefined })),
    onClose: vi.fn(() => ({ dispose: () => undefined })),
    respond: vi.fn(async () => undefined),
    respondError: vi.fn(async () => undefined),
  });

  class FakeProcessManager {
    private readonly client = createClient();
    getClient = vi.fn(async () => this.client);
    getExistingClient = vi.fn(() => (state.hasExistingClient ? this.client : undefined));
    markReady = vi.fn();
    onRuntimeRestarted = vi.fn(() => ({ dispose: () => undefined }));
    onRuntimeLifecycle = vi.fn(() => ({ dispose: () => undefined }));
    onStorageStartupChanged = vi.fn(() => ({ dispose: () => undefined }));
    getStorageStartupState = vi.fn(async () => null);
    getRuntimeIdentity = vi.fn(async () => ({}) as never);
    disposeWorkspace = vi.fn(async () => undefined);
    disposeAll = vi.fn();
    disposeAllAndWait = vi.fn(async () => undefined);
  }

  return { state, FakeProcessManager };
});

vi.mock("../src/kayingcode-agent/kayingcodeAgentProcessManager.js", () => ({
  KayingCodeAgentProcessManager: host.FakeProcessManager,
}));

const { createKayingCodeAgentService } =
  await import("../src/kayingcode-agent/kayingcodeAgentService.js");

const readinessView = {
  revision: 1,
  providers: [
    {
      providerId: "test-provider",
      providerName: "Test Provider",
      config: {},
      models: [{ modelId: "test-model", config: {} }],
    },
  ],
};

function createService() {
  return createKayingCodeAgentService({
    modelSelectionReadinessSource: {
      getView: async () => readinessView as never,
    },
  });
}

function resetHostState() {
  host.state.capabilities = {};
  host.state.capabilityError = undefined;
  host.state.capabilityCalls = 0;
  host.state.commandEnvelopes = [];
  host.state.subscribeParams = [];
  host.state.releaseResult = { released: [], busy: [] };
  host.state.releaseError = undefined;
  host.state.releaseCalls = 0;
  host.state.hasExistingClient = true;
}

describe("agent service worktreeCwd capability", () => {
  it("reports true only when the CLI advertises worktreeCwd and caches per connection", async () => {
    resetHostState();
    host.state.capabilities = { worktreeCwd: true };
    const service = createService() as IKayingCodeAgentService & {
      disposeAllAndWait(): Promise<void>;
    };
    try {
      const target = { workspacePath: "/tmp/kayingcode-worktree-cap" };
      await expect(service.supportsWorktreeCwd?.(target)).resolves.toBe(true);
      await expect(service.supportsWorktreeCwd?.(target)).resolves.toBe(true);
      expect(host.state.capabilityCalls).toBe(1);
    } finally {
      await service.disposeAllAndWait();
    }
  });

  it("fails closed when the capability is absent or the probe throws", async () => {
    resetHostState();
    const absent = createService() as IKayingCodeAgentService & {
      disposeAllAndWait(): Promise<void>;
    };
    const target = { workspacePath: "/tmp/kayingcode-worktree-absent" };
    try {
      await expect(absent.supportsWorktreeCwd?.(target)).resolves.toBe(false);
    } finally {
      await absent.disposeAllAndWait();
    }

    resetHostState();
    host.state.capabilityError = new Error("proto.methodNotFound");
    const failing = createService() as IKayingCodeAgentService & {
      disposeAllAndWait(): Promise<void>;
    };
    try {
      await expect(failing.supportsWorktreeCwd?.(target)).resolves.toBe(false);
    } finally {
      await failing.disposeAllAndWait();
    }
  });
});

describe("agent service session release under directory", () => {
  it("returns released/busy from the CLI without starting a process", async () => {
    resetHostState();
    host.state.releaseResult = { released: ["s1"], busy: [] };
    const service = createService() as IKayingCodeAgentService & {
      disposeAllAndWait(): Promise<void>;
    };
    try {
      await expect(
        service.releaseSessionsUnderDirectory?.({
          workspacePath: "/tmp/kayingcode-worktree-release",
          directory: "/tmp/kayingcode-worktree-release-wt",
        }),
      ).resolves.toEqual({ released: ["s1"], busy: [] });
      expect(host.state.releaseCalls).toBe(1);
    } finally {
      await service.disposeAllAndWait();
    }
  });

  it("returns an empty result when no CLI process exists and never throws", async () => {
    resetHostState();
    host.state.hasExistingClient = false;
    const service = createService() as IKayingCodeAgentService & {
      disposeAllAndWait(): Promise<void>;
    };
    try {
      await expect(
        service.releaseSessionsUnderDirectory?.({
          workspacePath: "/tmp/kayingcode-worktree-no-cli",
          directory: "/tmp/kayingcode-worktree-no-cli-wt",
        }),
      ).resolves.toEqual({ released: [], busy: [] });
      expect(host.state.releaseCalls).toBe(0);
    } finally {
      await service.disposeAllAndWait();
    }
  });

  it("surfaces a typed release failure instead of a raw transport error", async () => {
    resetHostState();
    host.state.releaseError = new Error("bridge down");
    const service = createService() as IKayingCodeAgentService & {
      disposeAllAndWait(): Promise<void>;
    };
    try {
      const error = await service
        .releaseSessionsUnderDirectory?.({
          workspacePath: "/tmp/kayingcode-worktree-release-error",
          directory: "/tmp/kayingcode-worktree-release-error-wt",
        })
        .catch((caught: unknown) => caught);
      expect(isKayingCodeWorktreeReleaseFailedError(error)).toBe(true);
    } finally {
      await service.disposeAllAndWait();
    }
  });
});

describe("agent service cold-resume command envelopes", () => {
  function commandEnvelope(type: "renameSession" | "deleteSession") {
    return {
      commandId: `cmd-${type}`,
      clientId: "client-1",
      sessionId: "session-1",
      type,
      payload: type === "renameSession" ? { title: "renamed" } : {},
      issuedAt: Date.now(),
    };
  }

  it("stamps rename/delete envelopes with the local workspace key", async () => {
    resetHostState();
    const service = createService() as IKayingCodeAgentService & {
      disposeAllAndWait(): Promise<void>;
    };
    const workspacePath = "/tmp/kayingcode-worktree-cold";
    try {
      for (const type of ["renameSession", "deleteSession"] as const) {
        await service.sendConversationCommandV4({
          workspacePath,
          envelope: commandEnvelope(type) as never,
        });
        const envelope = host.state.commandEnvelopes.at(-1)!;
        expect(envelope.workspace).toMatchObject({
          workspacePath,
          workspaceKey: workspacePath,
        });
      }
    } finally {
      await service.disposeAllAndWait();
    }
  });

  it("does not stamp remote workspaces with a local cold-resume hint", async () => {
    resetHostState();
    const service = createService() as IKayingCodeAgentService & {
      disposeAllAndWait(): Promise<void>;
    };
    try {
      await service.sendConversationCommandV4({
        workspacePath: "/remote/workspace",
        workspaceIdentity: "remote:server:srv-1:/remote/workspace",
        envelope: commandEnvelope("renameSession") as never,
      });
      const envelope = host.state.commandEnvelopes.at(-1)!;
      expect(envelope.workspace).toBeUndefined();
    } finally {
      await service.disposeAllAndWait();
    }
  });
});

describe("agent service worktree placement envelopes", () => {
  const worktreeCreation = {
    path: "/tmp/.kayingcode/worktrees/3f2a/repo",
    sha: "abc123",
    ref: null,
    output: "",
  };

  it("forwards cwd/worktreeCreation in createSession and targetCwd in forkAssistant", async () => {
    resetHostState();
    const service = createService() as IKayingCodeAgentService & {
      disposeAllAndWait(): Promise<void>;
    };
    const workspacePath = "/tmp/kayingcode-worktree-envelope";
    try {
      await service.sendConversationCommandV4({
        workspacePath,
        envelope: {
          commandId: "cmd-create",
          clientId: "client-1",
          sessionId: null,
          type: "createSession",
          payload: {
            workspaceId: workspacePath,
            sessionId: "sess-worktree",
            cwd: worktreeCreation.path,
            worktreeCreation,
          },
          issuedAt: Date.now(),
        } as never,
        [HOST_WORKTREE_COMMAND]: true,
      } as never);
      expect(host.state.commandEnvelopes.at(-1)!.payload).toMatchObject({
        sessionId: "sess-worktree",
        cwd: worktreeCreation.path,
        worktreeCreation,
      });

      await service.sendConversationCommandV4({
        workspacePath,
        envelope: {
          commandId: "cmd-fork",
          clientId: "client-1",
          sessionId: "session-parent",
          type: "forkAssistant",
          payload: {
            target: { rowId: 1, entityId: "entity-1" },
            targetCwd: {
              cwd: worktreeCreation.path,
              childSessionId: "sess-child",
              worktreeCreation,
            },
          },
          issuedAt: Date.now(),
        } as never,
        [HOST_WORKTREE_COMMAND]: true,
      } as never);
      expect(host.state.commandEnvelopes.at(-1)!.payload).toMatchObject({
        targetCwd: { cwd: worktreeCreation.path, childSessionId: "sess-child" },
      });
    } finally {
      await service.disposeAllAndWait();
    }
  });

  it("rejects host-only placement fields from RPC callers", async () => {
    resetHostState();
    const service = createService() as IKayingCodeAgentService & {
      disposeAllAndWait(): Promise<void>;
    };
    try {
      await expect(
        service.sendConversationCommandV4({
          workspacePath: "/tmp/kayingcode-worktree-forged",
          envelope: {
            commandId: "cmd-forged",
            clientId: "client-1",
            sessionId: null,
            type: "createSession",
            payload: {
              workspaceId: "/tmp/kayingcode-worktree-forged",
              cwd: "/tmp/elsewhere",
            },
            issuedAt: Date.now(),
          } as never,
        } as never),
      ).rejects.toThrow("worktree.host-only-field");
      expect(host.state.commandEnvelopes).toHaveLength(0);
    } finally {
      await service.disposeAllAndWait();
    }
  });
});

describe("agent service sessions-index worktree ids", () => {
  it("subscribes with worktree session ids from tasks-index", async () => {
    resetHostState();
    const root = await mkdtemp(join(tmpdir(), "kayingcode-mw-subscribe-"));
    setDataBaseDir(root);
    const service = createService() as IKayingCodeAgentService & {
      disposeAllAndWait(): Promise<void>;
    };
    const seed = new TaskIndexRepo(getTasksIndexDatabasePath(), 5_000, "local");
    try {
      await seed.ensureReady();
      const repository = await seed.getProjectRepository();
      const projectRoot = join(root, "project");
      const worktreeRoot = join(root, ".kayingcode", "worktrees", "3f2a", "project");
      const project = repository.saveProject({ roots: [projectRoot] });
      repository.reserveCreatedTask({
        task: { workspacePath: projectRoot, taskId: "sess_worktree" },
        projectId: project.id,
        cwd: join(worktreeRoot, "app"),
        worktreeRoot,
      });
      // 普通任务（worktree_root 为 NULL）不能进入 worktreeSessionIds。
      repository.reserveCreatedTask({
        task: { workspacePath: projectRoot, taskId: "sess_plain" },
        projectId: project.id,
      });
      (await seed.getOrganizationDatabase())
        .prepare("UPDATE tasks SET provider=? WHERE task_id IN (?,?)")
        .run(KAYINGCODE_AGENT_PROVIDER, "sess_worktree", "sess_plain");

      await service.subscribeSessionsIndexV4({
        workspacePath: projectRoot,
        runtimePolicy: "existing-only",
      });

      const params = host.state.subscribeParams.at(-1)!;
      expect(params.worktreeSessionIds).toEqual(["sess_worktree"]);
      expect(params.legacyTaskIds).toBeUndefined();
    } finally {
      await service.disposeAllAndWait();
      seed.close();
      setDataBaseDir(null);
      await rm(root, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
