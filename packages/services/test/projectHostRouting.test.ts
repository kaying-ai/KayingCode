import { describe, expect, it, vi } from "vitest";
import { createProjectService } from "../src/project/index.js";
import type { IProjectService } from "../src/project/contract.js";

const remoteHostId = "remote:server:source-1";

function remoteTree(hostId: string) {
  return {
    projects: [
      {
        id: "remote-project",
        hostId,
        name: "remote",
        roots: [{ rootPath: "/srv/app", isPrimary: true, position: 0 }],
        pinned: false,
        deleted: false,
        nameOverridden: false,
        position: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    tasks: [],
  };
}

function localService(overrides: Partial<Parameters<typeof createProjectService>[0]> = {}) {
  return createProjectService({
    repository: async () =>
      ({
        readTree: () => ({ projects: [], tasks: [] }),
      }) as never,
    workspaceDirectory: "/tmp/kayingcode-test-workspace",
    ...overrides,
  });
}

describe("project host routing", () => {
  it("routes a non-local hostId to the resolved online host", async () => {
    const remote = {
      readTree: vi.fn(async () => remoteTree(remoteHostId)),
      prepareSession: vi.fn(async () => ({
        workspacePath: "/srv/app",
        additionalDirectories: [],
        projectId: "remote-project",
      })),
    } as unknown as IProjectService;
    const service = localService({
      resolveHost: async (hostId) => {
        if (hostId !== remoteHostId) throw new Error("project.host-offline");
        return remote;
      },
    });

    const tree = await service.readTree({ hostId: remoteHostId });
    expect(tree.projects[0]?.hostId).toBe(remoteHostId);
    expect(remote.readTree).toHaveBeenCalledTimes(1);

    const directories = await service.prepareSession({
      hostId: remoteHostId,
      projectId: "remote-project",
    });
    expect(directories.workspacePath).toBe("/srv/app");
    expect(remote.prepareSession).toHaveBeenCalledTimes(1);
  });

  it("keeps project.host-offline when no resolver is wired", async () => {
    const service = localService();
    await expect(service.readTree({ hostId: remoteHostId })).rejects.toThrow(
      "project.host-offline",
    );
    await expect(
      service.prepareSession({ hostId: remoteHostId, projectId: "remote-project" }),
    ).rejects.toThrow("project.host-offline");
  });

  it("propagates resolver rejection without falling back to the local repository", async () => {
    const repository = vi.fn();
    const service = localService({
      repository: repository as never,
      resolveHost: async () => {
        throw new Error("project.host-offline");
      },
    });
    await expect(service.readTree({ hostId: remoteHostId })).rejects.toThrow(
      "project.host-offline",
    );
    expect(repository).not.toHaveBeenCalled();
  });
});
