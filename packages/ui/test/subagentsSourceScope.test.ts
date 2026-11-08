import { describe, expect, it } from "vitest";
import {
  hasRemoteSubagentsSource,
  resolveSubagentsSourceScope,
} from "../src/settings/subagentsSourceScope.js";

describe("resolveSubagentsSourceScope", () => {
  it("未传来源时保持本机 user scope 行为", () => {
    const scope = resolveSubagentsSourceScope({});
    expect(scope.isRemoteSourceSettings).toBe(false);
    expect(scope.remoteSourceServerId).toBeUndefined();
    expect(scope.targetWorkspacePath).toBe("");
    expect(scope.activeScope).toBe("user");
    expect(scope.syncMentionProjection).toBe(true);
    expect(scope.syncPluginInventory).toBe(true);
  });

  it("本机选中 workspace 时进入 workspace scope", () => {
    const scope = resolveSubagentsSourceScope({
      settingsSourceServerId: null,
      selectedWorkspacePath: "/Users/feng/codes/demo",
    });
    expect(scope.isRemoteSourceSettings).toBe(false);
    expect(scope.targetWorkspacePath).toBe("/Users/feng/codes/demo");
    expect(scope.activeScope).toBe("workspace");
  });

  it("远端 Source 使用 /<id> 锚点并强制 user scope", () => {
    const scope = resolveSubagentsSourceScope({
      settingsSourceServerId: "src-abc",
      selectedWorkspacePath: "/Users/feng/codes/demo",
    });
    expect(scope.isRemoteSourceSettings).toBe(true);
    expect(scope.remoteSourceServerId).toBe("src-abc");
    expect(scope.targetWorkspacePath).toBe("/src-abc");
    // Source scope 不写本机投影，也不初始化插件 inventory。
    expect(scope.syncMentionProjection).toBe(false);
    expect(scope.syncPluginInventory).toBe(false);
    expect(scope.activeScope).toBe("user");
  });

  it("空白来源 id 不生成裸锚点", () => {
    for (const id of ["", "   "]) {
      const scope = resolveSubagentsSourceScope({ settingsSourceServerId: id });
      expect(scope.isRemoteSourceSettings).toBe(false);
      expect(scope.targetWorkspacePath).toBe("");
      expect(hasRemoteSubagentsSource(id)).toBe(false);
    }
  });

  it("来源 id 会去掉首尾空白", () => {
    const scope = resolveSubagentsSourceScope({ settingsSourceServerId: "  src-abc  " });
    expect(scope.remoteSourceServerId).toBe("src-abc");
    expect(scope.targetWorkspacePath).toBe("/src-abc");
    expect(hasRemoteSubagentsSource("src-abc")).toBe(true);
  });
});
