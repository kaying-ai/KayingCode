/**
 * desktop-microphone-access 模块清单（architecture-governance managed 模块）。
 * 层：adapters。
 */
export const desktopMicrophoneAccessModule = {
  id: "desktop-microphone-access",
  requires: ["shared"],
  provides: ["desktop-microphone-access"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
