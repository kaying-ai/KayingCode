import { describe, expect, it } from "vitest";
import {
  buildRemoteConnectFailure,
  readProfileId,
  resolveRemoteConnectRetryAction,
  resolveRetryTarget,
} from "@/lib/remoteConnectFailure.js";

describe("buildRemoteConnectFailure", () => {
  it("保留 Host 的稳定错误码与 profileId，供安装/升级确认使用", () => {
    const failure = buildRemoteConnectFailure(
      {
        error: "Source Server installation requires explicit user confirmation",
        reasonCode: "source-server-install-required",
        profileId: "profile-1",
      },
      "Connection failed",
    );
    expect(failure.message).toContain("installation");
    expect(failure.code).toBe("source-server-install-required");
    expect(readProfileId(failure)).toBe("profile-1");
  });

  it("无错误详情时回退到调用方文案且不伪造 code", () => {
    const failure = buildRemoteConnectFailure({}, "Connection failed");
    expect(failure.message).toBe("Connection failed");
    expect(failure.code).toBeUndefined();
    expect(readProfileId(failure)).toBeUndefined();
  });
});

describe("resolveRemoteConnectRetryAction", () => {
  it("只按错误码判定，不解析 message 文案", () => {
    expect(
      resolveRemoteConnectRetryAction(
        buildRemoteConnectFailure({ reasonCode: "source-server-install-required" }, "x"),
      ),
    ).toEqual({ kind: "install" });
    expect(
      resolveRemoteConnectRetryAction(
        buildRemoteConnectFailure({ reasonCode: "source-server-upgrade-required" }, "x"),
      ),
    ).toEqual({ kind: "upgrade", target: "server" });
    expect(
      resolveRemoteConnectRetryAction(
        buildRemoteConnectFailure({ reasonCode: "source-server-identity-change-pending" }, "x"),
      ),
    ).toEqual({ kind: "confirm-identity" });
  });

  it("普通连接失败与认证失败不提供重试动作", () => {
    expect(resolveRemoteConnectRetryAction(new Error("dial tcp timeout"))).toBeNull();
    expect(
      resolveRemoteConnectRetryAction(
        buildRemoteConnectFailure({ reasonCode: "credentials" }, "x"),
      ),
    ).toBeNull();
  });
});

describe("resolveRetryTarget", () => {
  const wslTarget = { kind: "wsl" as const, distro: "Ubuntu-22.04" };
  const resolved = { kind: "wsl" as const, distro: "Ubuntu-22.04", user: "root" };

  it("WSL 使用 Host 已解析身份，避免用户默认值覆盖真实目标", () => {
    const failure = buildRemoteConnectFailure(
      { reasonCode: "source-server-install-required", resolvedWslTarget: resolved },
      "x",
    );
    expect(resolveRetryTarget(wslTarget, failure)).toEqual(resolved);
  });

  it("非 WSL 目标或缺少解析结果时保持原目标", () => {
    const sshTarget = { kind: "ssh" as const, host: "example.com", user: "root", port: 22 };
    expect(
      resolveRetryTarget(
        sshTarget,
        buildRemoteConnectFailure({ reasonCode: "source-server-install-required" }, "x"),
      ),
    ).toBe(sshTarget);
    expect(resolveRetryTarget(wslTarget, new Error("x"))).toBe(wslTarget);
  });
});
