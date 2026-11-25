import { describe, expect, it, vi } from "vitest";
import type { PluginSandboxRecord } from "../src/main/pluginSandbox/contract.js";
import {
  buildPluginSandboxPluginOrigin,
  buildPluginSandboxShellUrl,
} from "../src/main/pluginSandbox/contract.js";
import { createPluginSandboxPermissionGate } from "../src/main/pluginSandbox/permissionGate.js";

const APP_IDENTITY = "a".repeat(64);
const SANDBOX_ID = "sandbox-1";

function createRecord(permissions: PluginSandboxRecord["permissions"]): PluginSandboxRecord {
  return {
    instance: {
      runtimeId: "runtime-1",
      generation: 1,
      appIdentity: APP_IDENTITY,
      token: "token",
    },
    sandboxId: SANDBOX_ID,
    initId: 1,
    shellUrl: buildPluginSandboxShellUrl(SANDBOX_ID, APP_IDENTITY),
    partition: "persist:plugin-sandbox-v2-test",
    permissions,
    prefersBorder: false,
    ownerWebContentsId: 1,
    scopeId: "scope",
    html: "<html></html>",
    cspHeader: "",
  };
}

function createGate(options: { promptAllowed: boolean; systemAllowed: boolean }) {
  const record = createRecord(["microphone"]);
  const prompt = vi.fn(async () => options.promptAllowed);
  const requestSystemMediaAccess = vi.fn(async () => options.systemAllowed);
  const gate = createPluginSandboxPermissionGate({
    registry: { get: (sandboxId) => (sandboxId === SANDBOX_ID ? record : null) },
    prompt,
    requestSystemMediaAccess,
  });
  return {
    gate,
    prompt,
    requestSystemMediaAccess,
    request: () =>
      gate.request({
        permission: "media",
        mediaTypes: ["audio"],
        requestingUrl: buildPluginSandboxPluginOrigin(APP_IDENTITY),
        guestUrl: record.shellUrl,
        isCurrent: () => true,
      }),
    check: () =>
      gate.check({
        permission: "media",
        mediaType: "audio",
        requestingOrigin: buildPluginSandboxPluginOrigin(APP_IDENTITY),
        guestUrl: record.shellUrl,
      }),
  };
}

describe("plugin sandbox microphone permission gate", () => {
  it("prompts once, asks the OS for microphone access, and records consent", async () => {
    const { prompt, requestSystemMediaAccess, request, check } = createGate({
      promptAllowed: true,
      systemAllowed: true,
    });

    await expect(request()).resolves.toBe(true);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt.mock.calls[0]?.[0]).toMatchObject({ permissions: ["microphone"] });
    expect(requestSystemMediaAccess).toHaveBeenCalledWith("microphone");
    expect(check()).toBe(true);

    // 已同意后再次请求不再弹框，但系统授权仍要复核。
    await expect(request()).resolves.toBe(true);
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("denies without consent record when the OS denies microphone access", async () => {
    const { request, check, prompt } = createGate({ promptAllowed: true, systemAllowed: false });

    await expect(request()).resolves.toBe(false);
    expect(prompt).toHaveBeenCalledTimes(1);
    // 系统授权失败不写同意记录，同步查询仍拒绝。
    expect(check()).toBe(false);
  });

  it("denies undeclared microphone requests before prompting or asking the OS", async () => {
    const record = createRecord([]);
    const prompt = vi.fn(async () => true);
    const requestSystemMediaAccess = vi.fn(async () => true);
    const gate = createPluginSandboxPermissionGate({
      registry: { get: () => record },
      prompt,
      requestSystemMediaAccess,
    });

    await expect(
      gate.request({
        permission: "media",
        mediaTypes: ["audio"],
        requestingUrl: buildPluginSandboxPluginOrigin(APP_IDENTITY),
        guestUrl: record.shellUrl,
        isCurrent: () => true,
      }),
    ).resolves.toBe(false);
    expect(prompt).not.toHaveBeenCalled();
    expect(requestSystemMediaAccess).not.toHaveBeenCalled();
  });

  it("denies when the requesting page is no longer current", async () => {
    const { gate, prompt } = createGate({ promptAllowed: true, systemAllowed: true });
    const record = createRecord(["microphone"]);
    await expect(
      gate.request({
        permission: "media",
        mediaTypes: ["audio"],
        requestingUrl: buildPluginSandboxPluginOrigin(APP_IDENTITY),
        guestUrl: record.shellUrl,
        isCurrent: () => false,
      }),
    ).resolves.toBe(false);
    expect(prompt).not.toHaveBeenCalled();
  });
});
