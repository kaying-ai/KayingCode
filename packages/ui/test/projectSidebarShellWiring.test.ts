import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IServiceAccessor, IProjectService, IRemoteProjectService } from "@zcode/services";
import { captureComposerRecentSubmission, readComposerRecent } from "@/lib/composerRecent.js";
import {
  isProjectSidebarV2Enabled,
  PROJECT_SIDEBAR_V2_STORAGE_KEY,
  resolveProjectSidebarRuntime,
} from "@/lib/projectSidebarRuntime.js";
import {
  composerScopeKey,
  persistV4ComposerDraft,
  readComposerWorkspaceScope,
  readV4ComposerDraft,
  rememberComposerWorkspaceScope,
  resolveComposerScope,
  V4_DRAFT_SCOPE_ROOT,
} from "@/v4/composer/composerDraftStore.js";
import zhCN from "@/i18n/locales/zh-CN.js";
import enUS from "@/i18n/locales/en-US.js";

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

const WORKSPACE = "/tmp/project-sidebar-shell";
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { window?: unknown }).window = { localStorage: storage };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

function buildServices(input: {
  projectService?: IProjectService;
  remoteProjectService?: IRemoteProjectService;
  windowProjectService?: IProjectService;
}) {
  const windowProjectDirectory =
    input.windowProjectService !== undefined
      ? {
          projectService: input.windowProjectService,
          remoteProjectService: input.remoteProjectService,
        }
      : undefined;
  return {
    ...(windowProjectDirectory ? { windowProjectDirectory } : {}),
    ...(input.projectService ? { projectService: input.projectService } : {}),
    ...(input.remoteProjectService ? { remoteProjectService: input.remoteProjectService } : {}),
  } as unknown as IServiceAccessor;
}

const projectService = {} as IProjectService;
const remoteProjectService = {} as IRemoteProjectService;

describe("shell 侧栏实现选择", () => {
  it("默认启用新项目侧栏", () => {
    expect(isProjectSidebarV2Enabled()).toBe(true);
    expect(resolveProjectSidebarRuntime(buildServices({ projectService }))).toMatchObject({
      mode: "project-sidebar",
      reason: "enabled",
    });
  });

  it("KAYINGCODE_UI_SIDEBAR_V2=0 等价开关关闭时回退旧侧栏", () => {
    const previous = process.env.KAYINGCODE_UI_SIDEBAR_V2;
    process.env.KAYINGCODE_UI_SIDEBAR_V2 = "0";
    try {
      expect(isProjectSidebarV2Enabled()).toBe(false);
      expect(resolveProjectSidebarRuntime(buildServices({ projectService }))).toMatchObject({
        mode: "legacy",
        reason: "flag-disabled",
      });
    } finally {
      if (previous === undefined) delete process.env.KAYINGCODE_UI_SIDEBAR_V2;
      else process.env.KAYINGCODE_UI_SIDEBAR_V2 = previous;
    }
  });

  it("本地存储可用于运行期回退与恢复", () => {
    storage.setItem(PROJECT_SIDEBAR_V2_STORAGE_KEY, "0");
    expect(isProjectSidebarV2Enabled()).toBe(false);
    storage.setItem(PROJECT_SIDEBAR_V2_STORAGE_KEY, "1");
    expect(isProjectSidebarV2Enabled()).toBe(true);
  });

  it("缺少项目服务时回退旧侧栏并报告原因", () => {
    expect(resolveProjectSidebarRuntime(buildServices({}))).toMatchObject({
      mode: "legacy",
      reason: "project-service-unavailable",
    });
  });

  it("窗口目录组缺失时回退到 base 项目服务", () => {
    expect(
      resolveProjectSidebarRuntime(buildServices({ projectService, remoteProjectService })),
    ).toMatchObject({
      mode: "project-sidebar",
      reason: "enabled",
      projectService,
    });
  });
});

describe("root composer scope", () => {
  it("按项目隔离根草稿并记忆 workspace scope", () => {
    const scope = resolveComposerScope("project-a", undefined, "desktop");
    rememberComposerWorkspaceScope(WORKSPACE, undefined, scope);
    expect(readComposerWorkspaceScope(WORKSPACE, undefined, "desktop")).toEqual(scope);

    persistV4ComposerDraft(
      WORKSPACE,
      undefined,
      V4_DRAFT_SCOPE_ROOT,
      { text: "draft", projectId: "project-a", taskGroupId: null },
      scope,
    );
    expect(readV4ComposerDraft(WORKSPACE, undefined, V4_DRAFT_SCOPE_ROOT, scope)?.text).toBe(
      "draft",
    );
    expect(
      readV4ComposerDraft(
        WORKSPACE,
        undefined,
        V4_DRAFT_SCOPE_ROOT,
        resolveComposerScope("project-b", undefined, "desktop"),
      ),
    ).toBeNull();
    expect(composerScopeKey(scope)).toContain("project-a");
  });

  it("新任务 Recent 记录写入项目 scope，不透传到工作区级 key", () => {
    const scope = resolveComposerScope("project-a", undefined, "desktop");
    const accept = captureComposerRecentSubmission(
      WORKSPACE,
      { modelSelection: { providerId: "provider-a", modelId: "model-a" }, mode: "build" },
      undefined,
      storage,
      scope,
    );
    accept();
    expect(readComposerRecent(WORKSPACE, undefined, storage, scope)).toMatchObject({
      modelSelection: { providerId: "provider-a", modelId: "model-a" },
      mode: "build",
    });
    expect(readComposerRecent(WORKSPACE, undefined, storage)).toBeNull();
  });
});

describe("项目侧栏文案", () => {
  it("Shell 接线所需文案在中英文都存在", () => {
    const required = [
      "project.create",
      "project.edit",
      "project.delete",
      "project.name",
      "project.folders",
      "project.browse",
      "project.save",
      "project.cancel",
      "project.createTask",
      "project.pin",
      "project.unpin",
      "project.projects",
      "project.tasks",
      "project.expandAll",
      "project.collapseAll",
      "project.connectionUnavailable",
      "project.hasUnread",
      "taskGroup.defaultTitle",
      "taskGroup.move",
      "taskGroup.remove",
      "taskGroup.noGroups",
      "taskGroup.failed",
      "workspaceSidebar.projectDevice",
      "workspaceSidebar.projectLine",
      "workspaceSidebar.projectPath",
    ] as const;
    for (const id of required) {
      expect(zhCN[id], `zh-CN ${id}`).toBeTruthy();
      expect(enUS[id], `en-US ${id}`).toBeTruthy();
    }
  });
});
