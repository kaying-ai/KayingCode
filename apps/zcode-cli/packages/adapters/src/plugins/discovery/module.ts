export const pluginDiscoveryModule = {
  id: "plugin-discovery",
  requires: ["kayingcode-cli", "shared"],
  provides: ["plugin-discovery"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
