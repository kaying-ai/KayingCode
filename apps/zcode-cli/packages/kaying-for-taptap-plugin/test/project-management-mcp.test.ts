import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { TAPMAKER_PROJECTS_MCP_TOOL } from "@zcode/shared";
import { buildTapTapMakerPlugin } from "../scripts/build.mjs";

test("bundled MCP keeps management hidden, validates requests, and guards restore scope", async () => {
  const serverPath = await buildTapTapMakerPlugin();
  const root = await mkdtemp(join(tmpdir(), "tapmaker-mcp-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: root,
    stderr: "pipe",
  });
  const client = new Client(
    { name: "tapmaker-management-test", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(
      tools.tools.some((tool) => tool.name === TAPMAKER_PROJECTS_MCP_TOOL),
      false,
    );
    const untrusted = await client.callTool({
      name: TAPMAKER_PROJECTS_MCP_TOOL,
      arguments: { action: "authorize" },
    });
    assert.equal(untrusted.isError, true);
    assert.match(JSON.stringify(untrusted.content), /Host UI request/);
    const invalid = await client.callTool({
      name: TAPMAKER_PROJECTS_MCP_TOOL,
      arguments: { action: "delete" },
      _meta: { client_mode: "tapmaker-management" },
    });
    assert.equal(invalid.isError, true);
    const escaped = await client.callTool({
      name: TAPMAKER_PROJECTS_MCP_TOOL,
      arguments: {
        action: "restore",
        appId: "game",
        projectName: "Game",
        selectedDirectory: tmpdir(),
      },
      _meta: { client_mode: "tapmaker-management", workspace_path: root },
    });
    assert.equal(escaped.isError, true);
    assert.match(JSON.stringify(escaped.content), /inside the current workspace/);
  } finally {
    await client.close();
    await rm(root, { recursive: true, force: true });
  }
});
