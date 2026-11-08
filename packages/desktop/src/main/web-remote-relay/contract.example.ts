import type { WebRemoteControlDeviceStorage } from "#src/main/web-remote-relay/contract.js";
export async function restoreRegisteredDevice(storage: WebRemoteControlDeviceStorage) {
  return storage.load();
}
