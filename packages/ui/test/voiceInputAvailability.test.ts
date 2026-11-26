import { describe, expect, it } from "vitest";
import { isVoiceInputAvailable } from "../src/voice-input/domain/voiceInputAvailability.js";

const microphone = {
  ensureAccess: async () => "granted" as const,
  resetAccess: async () => "granted" as const,
  openSettings: async () => true,
};

describe("isVoiceInputAvailable", () => {
  it("hides voice input when the platform has no microphone capability", () => {
    expect(
      isVoiceInputAvailable({
        enabled: true,
        microphone: undefined,
        serviceAvailable: true,
        isLoggedIn: true,
      }),
    ).toBe(false);
  });

  it("shows voice input only when enabled, logged in, service and platform capability exist", () => {
    expect(
      isVoiceInputAvailable({
        enabled: true,
        microphone,
        serviceAvailable: true,
        isLoggedIn: true,
      }),
    ).toBe(true);
  });

  it("stays hidden without the host voice-input service or login", () => {
    const base = { enabled: true, microphone, isLoggedIn: true };
    expect(isVoiceInputAvailable({ ...base, serviceAvailable: false })).toBe(false);
    expect(isVoiceInputAvailable({ ...base, serviceAvailable: true, isLoggedIn: false })).toBe(
      false,
    );
    expect(
      isVoiceInputAvailable({
        enabled: false,
        microphone,
        serviceAvailable: true,
        isLoggedIn: true,
      }),
    ).toBe(false);
  });
});
