import type { AppSettings } from "@zcode/shared";
import type { WebRemoteControlDeviceStorage } from "#src/main/web-remote-relay/contract.js";

export function createWebRemoteControlDeviceStorage(dependencies: {
  loadSettings(): Promise<AppSettings>;
  patchSettings(patch: Partial<AppSettings>): Promise<void>;
}): WebRemoteControlDeviceStorage {
  return {
    load: async () => (await dependencies.loadSettings()).webRemoteControlRelayV2Device,
    save: (device) => dependencies.patchSettings({ webRemoteControlRelayV2Device: device }),
  };
}
