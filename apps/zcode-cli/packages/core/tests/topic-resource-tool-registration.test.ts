import { expect, it } from "vitest";
import type { ToolEntry } from "../src/tool/types.js";
import { registerBuiltInTools } from "../src/tool/handlers/index.js";

it("registers ReadTopicResource only when the runtime provides the topic resource port", () => {
  const names: string[] = [];
  const registry = {
    register(entry: ToolEntry) {
      names.push(entry.metadata.name);
    },
  };

  registerBuiltInTools(registry);
  expect(names).not.toContain("ReadTopicResource");

  names.length = 0;
  registerBuiltInTools(registry, { includeTopicResource: true });
  expect(names).toContain("ReadTopicResource");
});
