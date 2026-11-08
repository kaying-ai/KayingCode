import { describe, expect, it } from "vitest";
import type {
  IRemoteProjectService,
  RemoteProjectDirectory,
  RemoteProjectEntry,
  RemoteProjectHost,
  VirtualProject,
} from "@/project-sidebar/contract.js";
import { buildRemoteHostWorkspaceIdentity } from "@/project-sidebar/contract.js";
import {
  requestRetainedRemoteProjectConnection,
  resolveRecentRemoteProjectPreference,
} from "@/project-sidebar/remote-project-connection.js";
import { toConnectableRemoteTarget } from "@/project-sidebar/remote-navigation.js";
import { filterProjectComposerProjects } from "@/project-sidebar/view.js";

function project(input: {
  id: string;
  name: string;
  hostId?: string;
  roots?: string[];
  position?: number;
}): VirtualProject {
  const hostId = input.hostId ?? "local";
  return {
    id: input.id,
    hostId,
    name: input.name,
    nameOverridden: true,
    roots: (input.roots ?? []).map((rootPath, index) => ({
      rootPath,
      isPrimary: index === 0,
    })),
    position: input.position ?? 0,
    pinned: false,
    deleted: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

function host(
  input: Partial<RemoteProjectHost> & Pick<RemoteProjectHost, "id">,
): RemoteProjectHost {
  return {
    membershipId: "membership-1",
    kind: "ssh",
    target: { kind: "ssh", host: "example.com", username: "dev" },
    position: 0,
    connectionStatus: "online",
    ...input,
  };
}

function entry(input: Partial<RemoteProjectEntry> & Pick<RemoteProjectEntry, "id" | "hostId">) {
  return {
    projectId: "remote-project",
    name: "remote project",
    roots: [{ rootPath: "/srv/game", isPrimary: true }],
    legacyWorkspace: null,
    lastSyncedAt: null,
    ...input,
  } satisfies RemoteProjectEntry;
}

describe("composer project candidates", () => {
  const local = project({ id: "p1", name: "Alpha", roots: ["/workspaces/alpha"] });
  const remote = project({
    id: "p2",
    name: "Beta",
    hostId: "remote:ssh:example.com:22:dev",
    roots: ["/srv/beta", "/srv/shared"],
  });
  const empty = project({ id: "p3", name: "Empty", roots: [] });

  it("keeps sidebar order and includes zero-root projects", () => {
    expect(
      filterProjectComposerProjects([local, remote, empty], "").map((item) => item.id),
    ).toEqual(["p1", "p2", "p3"]);
  });

  it("searches name, roots and device label case-insensitively", () => {
    const deviceName = (item: VirtualProject) =>
      item.hostId === "remote:ssh:example.com:22:dev" ? "Studio Mac" : "";
    expect(
      filterProjectComposerProjects([local, remote, empty], "STUDIO", deviceName).map(
        (item) => item.id,
      ),
    ).toEqual(["p2"]);
    expect(
      filterProjectComposerProjects([local, remote, empty], "shared").map((item) => item.id),
    ).toEqual(["p2"]);
    expect(
      filterProjectComposerProjects([local, remote, empty], "alpha").map((item) => item.id),
    ).toEqual(["p1"]);
    expect(filterProjectComposerProjects([local, remote, empty], "missing")).toEqual([]);
  });
});

describe("remote target conversion", () => {
  it("accepts connectable snapshots and rejects remote-agent histories", () => {
    expect(
      toConnectableRemoteTarget({ kind: "ssh", host: "example.com", username: "dev" }),
    ).toEqual({ kind: "ssh", host: "example.com", username: "dev" });
    expect(toConnectableRemoteTarget({ kind: "wsl", distro: "Ubuntu", user: "dev" })).toEqual({
      kind: "wsl",
      distro: "Ubuntu",
      user: "dev",
    });
    expect(toConnectableRemoteTarget({ kind: "server", url: "https://server" })).toEqual({
      kind: "server",
      url: "https://server",
    });
    expect(
      toConnectableRemoteTarget({
        kind: "server",
        transport: "ssh-tunnel",
        serverId: "server-1",
        ssh: { host: "example.com", username: "dev" },
      }),
    ).toBeNull();
    expect(toConnectableRemoteTarget(null)).toBeNull();
  });
});

describe("retained remote project connection", () => {
  const directory: RemoteProjectDirectory = {
    hosts: [host({ id: "remote:ssh:example.com:22:dev" })],
    entries: [entry({ id: "entry-1", hostId: "remote:ssh:example.com:22:dev" })],
  };

  it("resolves a recent remote preference only when exactly one entry matches", () => {
    const serverDirectory: RemoteProjectDirectory = {
      hosts: [
        host({
          id: "remote:server:server-1",
          kind: "server",
          target: { kind: "server", url: "https://x" },
        }),
      ],
      entries: [entry({ id: "entry-1", hostId: "remote:server:server-1" })],
    };
    const preference = resolveRecentRemoteProjectPreference(serverDirectory, {
      sourceServerId: "server-1",
      path: "/srv/game",
    });
    expect(preference?.preferredDirectoryPath).toBe("/srv/game");
    expect(preference?.preferredSourceServerId).toBe("server-1");
    expect(
      resolveRecentRemoteProjectPreference(
        {
          hosts: serverDirectory.hosts,
          entries: [
            ...serverDirectory.entries,
            entry({ id: "entry-2", hostId: "remote:server:server-1" }),
          ],
        },
        { sourceServerId: "server-1", path: "/srv/game" },
      ),
    ).toBeNull();
  });

  it("reconnects an existing entry and rejects removed entries", async () => {
    const reconnects: string[] = [];
    const workspaceKey = buildRemoteHostWorkspaceIdentity(
      "remote:ssh:example.com:22:dev",
      "/srv/game",
    );
    await requestRetainedRemoteProjectConnection({
      workspaceKey,
      service: createService(directory),
      reconnect: async (key) => {
        reconnects.push(key);
      },
    });
    expect(reconnects).toEqual([workspaceKey]);

    await expect(
      requestRetainedRemoteProjectConnection({
        workspaceKey,
        service: createService({ hosts: [], entries: [] }),
        reconnect: async () => undefined,
      }),
    ).rejects.toThrow("remote-project.entry-not-found");
  });

  it("connects server hosts directly without the reconnect wizard", async () => {
    const connected: string[] = [];
    const serverDirectory: RemoteProjectDirectory = {
      hosts: [
        host({
          id: "remote:server:server-1",
          kind: "server",
          target: { kind: "server", url: "https://x" },
        }),
      ],
      entries: [
        entry({
          id: "entry-server",
          hostId: "remote:server:server-1",
          roots: [{ rootPath: "/srv/game", isPrimary: true }],
        }),
      ],
    };
    await requestRetainedRemoteProjectConnection({
      workspaceKey: buildRemoteHostWorkspaceIdentity("remote:server:server-1", "/srv/game"),
      service: createService(serverDirectory),
      reconnect: async () => {
        throw new Error("must not reconnect");
      },
      connectHost: async (id) => {
        connected.push(id);
      },
    });
    expect(connected).toEqual(["remote:server:server-1"]);
  });
});

function createService(
  directory: RemoteProjectDirectory,
): Pick<IRemoteProjectService, "readDirectory" | "connectHost"> {
  return {
    readDirectory: async () => directory,
    connectHost: async (id: string) => directory.hosts.find((item) => item.id === id)!,
  };
}
