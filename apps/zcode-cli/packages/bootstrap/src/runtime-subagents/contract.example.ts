import type { RuntimeSubagentConfiguration } from "./contract.js";
export const exampleSubagentConfiguration: RuntimeSubagentConfiguration = {
  documents: [
    {
      path: "/project/.kayingcode/agents/review.md",
      source: "project",
      namespace: "tools",
      content: "---\nname: review\ndescription: Review\n---\nReview the code",
    },
  ],
  state: {
    disabledAgentIds: [],
    builtInModelSelectionOverrides: {},
    pluginAgentModelSelectionOverrides: {},
  },
};
