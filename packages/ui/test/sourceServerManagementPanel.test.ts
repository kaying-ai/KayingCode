import { expect, it } from "vitest";
import type { ConnectionProfile, SourceServerConnectionStateSnapshot } from "@zcode/shared";
import { createSourceServerUpdatePreferences, sourceServerUpdateKey } from "@/lib/sourceServerUpdatePreferences.js";
import {
  getSourceMigrationPhaseMessageId,
  getSourceMigrationStatusMessageId,
} from "@/settings/sourceServerManagementPresentation.js";
import { buildRemoteConnectionProgress } from "@/remote-connection-flow/ui/RemoteConnectionProgress.js";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

it("更新偏好使用 kayingcode 前缀持久去重，defer 只影响当前运行", () => {
  const storage = createMemoryStorage();
  const preferences = createSourceServerUpdatePreferences(storage);
  const key = sourceServerUpdateKey("source-1", "1.2.3");

  expect(preferences.hasSeen(key)).toBe(false);
  preferences.markSeen(key);
  expect(preferences.hasSeen(key)).toBe(true);
  // 新实例从同一 storage 恢复持久去重。
  expect(createSourceServerUpdatePreferences(storage).hasSeen(key)).toBe(true);
  expect([...storage.values.keys()]).toEqual(["kayingcode-source-update-notifications-v1"]);

  let notifications = 0;
  const unsubscribe = preferences.subscribe(() => {
    notifications += 1;
  });
  preferences.defer(key);
  expect(preferences.isDeferred(key)).toBe(true);
  expect(notifications).toBe(1);
  // 稍后提示不持久化：重新创建实例后恢复为未延后。
  expect(createSourceServerUpdatePreferences(storage).isDeferred(key)).toBe(false);
  unsubscribe();
});

it("迁移状态与阶段只映射到稳定的设置页文案 id", () => {
  expect(getSourceMigrationStatusMessageId("abandoned-diverged")).toBe(
    "settings.source.migrationStatus.abandonedDiverged",
  );
  expect(getSourceMigrationPhaseMessageId("session-db-merged")).toBe(
    "settings.source.migrationPhase.sessionDbMerged",
  );
  // 未知阶段必须返回 null，让调用方回退到“详情不可用”，而不是渲染原始 phase。
  expect(getSourceMigrationPhaseMessageId("unknown-phase")).toBeNull();
});

const profile: ConnectionProfile = {
  profileId: "11111111-1111-4111-8111-111111111111",
  sourceServerId: "22222222-2222-4222-8222-222222222222",
  transport: "ssh",
  target: { kind: "ssh", host: "example.test", port: 22, username: "dev" },
  createdAt: 1,
  lifecycleState: "active",
};

function state(
  value: SourceServerConnectionStateSnapshot["state"],
): SourceServerConnectionStateSnapshot {
  return {
    profileId: profile.profileId,
    sourceServerId: profile.sourceServerId,
    state: value,
    updatedAt: 1,
  };
}

it("只有进行中的连接状态才生成进度，终态由状态标签负责", () => {
  const connecting = buildRemoteConnectionProgress({
    profile,
    state: state("bootstrapping"),
    server: {
      sourceServerId: "22222222-2222-4222-8222-222222222222",
      displayName: "Build box",
      installState: "installed",
      declaredWorkspaces: [],
    },
    logs: [],
  });
  expect(connecting).toMatchObject({
    profileId: profile.profileId,
    sourceServerId: profile.sourceServerId,
    name: "Build box",
    state: "bootstrapping",
  });

  expect(buildRemoteConnectionProgress({ profile, state: state("online"), logs: [] })).toBeNull();
  expect(buildRemoteConnectionProgress({ profile, state: undefined, logs: [] })).toBeNull();
});
