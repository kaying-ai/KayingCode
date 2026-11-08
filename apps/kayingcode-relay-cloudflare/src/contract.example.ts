import type { RelayCloudflareEnv } from "./contract.js";
export function relayCloudflareHasStorage(env: RelayCloudflareEnv): boolean {
  return typeof env.WEB_REMOTE.idFromName === "function";
}
