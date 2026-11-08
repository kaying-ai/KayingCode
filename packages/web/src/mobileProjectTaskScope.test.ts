import type { ProjectTask, VirtualProject } from "@zcode/services";
import { buildRemoteHostWorkspaceIdentity } from "@zcode/shared";
import { describe, expect, it } from "vitest";
import { selectMobileProjectTaskScope } from "./mobileProjectTaskScope.js";

function project(id: string, hostId: string, ...paths: string[]): VirtualProject {
  return {
    id,
    hostId,
    name: id,
    roots: paths.map((rootPath, position) => ({ rootPath, position, isPrimary: position === 0 })),
    position: 0,
    pinned: false,
    deleted: false,
    nameOverridden: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

function task(taskId: string, scope: Partial<ProjectTask> = {}): ProjectTask {
  return {
    taskId,
    title: taskId,
    traceId: taskId,
    workspacePath: "D:/game",
    hostId: "local",
    projectId: "game",
    createdAt: 0,
    updatedAt: 0,
    mode: "default",
    pinned: false,
    archived: false,
    ...scope,
  };
}

describe("mobile project task scope", () => {
  it("includes every root, pinned and archived tasks while isolating project and Host", () => {
    const selected = project("game", "local", "D:/game", "D:/assets");
    const tasks = [
      task("pinned", { pinned: true }),
      task("archived", { workspacePath: "D:/assets", archived: true }),
      task("other-host", { hostId: "remote:ssh:user:host:22" }),
      task("other-project", { projectId: "other" }),
    ];
    expect(selectMobileProjectTaskScope({ projects: [selected], tasks }, "D:\\game")).toEqual({
      hostId: "local",
      name: "game",
      project: selected,
      tasks: tasks.slice(0, 2),
    });
  });

  it("only matches unassigned tasks in the same standalone remote workspace", () => {
    const hostId = "remote:ssh:user:host:22";
    const workspaceIdentity = buildRemoteHostWorkspaceIdentity(hostId, "/game");
    const tasks = [
      task("standalone", { workspacePath: "/game", workspaceIdentity, hostId, projectId: null }),
      task("local", { workspacePath: "/game", projectId: null }),
      task("assigned", { workspacePath: "/game", workspaceIdentity, hostId }),
    ];
    expect(selectMobileProjectTaskScope({ projects: [], tasks }, workspaceIdentity)).toMatchObject({
      name: "game",
      hostId,
      tasks: tasks.slice(0, 1),
    });
  });

  it("keeps existing Windows projects with different separators scoped to their exact keys", () => {
    const slash = project("slash", "local", "D:/game");
    const backslash = project("backslash", "local", "D:\\game");
    const slashTask = task("slash-task", { projectId: slash.id });
    const backslashTask = task("backslash-task", {
      projectId: backslash.id,
      workspacePath: "D:\\game",
    });
    const tree = { projects: [backslash, slash], tasks: [backslashTask, slashTask] };
    expect(selectMobileProjectTaskScope(tree, "D:/game")).toMatchObject({
      project: slash,
      tasks: [slashTask],
    });
    expect(selectMobileProjectTaskScope(tree, "D:\\game")).toMatchObject({
      project: backslash,
      tasks: [backslashTask],
    });
  });

  it("matches a remote project by its canonical workspace key and owning Host", () => {
    const hostId = "remote:ssh:user:host:22";
    const workspaceIdentity = buildRemoteHostWorkspaceIdentity(hostId, "/game");
    const selected = project("remote game", hostId, "/game/");
    expect(
      selectMobileProjectTaskScope(
        { projects: [project("local game", "local", "/game"), selected], tasks: [] },
        workspaceIdentity,
      ),
    ).toMatchObject({ hostId, project: selected });
  });

  it("keeps empty projects distinct from an ambiguous root", () => {
    const selected = project("game", "local", "D:/game");
    expect(
      selectMobileProjectTaskScope({ projects: [selected], tasks: [] }, "D:/game"),
    ).toMatchObject({
      project: selected,
      tasks: [],
    });
    expect(
      selectMobileProjectTaskScope(
        { projects: [selected, project("other", "local", "D:/game")], tasks: [] },
        "D:/game",
      ),
    ).toBeNull();
  });
});
