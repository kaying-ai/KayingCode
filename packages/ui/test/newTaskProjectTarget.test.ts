import { describe, expect, it, vi } from "vitest";
import { resolvePreparedProjectNewTaskTarget } from "@/root/newTaskProjectTarget.js";

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
