import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KAYINGCODE_AGENT_PROVIDER } from "@zcode/shared";
import { useKayingCodeSessionStore } from "@/store/kayingcodeSessionStore.js";
import {
  clearV4ComposerDraft,
  clearV4ComposerDraftTaskGroup,
  composerScopeKey,
  readComposerWorkspaceScope,
  readV4ComposerDraft,
  rememberComposerWorkspaceScope,
  resolveComposerScope,
  V4_DRAFT_SCOPE_ROOT,
  type ComposerScope,
} from "@/v4/composer/composerDraftStore.js";
import { persistV4ComposerDraft } from "@/v4/composer/composerDraftStore.js";
import { captureV4ComposerDraftHandoff } from "@/v4/composer/composerDraftWorkspaceTransfer.js";
import { resolveProviderConfigOpenTargetPath } from "@/useTaskListItemContextActions.js";

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

const WORKSPACE = "/tmp/sidebar-state-surface";
const REMOTE_IDENTITY = "remote:server:source-1:/workspace";
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { window?: unknown }).window = { localStorage: storage };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("U3 session store draft organization intent", () => {
  it("keeps draft project and task group as renderer-only intent", () => {
    const workspace = "/tmp/u3-draft-project";
    const store = useKayingCodeSessionStore.getState();
    store.startDraft(workspace, KAYINGCODE_AGENT_PROVIDER, undefined, {
      projectId: "project-a",
      taskGroupId: "group-a",
      createSource: "project",
    });
    const state = useKayingCodeSessionStore.getState().getWorkspaceState(workspace);
    expect(state.draftProjectId).toBe("project-a");
    expect(state.draftTaskGroupId).toBe("group-a");
    expect(state.composerInitialization).toBeUndefined();
  });

  it("bumps the draft runtime invalidation when the project changes", () => {
    const workspace = "/tmp/u3-draft-invalidation";
    const store = useKayingCodeSessionStore.getState();
    store.startDraft(workspace, undefined, undefined, { projectId: "project-a" });
    const first = useKayingCodeSessionStore
      .getState()
      .getWorkspaceState(workspace).draftRuntimeInvalidationVersion;
    store.startDraft(workspace, undefined, undefined, { projectId: "project-a" });
    const sameProject = useKayingCodeSessionStore
      .getState()
      .getWorkspaceState(workspace).draftRuntimeInvalidationVersion;
    store.startDraft(workspace, undefined, undefined, { projectId: "project-b" });
    const nextProject = useKayingCodeSessionStore
      .getState()
      .getWorkspaceState(workspace).draftRuntimeInvalidationVersion;
    expect(sameProject).toBe(first);
    expect(nextProject).toBe(first + 1);
  });

  it("clears only the task group intent", () => {
    const workspace = "/tmp/u3-clear-group";
    const store = useKayingCodeSessionStore.getState();
    store.startDraft(workspace, undefined, undefined, {
      projectId: "project-a",
      taskGroupId: "group-a",
    });
    useKayingCodeSessionStore.getState().clearDraftTaskGroup(workspace);
    const state = useKayingCodeSessionStore.getState().getWorkspaceState(workspace);
    expect(state.draftTaskGroupId).toBeUndefined();
    expect(state.draftProjectId).toBe("project-a");
  });

  it("sets composer initialization on task activation and consumes only the same object", () => {
    const workspace = "/tmp/u3-composer-initialization";
    const store = useKayingCodeSessionStore.getState();
    store.setActiveTaskId(workspace, "task-1", undefined, {
      mode: "build",
      planEnabled: true,
    });
    const initialization = useKayingCodeSessionStore
      .getState()
      .getWorkspaceState(workspace).composerInitialization;
    expect(initialization).toEqual({
      taskId: "task-1",
      config: { mode: "build", planEnabled: true },
    });
    if (!initialization) {
      throw new Error("expected composer initialization");
    }

    // 不同实例不能消费同一 task 的初始化。
    useKayingCodeSessionStore.getState().consumeComposerInitialization(workspace, {
      ...initialization,
    });
    expect(
      useKayingCodeSessionStore.getState().getWorkspaceState(workspace).composerInitialization,
    ).toBe(initialization);

    useKayingCodeSessionStore.getState().consumeComposerInitialization(workspace, initialization);
    expect(
      useKayingCodeSessionStore.getState().getWorkspaceState(workspace).composerInitialization,
    ).toBeUndefined();
  });

  it("drops composer initialization after switching to another task", () => {
    const workspace = "/tmp/u3-composer-initialization-switch";
    const store = useKayingCodeSessionStore.getState();
    store.setActiveTaskId(workspace, "task-1", undefined, { mode: "build" });
    useKayingCodeSessionStore.getState().setActiveTaskId(workspace, "task-2");
    expect(
      useKayingCodeSessionStore.getState().getWorkspaceState(workspace).composerInitialization,
    ).toBeUndefined();
  });
});

describe("U2 composer workspace scope", () => {
  it("resolves local and remote host identity into one scope shape", () => {
    expect(resolveComposerScope("project-a", undefined, "desktop")).toEqual({
      clientNamespace: "desktop",
      hostId: "local",
      projectId: "project-a",
    });
    expect(resolveComposerScope("project-a", REMOTE_IDENTITY, "mobile")).toEqual({
      clientNamespace: "mobile",
      hostId: "remote:server:source-1",
      projectId: "project-a",
    });
  });

  it("round-trips the remembered workspace scope only for the same client and host", () => {
    const scope = resolveComposerScope("project-a", undefined, "desktop");
    rememberComposerWorkspaceScope(WORKSPACE, undefined, scope);
    expect(readComposerWorkspaceScope(WORKSPACE, undefined, "desktop")).toEqual(scope);
    expect(readComposerWorkspaceScope(WORKSPACE, undefined, "mobile")).toBeUndefined();
  });

  it("isolates project root drafts by composer scope", () => {
    const scopeA = resolveComposerScope("project-a", undefined, "desktop");
    const scopeB = resolveComposerScope("project-b", undefined, "desktop");
    persistV4ComposerDraft(
      WORKSPACE,
      undefined,
      V4_DRAFT_SCOPE_ROOT,
      { text: "draft for a", projectId: "project-a", taskGroupId: "group-a" },
      scopeA,
    );
    expect(readV4ComposerDraft(WORKSPACE, undefined, V4_DRAFT_SCOPE_ROOT, scopeA)?.text).toBe(
      "draft for a",
    );
    expect(readV4ComposerDraft(WORKSPACE, undefined, V4_DRAFT_SCOPE_ROOT, scopeB)).toBeNull();
  });

  it("clears only the draft task group and keeps text and project", () => {
    const scope = resolveComposerScope("project-a", undefined, "desktop");
    persistV4ComposerDraft(
      WORKSPACE,
      undefined,
      V4_DRAFT_SCOPE_ROOT,
      { text: "keep me", projectId: "project-a", taskGroupId: "group-a" },
      scope,
    );
    expect(clearV4ComposerDraftTaskGroup(WORKSPACE, undefined, scope)).toBe(true);
    const draft = readV4ComposerDraft(WORKSPACE, undefined, V4_DRAFT_SCOPE_ROOT, scope);
    expect(draft?.text).toBe("keep me");
    expect(draft?.projectId).toBe("project-a");
    expect(draft?.taskGroupId).toBeUndefined();
  });

  it("claims a legacy workspace draft only when it names the same project", () => {
    const scopeA = resolveComposerScope("project-a", undefined, "desktop");
    const scopeB = resolveComposerScope("project-b", undefined, "desktop");
    // 旧键：没有 scope 参数时写入工作区级 key。
    persistV4ComposerDraft(WORKSPACE, undefined, V4_DRAFT_SCOPE_ROOT, {
      text: "legacy a",
      projectId: "project-a",
    });
    expect(readV4ComposerDraft(WORKSPACE, undefined, V4_DRAFT_SCOPE_ROOT, scopeA)?.text).toBe(
      "legacy a",
    );
    expect(readV4ComposerDraft(WORKSPACE, undefined, V4_DRAFT_SCOPE_ROOT, scopeB)).toBeNull();
  });

  it("captures a handoff from the persisted project draft when no editor is mounted", () => {
    const scope = resolveComposerScope("project-a", undefined, "desktop");
    rememberComposerWorkspaceScope(WORKSPACE, undefined, scope);
    persistV4ComposerDraft(
      WORKSPACE,
      undefined,
      V4_DRAFT_SCOPE_ROOT,
      { text: "handoff text", projectId: "project-a", taskGroupId: "group-a" },
      scope,
    );
    const handoff = captureV4ComposerDraftHandoff(WORKSPACE, undefined, "desktop");
    expect(handoff.sourceWorkspaceKey).toBe(WORKSPACE);
    expect(handoff.draft.text).toBe("handoff text");
    expect(handoff.draft.projectId).toBe("project-a");
    expect(handoff.attachments).toEqual([]);
  });

  it("keeps the composer scope key stable for JSON-based storage keys", () => {
    const scope: ComposerScope = {
      clientNamespace: "desktop",
      hostId: "local",
      projectId: "project-a",
    };
    expect(composerScopeKey(scope)).toBe('["desktop","local","project-a"]');
    expect(clearV4ComposerDraft(WORKSPACE, undefined, V4_DRAFT_SCOPE_ROOT, scope)).toBe(true);
    expect(readV4ComposerDraft(WORKSPACE, undefined, V4_DRAFT_SCOPE_ROOT, scope)).toBeNull();
  });
});

describe("U5 provider config menu target", () => {
  it("opens an existing provider config file directly", () => {
    expect(resolveProviderConfigOpenTargetPath("/home/user/.kayingcode/config.json", true)).toBe(
      "/home/user/.kayingcode/config.json",
    );
  });

  it("falls back to the parent directory when the file has not been written yet", () => {
    expect(resolveProviderConfigOpenTargetPath("/home/user/.kayingcode/config.json", false)).toBe(
      "/home/user/.kayingcode",
    );
    expect(
      resolveProviderConfigOpenTargetPath("C:\\Users\\dev\\.kayingcode\\config.json", false),
    ).toBe("C:\\Users\\dev\\.kayingcode");
  });

  it("keeps a Windows drive root usable instead of returning a bare drive", () => {
    expect(resolveProviderConfigOpenTargetPath("C:\\config.json", false)).toBe("C:\\");
  });
});
