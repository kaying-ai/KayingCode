import { describe, expect, it } from "vitest";
import enUS from "../src/i18n/locales/en-US.js";
import zhCN from "../src/i18n/locales/zh-CN.js";

function voiceKeys(locale: Record<string, string>) {
  return Object.keys(locale)
    .filter((key) => key.startsWith("voiceInput."))
    .sort();
}

describe("voice input i18n", () => {
  it("has the same voice-input keys in English and Chinese", () => {
    expect(voiceKeys(zhCN)).toEqual(voiceKeys(enUS));
    expect(voiceKeys(enUS).length).toBeGreaterThan(20);
  });

  it("ships the shortcut settings label used by the shortcut list", () => {
    expect(enUS["settings.shortcuts.command.toggleVoiceInput"]).toBeTruthy();
    expect(zhCN["settings.shortcuts.command.toggleVoiceInput"]).toBeTruthy();
  });

  it("uses the product brand in the voice-input copy", () => {
    for (const locale of [enUS, zhCN]) {
      for (const key of voiceKeys(locale)) {
        expect(locale[key], key).not.toMatch(/\bZCode\b/);
      }
    }
  });
});
