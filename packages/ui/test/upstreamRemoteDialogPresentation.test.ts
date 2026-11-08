import { describe, expect, it } from "vitest";
import {
  isSameWebRemoteControlTarget,
  isReusableWebRemoteControlSession,
  isSameWebRemoteControlStatus,
} from "@/web-remote-control/domain/presentation.js";
describe("upstream remote dialog ownership", () => {
  it("does not confuse equal paths on different remote identities", () => {
    const status = {
      status: "running" as const,
      sessionId: "window-device",
      workspacePath: "/project",
      workspaceIdentity: "source-a",
      remoteSessionId: "remote-a",
    };
    expect(isSameWebRemoteControlTarget(status, "/project", "source-b", "remote-b")).toBe(false);
    expect(isSameWebRemoteControlTarget(status, "/project", "source-a", "remote-a")).toBe(true);
  });
  it("keeps an attached phone alive when the desktop opens another workspace", () => {
    const status = {
      status: "active" as const,
      windowControlSessionId: "existing-window",
      mobileConnected: true,
      workspacePath: "/old",
    };
    expect(isSameWebRemoteControlTarget(status, "/other")).toBe(false);
    expect(isReusableWebRemoteControlSession(status)).toBe(true);
    expect(
      isReusableWebRemoteControlSession({ ...status, status: "running", mobileConnected: false }),
    ).toBe(false);
  });
  it("refreshing an invitation changes the projection even if the device and runtime status are unchanged", () => {
    const status = {
      status: "running" as const,
      sessionId: "same-device",
      qrUrl: "https://relay.example/first",
      connectUrl: "https://relay.example/first",
    };
    expect(isSameWebRemoteControlStatus(status, { ...status })).toBe(true);
    expect(
      isSameWebRemoteControlStatus(status, {
        ...status,
        qrUrl: "https://relay.example/second",
        connectUrl: "https://relay.example/second",
      }),
    ).toBe(false);
  });
});
