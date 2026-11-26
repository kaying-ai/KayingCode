/**
 * voice-input 模块清单（architecture-governance managed 模块）。
 * 层：contract < domain（失败分类与可用性纯函数）< adapters（麦克风 PCM 采集）< ui（hook 与组件）。
 */
export const voiceInputModule = {
  id: "voice-input",
  requires: ["services", "shared", "ui", "shortcuts"],
  provides: ["voice-input"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
