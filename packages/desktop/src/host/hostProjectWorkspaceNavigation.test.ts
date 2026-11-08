import { describe, expect, it, vi } from "vitest";
import { buildRemoteHostWorkspaceIdentity } from "@zcode/shared";
import { createHostProjectWorkspaceNavigation } from "./hostProjectWorkspaceNavigation.js";

function remoteProject(hostId: string) {
  return {
    id: "p-remote",
    hostId,
    name: "Remote",
    nameOverridden: false,
    roots: [{ rootPath: "/remote/repo", position: 0, isPrimary: true }],
    position: 0,
    pinned: false,
    deleted: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

function remoteDirectory(hostId: string) {
  return {
    hosts: [
      {
        id: hostId,
        membershipId: "membership-1",
        kind: "ssh" as const,
        target: { kind: "ssh" as const, host: "example.test", username: "dev" },
        position: 0,
        connectionStatus: "online" as const,
      },
    ],
    entries: [
      {
        id: "entry-1",
        hostId,
        projectId: "p-remote",
        name: "Remote",
        roots: [{ rootPath: "/remote/repo", position: 0, isPrimary: true }],
        legacyWorkspace: null,
        lastSyncedAt: null,
      },
    ],
  };
}

describe("createHostProjectWorkspaceNavigation", () => {
  it("本地项目只准备目录，不建立远端 logical session", async () => {
    const prepareSession = vi.fn(async () => ({
      workspacePath: "/local/repo",
      projectId: "p-local",
      additionalDirectories: [],
    }));
    const connectRemoteWorkspace = vi.fn();
    const bindRemoteWorkspace = vi.fn();
    const navigation = createHostProjectWorkspaceNavigation({
      projectService: {
        readProjects: async () => [],
        readTree: async () => ({ projects: [], tasks: [] }),
        prepareSession,
        resolveSessionDirectories: async () => ({
          workspacePath: "/local/repo",
          projectId: "p-local",
          additionalDirectories: [],
        }),
      } as never,
      remoteProjectService: { readDirectory: async () => ({ hosts: [], entries: [] }) } as never,
      readConnectionOwner: () => undefined,
      buildWorkspaceIdentity: buildRemoteHostWorkspaceIdentity,
      connectRemoteWorkspace,
      bindRemoteWorkspace,
      disposeRemoteSession: vi.fn(),
      assertHost: () => {},
    });

    await expect(
      navigation.prepare({ projectId: "p-local", hostId: "local" }, "request-local"),
    ).resolves.toEqual({
      hostId: "local",
      workspacePath: "/local/repo",
      projectId: "p-local",
      additionalDirectories: [],
    });
    expect(prepareSession).toHaveBeenCalledWith({ hostId: "local", projectId: "p-local" });
    expect(connectRemoteWorkspace).not.toHaveBeenCalled();
    expect(bindRemoteWorkspace).not.toHaveBeenCalled();
  });

  it("远端项目复用窗口连接并等待 workspace 可附着", async () => {
    const owner = {};
    const hostId = "remote:ssh:example.test:22:dev";
    const connectRemoteWorkspace = vi.fn(async (input) => ({
      remoteSessionId: "remote-session-1",
      target: input.target,
      workspacePath: input.workspacePath,
      workspaceIdentity: input.workspaceIdentity,
      generation: 1,
    }));
    const bindRemoteWorkspace = vi.fn(async () => {});
    const navigation = createHostProjectWorkspaceNavigation({
      projectService: {
        readProjects: async (params?: { hostId?: string }) =>
          params?.hostId === hostId ? [remoteProject(hostId)] : [],
        readTree: async () => ({ projects: [], tasks: [] }),
        prepareSession: async () => ({
          workspacePath: "/remote/repo",
          projectId: "p-remote",
          additionalDirectories: [],
        }),
        resolveSessionDirectories: async () => ({
          workspacePath: "/remote/repo",
          projectId: "p-remote",
          additionalDirectories: [],
        }),
      } as never,
      remoteProjectService: { readDirectory: async () => remoteDirectory(hostId) } as never,
      readConnectionOwner: () => owner,
      buildWorkspaceIdentity: buildRemoteHostWorkspaceIdentity,
      connectRemoteWorkspace,
      bindRemoteWorkspace,
      disposeRemoteSession: vi.fn(),
      assertHost: () => {},
    });

    const result = await navigation.prepare({ projectId: "p-remote", hostId }, "request-remote");
    expect(connectRemoteWorkspace).toHaveBeenCalledWith({
      requestId: "request-remote",
      target: expect.objectContaining({ kind: "ssh", host: "example.test" }),
      workspacePath: "/remote/repo",
      workspaceIdentity: buildRemoteHostWorkspaceIdentity(hostId, "/remote/repo"),
    });
    expect(bindRemoteWorkspace).toHaveBeenCalledWith({
      remoteSessionId: "remote-session-1",
      workspacePath: "/remote/repo",
      workspaceIdentity: buildRemoteHostWorkspaceIdentity(hostId, "/remote/repo"),
    });
    expect(result).toMatchObject({
      hostId,
      workspacePath: "/remote/repo",
      projectId: "p-remote",
      remote: { remoteSessionId: "remote-session-1" },
    });
  });

  it("workspace bind 失败时回收本次 provisional session", async () => {
    const owner = {};
    const hostId = "remote:ssh:example.test:22:dev";
    const disposeRemoteSession = vi.fn(async () => {});
    const navigation = createHostProjectWorkspaceNavigation({
      projectService: {
        readProjects: async (params?: { hostId?: string }) =>
          params?.hostId === hostId ? [remoteProject(hostId)] : [],
        readTree: async () => ({ projects: [], tasks: [] }),
        prepareSession: async () => ({
          workspacePath: "/remote/repo",
          projectId: "p-remote",
          additionalDirectories: [],
        }),
        resolveSessionDirectories: async () => ({
          workspacePath: "/remote/repo",
          projectId: "p-remote",
          additionalDirectories: [],
        }),
      } as never,
      remoteProjectService: { readDirectory: async () => remoteDirectory(hostId) } as never,
      readConnectionOwner: () => owner,
      buildWorkspaceIdentity: buildRemoteHostWorkspaceIdentity,
      connectRemoteWorkspace: async (input) => ({
        remoteSessionId: "remote-session-1",
        target: input.target,
        workspacePath: input.workspacePath,
        workspaceIdentity: input.workspaceIdentity,
        generation: 1,
      }),
      bindRemoteWorkspace: async () => {
        throw new Error("bind failed");
      },
      disposeRemoteSession,
      assertHost: () => {},
    });

    await expect(
      navigation.prepare({ projectId: "p-remote", hostId }, "request-remote"),
    ).rejects.toThrow("bind failed");
    expect(disposeRemoteSession).toHaveBeenCalledWith("remote-session-1");
  });
});
