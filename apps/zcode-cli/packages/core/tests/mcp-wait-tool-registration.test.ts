import { expect, it } from "vitest";
import type { ToolEntry } from "../src/tool/types.js";
import { registerBuiltInTools } from "../src/tool/handlers/index.js";

it("registers WaitForMcpServers only when the session provides an MCP port", () => {
  const names: string[] = [];
  const registry = {
    register(entry: ToolEntry) {
      names.push(entry.metadata.name);
    },
  };

  registerBuiltInTools(registry);
  expect(names).not.toContain("WaitForMcpServers");

  names.length = 0;
  registerBuiltInTools(registry, { includeWaitForMcpServers: true });
  expect(names).toContain("WaitForMcpServers");
});
