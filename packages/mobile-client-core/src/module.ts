export const mobileClientCoreModule = {
  id: "mobile-client-core",
  requires: ["shared", "client", "services"],
  provides: ["mobile-client-core"],
  publicEntrypoints: ["contract.ts"],
} as const;
