/** Public KayingForTaptap tool objects in the same order as the shared contract. */

import { doctorTool, gameCommandTool } from "./agent-tools";
import { projectTool, publishTool } from "./high-level-tools";
import { KAYING_FOR_TAPTAP_PUBLIC_TOOL_NAMES } from "./kaying-for-taptap-tools-core";
import { transcriptionTool } from "./transcription-cli";
import type { KayingForTaptapTool } from "./tool-types";

const TOOL_BY_NAME = new Map<string, KayingForTaptapTool>(
  [projectTool, doctorTool, gameCommandTool, publishTool, transcriptionTool].map((tool) => [
    tool.name,
    tool,
  ]),
);

export const KAYING_FOR_TAPTAP_PUBLIC_TOOLS = KAYING_FOR_TAPTAP_PUBLIC_TOOL_NAMES.map((name) => {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) throw new Error(`Missing public KayingForTaptap tool implementation: ${name}`);
  return tool;
});
