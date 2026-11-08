import { describe, expect, it } from "vitest";
import { LOCALRUN_FEATURES } from "@zcode/shared";
import { resolveRemoteOperationProgress } from "@/project-sidebar/remoteOperationProgress.js";
import { remoteHostLabel } from "@/project-sidebar/RemoteHostSection.js";
import type { RemoteProjectHost } from "@/project-sidebar/contract.js";

/**
 * 项目侧栏采纳批次的行为验收：
 * - 连接阶段投影只在有进行中日志时显示进度；
 * - 远程设备名同时支持受管 server 快照与本地 Remote Agent 变体；
 * - 官方能力开关默认关闭（PRODUCT_BOUNDARY.md §1）。
 */
describe("project-sidebar adoption", () => {
  it("keeps phase projection empty when the last operation already finished", () => {
    const finished = resolveRemoteOperationProgress([
      { phase: "channel", progress: undefined, timestamp: 1_000, level: "info" },
      { phase: "ready", progress: undefined, timestamp: 2_000, level: "info" },
    ]);
    expect(finished.index).toBe(0);
    expect(finished.titleId).toBe("remote.phase.channel");
    expect(finished.startedAt).toBeUndefined();
    expect(finished.total).toBe(4);
  });

  it("projects deploy transfer progress from the latest log", () => {
    const progress = resolveRemoteOperationProgress([
      { phase: "channel", progress: undefined, timestamp: 1_000, level: "info" },
      { phase: "upload", progress: 0.42, timestamp: 3_000, level: "info" },
    ]);
    expect(progress.index).toBe(2);
    expect(progress.titleId).toBe("remote.phase.deploy");
    expect(progress.percent).toBe(42);
    expect(progress.startedAt).toBe(1_000);
  });

  it("labels managed server and Remote Agent hosts without leaking credentials", () => {
    const base = {
      id: "host-1",
      membershipId: "membership-1",
      position: 0,
    } satisfies Partial<RemoteProjectHost>;
    expect(
      remoteHostLabel({
        ...base,
        kind: "server",
        target: { kind: "server", url: "https://example.com", name: "Build Box" },
      } as RemoteProjectHost),
    ).toBe("Build Box");
    expect(
      remoteHostLabel({
        ...base,
        kind: "server",
        target: {
          kind: "server",
          transport: "ssh-tunnel",
          serverId: "server-1",
          serverName: "Tunnel Box",
          ssh: { host: "10.0.0.1", username: "dev" },
        },
      } as RemoteProjectHost),
    ).toBe("Tunnel Box");
  });

  it("keeps official localrun capabilities disabled", () => {
    expect(LOCALRUN_FEATURES.codingPlan).toBe(false);
    expect(LOCALRUN_FEATURES.rewards).toBe(false);
    expect(LOCALRUN_FEATURES.officialMarketplace).toBe(false);
    expect(LOCALRUN_FEATURES.officialTelemetry).toBe(false);
    expect(LOCALRUN_FEATURES.oauthLogin).toBe(false);
  });
});
