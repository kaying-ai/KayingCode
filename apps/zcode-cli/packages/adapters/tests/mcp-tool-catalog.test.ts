import { expect, it } from "vitest";
import type { McpServerToolSnapshot, McpToolDescriptor } from "@zcode/contracts";
import { createInMemoryMcpToolCatalog } from "../src/mcp/tool-catalog-cache.js";

const server = { type: "stdio", command: "node" } as const;
const tool: McpToolDescriptor = {
  serverName: "alpha",
  toolName: "probe",
  name: "mcp__alpha__probe",
  description: "probe",
  inputSchema: { type: "object" },
};
const connected: McpServerToolSnapshot = {
  status: { status: "connected", transport: "stdio", toolCount: 1, updatedAt: "" },
  tools: [tool],
  toolsVersion: "v1",
};

it("publishes and looks up sanitized tools by server", () => {
  const catalog = createInMemoryMcpToolCatalog();
  const publication = catalog.prepare({ servers: { alpha: server } });
  expect(publication.lookup).toEqual({ byServer: {}, status: "incomplete" });

  publication.publish({ alpha: connected });
  const hit = catalog.prepare({ servers: { alpha: server } }).lookup;
  expect(hit.status).toBe("complete");
  expect(hit.byServer.alpha).toHaveLength(1);
  expect(hit.byServer.alpha?.[0]).toMatchObject({
    serverName: "alpha",
    toolName: "probe",
    inputSchema: { type: "object" },
  });
  // 展示定义不携带执行注解。
  expect(hit.byServer.alpha?.[0]).not.toHaveProperty("annotations");
});

it("drops cached tools when the server disconnects", () => {
  const catalog = createInMemoryMcpToolCatalog();
  const publication = catalog.prepare({ servers: { alpha: server } });
  publication.publish({ alpha: connected });
  expect(catalog.prepare({ servers: { alpha: server } }).lookup.byServer.alpha).toHaveLength(1);

  publication.publish({
    alpha: { status: { status: "disconnected", transport: "stdio", toolCount: 0, updatedAt: "" } },
  });
  expect(catalog.prepare({ servers: { alpha: server } }).lookup).toEqual({
    byServer: {},
    status: "incomplete",
  });
});
