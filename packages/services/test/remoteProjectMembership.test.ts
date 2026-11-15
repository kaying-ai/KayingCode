import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  connectionProfileSchema,
  type ConnectionProfile,
  type RemoteProjectDirectory,
} from "@zcode/shared";
import {
  releaseRemoteProjectProfileHost,
  remoteProjectHostIdForProfile,
} from "../src/remote-projects/connection-membership.js";
import type { IRemoteProjectService } from "../src/remote-projects/contract.js";

function profile(host: string, overrides: Record<string, unknown> = {}): ConnectionProfile {
  return connectionProfileSchema.parse({
    profileId: randomUUID(),
    createdAt: Date.now(),
    transport: "ssh",
    target: { kind: "ssh", host, username: "dev" },
    ...overrides,
  });
}

function fakeService(entries: readonly { hostId: string }[] = []) {
  const removed: string[] = [];
  const service = {
    readDirectory: async () =>
      ({ hosts: [], entries } as unknown as RemoteProjectDirectory),
    removeHost: async (id: string) => {
      removed.push(id);
    },
  } as unknown as IRemoteProjectService;
  return { removed, service };
}

describe("releaseRemoteProjectProfileHost", () => {
  it("removes the address reservation of a deleted unbound profile", async () => {
    const removedProfile = profile("dev.example.com");
    const { removed, service } = fakeService();
    await releaseRemoteProjectProfileHost(service, removedProfile, []);
    expect(removed).toEqual([remoteProjectHostIdForProfile(removedProfile)]);
  });

  it("keeps the reservation while another active profile maps to the same address", async () => {
    const removedProfile = profile("dev.example.com");
    const { removed, service } = fakeService();
    const sibling = profile("dev.example.com");
    await releaseRemoteProjectProfileHost(service, removedProfile, [sibling]);
    expect(removed).toEqual([]);
  });

  it("ignores a retired profile sharing the address", async () => {
    const removedProfile = profile("dev.example.com");
    const { removed, service } = fakeService();
    const sibling = profile("dev.example.com", { lifecycleState: "retired" });
    await releaseRemoteProjectProfileHost(service, removedProfile, [sibling]);
    expect(removed).toEqual([remoteProjectHostIdForProfile(removedProfile)]);
  });

  it("keeps a legacy row that still has a visible project entry", async () => {
    const removedProfile = profile("dev.example.com");
    const { removed, service } = fakeService([
      { hostId: remoteProjectHostIdForProfile(removedProfile) },
    ]);
    await releaseRemoteProjectProfileHost(service, removedProfile, []);
    expect(removed).toEqual([]);
  });

  it("does nothing for an identified device profile", async () => {
    const removedProfile = profile("dev.example.com", { sourceServerId: randomUUID() });
    const { removed, service } = fakeService();
    await releaseRemoteProjectProfileHost(service, removedProfile, []);
    expect(removed).toEqual([]);
  });

  it("releases an IPv6 address reservation when the identity builder accepts it", async () => {
    const removedProfile = profile("2001:db8::1");
    const { removed, service } = fakeService();
    await expect(
      releaseRemoteProjectProfileHost(service, removedProfile, []),
    ).resolves.toBeUndefined();
    expect(removed).toEqual([remoteProjectHostIdForProfile(removedProfile)]);
  });
});
