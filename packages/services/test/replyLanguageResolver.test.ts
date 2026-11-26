import { describe, expect, it, vi } from "vitest";
import { createSettingServiceReplyLanguageResolver } from "../src/kayingcode-agent/replyLanguage.js";

describe("createSettingServiceReplyLanguageResolver", () => {
  it("reads the Host Setting reply language on demand", async () => {
    const get = vi.fn(async () => ({ replyLanguage: "简体中文" }));
    const resolver = createSettingServiceReplyLanguageResolver({ get });

    await expect(resolver()).resolves.toBe("简体中文");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("answers null instead of inventing a default language", async () => {
    const resolver = createSettingServiceReplyLanguageResolver({
      get: async () => ({}),
    });

    await expect(resolver()).resolves.toBeNull();
  });

  it("propagates read failures so the CLI can skip the turn", async () => {
    const resolver = createSettingServiceReplyLanguageResolver({
      get: async () => {
        throw new Error("setting.json unreadable");
      },
    });

    await expect(resolver()).rejects.toThrow("setting.json unreadable");
  });
});
