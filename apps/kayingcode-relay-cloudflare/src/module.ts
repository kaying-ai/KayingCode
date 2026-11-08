export const relayCloudflareModule = {
  id: "relay-cloudflare",
  requires: ["shared"],
  provides: ["mobile-access-relay-cloudflare"],
  publicEntrypoints: ["contract.ts"],
} as const;
