import { describe, expect, it } from "vitest";
import {
  PlatformChannels,
  ServiceChannels,
  SHORTCUT_COMMANDS,
  getDefaultShortcutBindings,
  type IPlatformService,
} from "@zcode/shared";

describe("voice input shared contract", () => {
  it("uses the product IPC prefix and distinct microphone channels", () => {
    expect(PlatformChannels.MicrophoneAccess).toBe("kayingcode:microphone-access");
    expect(PlatformChannels.ResetMicrophoneAccess).toBe("kayingcode:reset-microphone-access");
    expect(PlatformChannels.OpenMicrophoneSettings).toBe("kayingcode:open-microphone-settings");
    for (const channel of [
      PlatformChannels.MicrophoneAccess,
      PlatformChannels.ResetMicrophoneAccess,
      PlatformChannels.OpenMicrophoneSettings,
    ]) {
      expect(channel.startsWith("kayingcode:")).toBe(true);
    }
  });

  it("exposes the host voice-input service channel for the future Host service", () => {
    expect(ServiceChannels.VoiceInput).toBe("voice-input");
  });

  it("registers toggleVoiceInput on the window channel with the upstream default binding", () => {
    const entry = SHORTCUT_COMMANDS.find((command) => command.id === "toggleVoiceInput");
    expect(entry).toBeDefined();
    expect(entry?.channel).toBe("window");
    expect(entry?.scope).toBeUndefined();
    expect(entry?.defaultBindings).toEqual(["CmdOrCtrl+Shift+d"]);
    expect(getDefaultShortcutBindings("toggleVoiceInput")).toEqual(["CmdOrCtrl+Shift+d"]);
  });

  it("keeps microphone optional so Web, mobile and old hosts degrade", () => {
    // 可选能力：仅实现 selectDirectory 的最小对象也能满足只有 microphone 的 Pick 形状。
    const withoutMicrophone: Pick<IPlatformService, "microphone"> = {};
    expect(withoutMicrophone.microphone).toBeUndefined();
  });
});
