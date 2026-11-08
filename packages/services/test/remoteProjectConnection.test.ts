import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createRemoteProjectService } from "../src/remote-projects/index.js";
import { PROJECT_SCHEMA_SQL } from "../src/project-storage/schema.js";

const hostId = "remote:server:source-1";
const target = { kind: "ssh" as const, host: "example.test", username: "dev" };

function service(
  options: {
    readConnectionStates?: Parameters<typeof createRemoteProjectService>[0]["readConnectionStates"];
    connectHost?: Parameters<typeof createRemoteProjectService>[0]["connectHost"];
    afterChange?: () => Promise<void> | void;
  } = {},
) {
  const db = new DatabaseSync(":memory:");
  db.exec(PROJECT_SCHEMA_SQL);
  return createRemoteProjectService({
    database: async () => db,
    ...options,
  });
}

describe("remote project connection hooks", () => {
  it("overlays live connection states on the directory", async () => {
    const readConnectionStates = vi.fn(async () => {
      const states = new Map();
      states.set(hostId, {
        connectionStatus: "online" as const,
        lastConnectionStatus: "online",
      });
      return states;
    });
    const remote = service({ readConnectionStates });
    await remote.saveHost({ id: hostId, target });

    const directory = await remote.readDirectory();
    expect(directory.hosts[0]).toMatchObject({
      id: hostId,
      connectionStatus: "online",
      lastConnectionStatus: "online",
    });
    expect(readConnectionStates).toHaveBeenCalledTimes(1);
  });

  it("keeps the persisted shape when no connection states are wired", async () => {
    const remote = service();
    await remote.saveHost({ id: hostId, target });
    const directory = await remote.readDirectory();
    expect(directory.hosts[0]?.connectionStatus).toBeUndefined();
  });

  it("reconnects through the injected connector and reports the resolved host", async () => {
    const connectHost = vi.fn(async (host: { id: string }) => host.id);
    const afterChange = vi.fn();
    const remote = service({ connectHost, afterChange });
    await remote.saveHost({ id: hostId, target });

    const connected = await remote.connectHost(hostId);
    expect(connectHost).toHaveBeenCalledTimes(1);
    expect(connected.id).toBe(hostId);
    expect(afterChange).toHaveBeenCalled();
  });

  it("rejects a connector that resolves to a removed host", async () => {
    const remote = service({ connectHost: async () => "remote:server:other" });
    await remote.saveHost({ id: hostId, target });
    await expect(remote.connectHost(hostId)).rejects.toThrow("remote-project.host-removed");
  });
});
