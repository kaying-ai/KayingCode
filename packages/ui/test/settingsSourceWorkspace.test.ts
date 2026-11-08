import { expect, it } from "vitest";
import {
  buildSourceSettingsProjectionKey,
  filterWorkspaceTabsForSettingsSource,
  resolveEffectiveSettingsSourceServerId,
  resolveSettingsSourceServerSelection,
  resolveSourceSettingsValue,
  workspaceBelongsToSettingsSource,
} from "@/settings/settingsSourceWorkspace.js";

const serverIdentity = "remote:server:owner:/repo";
const otherServerIdentity = "remote:server:other:/repo";
const sshIdentity = "remote:ssh:host:22:user:/repo";

it("本地 Source 只包含无远程身份的目录，远端 Source 按 server id 精确匹配", () => {
  const tabs = [
    { workspaceIdentity: undefined },
    { workspaceIdentity: sshIdentity },
    { workspaceIdentity: serverIdentity },
    { workspaceIdentity: otherServerIdentity },
  ];
  expect(filterWorkspaceTabsForSettingsSource(tabs, null)).toEqual([
    { workspaceIdentity: undefined },
  ]);
  expect(filterWorkspaceTabsForSettingsSource(tabs, "owner")).toEqual([
    { workspaceIdentity: serverIdentity },
  ]);
  expect(workspaceBelongsToSettingsSource({ workspaceIdentity: sshIdentity }, "owner")).toBe(false);
});

it("显式本机跳转（pending null）不会被旧远端偏好覆盖", () => {
  expect(
    resolveSettingsSourceServerSelection({
      pendingTarget: { sourceServerId: null },
      persistedSourceServerId: "owner",
      sourceServerIds: ["owner"],
    }),
  ).toBeNull();
  expect(
    resolveSettingsSourceServerSelection({
      pendingTarget: undefined,
      persistedSourceServerId: "owner",
      sourceServerIds: ["owner"],
    }),
  ).toBe("owner");
  expect(
    resolveSettingsSourceServerSelection({
      pendingTarget: { sourceServerId: "gone" },
      persistedSourceServerId: "owner",
      sourceServerIds: ["owner"],
    }),
  ).toBeNull();
});

it("投影 key 带 Source authority 时与同路径的其他 Host 隔离", () => {
  expect(buildSourceSettingsProjectionKey("/repo", undefined, "source-settings:owner")).toBe(
    "source-settings:owner\0/repo",
  );
  expect(buildSourceSettingsProjectionKey("/repo")).toBe("/repo");
  expect(resolveSourceSettingsValue({ sourceServerId: "owner", value: 1 }, "other")).toBeNull();
  expect(resolveSourceSettingsValue({ sourceServerId: "owner", value: 1 }, "owner")).toBe(1);
});

it("设置页选择器覆盖显式 Source，显式本机 null 不被折叠", () => {
  expect(
    resolveEffectiveSettingsSourceServerId({
      explicitSourceServerId: "owner",
      selectionOverride: undefined,
    }),
  ).toBe("owner");
  expect(
    resolveEffectiveSettingsSourceServerId({
      explicitSourceServerId: "owner",
      selectionOverride: "other",
    }),
  ).toBe("other");
  expect(
    resolveEffectiveSettingsSourceServerId({
      explicitSourceServerId: "owner",
      selectionOverride: null,
    }),
  ).toBeNull();
});
