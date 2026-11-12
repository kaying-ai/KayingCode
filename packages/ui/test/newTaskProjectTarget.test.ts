import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveNewTaskDraftProjectId,
  resolvePreparedProjectNewTaskTarget,
} from "@/root/newTaskProjectTarget.js";
import {
  rememberComposerWorkspaceScope,
  resolveComposerScope,
} from "@/v4/composer/composerDraftStore.js";

describe("resolveNewTaskDraftProjectId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("inherits a prefilled draft's project only from the matching workspace and client", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: { getItem: storage.get.bind(storage), setItem: storage.set.bind(storage) },
    });
    const workspacePath = "/work/game";
    const workspaceIdentity = "server:device-1:/work/game";
    const target = { workspacePath, workspaceIdentity };
    const tryPlugin = { initialPrompt: "[@Blender](plugin://blender) " };
    rememberComposerWorkspaceScope(
      workspacePath,
      workspaceIdentity,
      resolveComposerScope("project-1", workspaceIdentity, "desktop"),
    );

    expect(resolveNewTaskDraftProjectId(tryPlugin, target, "desktop")).toBe("project-1");
    expect(resolveNewTaskDraftProjectId(tryPlugin, target, "web")).toBeUndefined();
    expect(
      resolveNewTaskDraftProjectId(
        tryPlugin,
        { workspacePath, workspaceIdentity: null },
        "desktop",
      ),
    ).toBeUndefined();
    expect(resolveNewTaskDraftProjectId(undefined, target, "desktop")).toBeUndefined();
    expect(
      resolveNewTaskDraftProjectId({ ...tryPlugin, projectId: null }, target, "desktop"),
    ).toBeNull();
    expect(
      resolveNewTaskDraftProjectId({ ...tryPlugin, targetWorkspace: target }, target, "desktop"),
    ).toBeUndefined();
    expect(
      resolveNewTaskDraftProjectId(
        { ...tryPlugin, targetWorkspace: { ...target, projectId: "project-2" } },
        target,
        "desktop",
      ),
    ).toBe("project-2");
  });
});

function createProjectService(result: {
  projectId: string | null;
  workspacePath: string;
  workspaceIdentity?: string;
}) {
  return {
    prepareSession: vi.fn().mockResolvedValue({
      additionalDirectories: [],
      ...result,
    }),
  };
}

describe("resolvePreparedProjectNewTaskTarget", () => {
  it("prepares the Host cwd for a selected project instead of reusing the active workspace", async () => {
    const projectService = createProjectService({
      projectId: "project-1",
      workspacePath: "/work/project-1",
    });

    await expect(
      resolvePreparedProjectNewTaskTarget({
        request: { projectId: "project-1" },
        projectService,
      }),
    ).resolves.toEqual({
      projectId: "project-1",
      workspaceIdentity: null,
      workspacePath: "/work/project-1",
    });
    expect(projectService.prepareSession).toHaveBeenCalledWith({ projectId: "project-1" });
  });

  it("passes the selected host and keeps the prepared remote identity", async () => {
    const projectService = createProjectService({
      projectId: "project-2",
      workspacePath: "/srv/project-2",
      workspaceIdentity: "server:device-1:/srv/project-2",
    });

    await expect(
      resolvePreparedProjectNewTaskTarget({
        request: { projectId: "project-2", hostId: "device-1" },
        projectService,
      }),
    ).resolves.toEqual({
      projectId: "project-2",
      workspaceIdentity: "server:device-1:/srv/project-2",
      workspacePath: "/srv/project-2",
    });
    expect(projectService.prepareSession).toHaveBeenCalledWith({
      projectId: "project-2",
      hostId: "device-1",
    });
  });

  it("does not prepare directories when no project was selected", async () => {
    const projectService = createProjectService({
      projectId: null,
      workspacePath: "/work/draft",
    });

    await expect(
      resolvePreparedProjectNewTaskTarget({
        request: { initialPrompt: "hello" },
        projectService,
      }),
    ).resolves.toBeNull();
    expect(projectService.prepareSession).not.toHaveBeenCalled();
  });

  it("keeps an explicitly resolved target workspace without calling the Host again", async () => {
    const projectService = createProjectService({
      projectId: "project-1",
      workspacePath: "/work/project-1",
    });

    await expect(
      resolvePreparedProjectNewTaskTarget({
        request: {
          projectId: "project-1",
          targetWorkspace: { workspacePath: "/work/project-1" },
        },
        projectService,
      }),
    ).resolves.toBeNull();
    expect(projectService.prepareSession).not.toHaveBeenCalled();
  });

  it("fails when the project service is unavailable", async () => {
    await expect(
      resolvePreparedProjectNewTaskTarget({
        request: { projectId: "project-1" },
        projectService: undefined,
      }),
    ).rejects.toThrow("project.service-unavailable");
  });
});
