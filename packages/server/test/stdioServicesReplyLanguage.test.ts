import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => {
  const settingGet = vi.fn();
  return {
    settingGet,
    settingService: { get: settingGet },
    prepareLegacyAccountConnections: vi.fn(async () => []),
    createLocalServices: vi.fn((options: Record<string, unknown>) => ({ options })),
    createSettingServiceWithMigrations: vi.fn(),
  };
});

vi.mock("@zcode/services/node", () => ({
  createLocalServices: host.createLocalServices,
  getAppConfigDir: () => "/tmp/kayingcode-stdio-services-test",
  createSettingServiceWithMigrations: host.createSettingServiceWithMigrations,
  // 与 packages/services 的实现同口径：本 Host Setting 未设置时回答 null。
  createSettingServiceReplyLanguageResolver:
    (settingService: { get(): Promise<{ replyLanguage?: string }> }) => async () =>
      (await settingService.get()).replyLanguage ?? null,
}));

vi.mock("@zcode/shared/credential-security", () => ({
  createServerCredentialCipher: vi.fn(async () => undefined),
}));

const { createStdioServices } = await import("../src/stdioServices.js");

function localServicesOptions(): Record<string, unknown> {
  const call = host.createLocalServices.mock.calls.at(-1);
  if (!call) throw new Error("createLocalServices was not called");
  return call[0] as Record<string, unknown>;
}

describe("remote stdio Host reply language", () => {
  beforeEach(() => {
    host.settingGet.mockReset();
    host.prepareLegacyAccountConnections.mockClear();
    host.createLocalServices.mockClear();
    host.createSettingServiceWithMigrations.mockReset();
    host.createSettingServiceWithMigrations.mockReturnValue({
      service: host.settingService,
      prepareLegacyAccountConnections: host.prepareLegacyAccountConnections,
    });
  });

  it("injects a Setting-backed resolver and the same Setting instance", async () => {
    host.settingGet.mockResolvedValue({ replyLanguage: "简体中文" });

    await createStdioServices({
      env: {},
      kayingcodeBuiltinProviderConfigFilePath: "/tmp/kayingcode-builtin.json",
    });

    const options = localServicesOptions();
    expect(options["settingService"]).toBe(host.settingService);
    expect(options["prepareLegacyAccountConnections"]).toBe(host.prepareLegacyAccountConnections);
    const resolver = options["resolveReplyLanguage"];
    expect(resolver).toBeTypeOf("function");
    await expect((resolver as () => Promise<string | null>)()).resolves.toBe("简体中文");
  });

  it("keeps answering null when the Host Setting has no reply language", async () => {
    host.settingGet.mockResolvedValue({});

    await createStdioServices({
      env: {},
      kayingcodeBuiltinProviderConfigFilePath: "/tmp/kayingcode-builtin.json",
    });

    const resolver = localServicesOptions()["resolveReplyLanguage"] as () => Promise<string | null>;
    await expect(resolver()).resolves.toBeNull();
  });

  it("forwards an explicitly injected resolver without replacing it", async () => {
    const injected = () => "日本語";

    await createStdioServices({
      env: {},
      kayingcodeBuiltinProviderConfigFilePath: "/tmp/kayingcode-builtin.json",
      resolveReplyLanguage: injected,
    });

    expect(localServicesOptions()["resolveReplyLanguage"]).toBe(injected);
    // 显式注入时不应额外读取 Setting。
    expect(host.settingGet).not.toHaveBeenCalled();
  });
});
