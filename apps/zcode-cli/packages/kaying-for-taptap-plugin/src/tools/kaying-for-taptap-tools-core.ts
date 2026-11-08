/** Stable public Agent tool contract for the KayingForTaptap plugin. */

export const KAYING_FOR_TAPTAP_PUBLIC_TOOL_NAMES = [
  "kaying-for-taptap_project",
  "kaying-for-taptap_doctor",
  "kaying-for-taptap_game_command",
  "kaying-for-taptap_publish",
  "kaying-for-taptap_transcription",
] as const;

export type KayingForTaptapPublicToolName = (typeof KAYING_FOR_TAPTAP_PUBLIC_TOOL_NAMES)[number];
