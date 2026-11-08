import { describe, expect, it } from "vitest";
import { buildRemoteConnectFailurePayload } from "../src/host/remoteConnectFailurePayload.js";

describe("buildRemoteConnectFailurePayload", () => {
  it("转发稳定错误码、retryable 与 profileId", () => {
    const payload = buildRemoteConnectFailurePayload(
      Object.assign(new Error("Source Server installation requires confirmation"), {
        code: "source-server-install-required",
        retryable: false,
        profileId: "1d0a2b3c-4d5e-4f60-8182-93a4b5c6d7e8",
      }),
    );
    expect(payload).toEqual({
      reasonCode: "source-server-install-required",
      retryable: false,
      profileId: "1d0a2b3c-4d5e-4f60-8182-93a4b5c6d7e8",
    });
  });

  it("只在 WSL 目标字段完整时附带 resolvedWslTarget", () => {
    const valid = buildRemoteConnectFailurePayload({
      code: "source-server-install-required",
      resolvedWslTarget: { kind: "wsl", distro: "Ubuntu-22.04", user: "root" },
    });
    expect(valid.resolvedWslTarget).toEqual({
      kind: "wsl",
      distro: "Ubuntu-22.04",
      user: "root",
    });

    // schema 要求 user 非空；不完整的解析结果会让整条失败消息被丢弃。
    const missingUser = buildRemoteConnectFailurePayload({
      resolvedWslTarget: { kind: "wsl", distro: "Ubuntu-22.04" },
    });
    expect(missingUser.resolvedWslTarget).toBeUndefined();
    expect(buildRemoteConnectFailurePayload(new Error("dial timeout"))).toEqual({});
  });
});
