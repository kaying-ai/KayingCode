import { expect, it } from "vitest";
import { buildSourceSettingsProjectionKey } from "@/settings/settingsSourceWorkspace.js";

it("同一路径在不同 Source authority 下得到不同投影 key", () => {
  const localKey = buildSourceSettingsProjectionKey("/repo");
  const ownerKey = buildSourceSettingsProjectionKey("/repo", undefined, "source-settings:owner");
  const otherKey = buildSourceSettingsProjectionKey("/repo", undefined, "source-settings:other");

  expect(ownerKey).toBe("source-settings:owner\0/repo");
  expect(ownerKey).not.toBe(otherKey);
  expect(ownerKey).not.toBe(localKey);
  expect(otherKey).not.toBe(localKey);
});

it("undefined authority 保持接入前的旧 key（identity 优先，回退 path）", () => {
  expect(buildSourceSettingsProjectionKey("/repo", undefined, undefined)).toBe("/repo");
  expect(buildSourceSettingsProjectionKey("/repo", "  ", undefined)).toBe("/repo");
  expect(buildSourceSettingsProjectionKey("/repo", "remote:server:owner:/repo")).toBe(
    "remote:server:owner:/repo",
  );
  expect(buildSourceSettingsProjectionKey(undefined, undefined, undefined)).toBe("");
});

it("MCP active key 与 store key 在同一 authority+target 下相等，缺省 authority 时互不复用", () => {
  const authority = "source-settings:owner";
  const anchorPath = "/owner";
  const activeKey = buildSourceSettingsProjectionKey(anchorPath, undefined, authority);
  const storeKey = buildSourceSettingsProjectionKey(anchorPath, undefined, authority);
  const localStoreKey = buildSourceSettingsProjectionKey(anchorPath, undefined, undefined);

  expect(storeKey).toBe(activeKey);
  expect(localStoreKey).not.toBe(activeKey);
  // 同路径的另一个 Source 也不能命中 owner 的 store key。
  expect(buildSourceSettingsProjectionKey(anchorPath, undefined, "source-settings:other")).not.toBe(
    activeKey,
  );
});
