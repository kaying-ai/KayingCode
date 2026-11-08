import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { TAPTAP_PREVIEW_RECEIPT_RELATIVE_PATH } from "@zcode/shared";
import { createTapTapMakerMcpServer } from "../src/mcp/server.js";
import { publishTool } from "../src/tools/high-level-tools.js";

test("successful MCP publish persists Host task ownership; failed/deferred publish leaves receipt intact", async () => {
  const root = await mkdtemp(join(tmpdir(), "tapmaker-publication-mcp-"));
  const execute = publishTool.execute;
  let success = true;
  publishTool.execute = async (args) => ({
    ok: success,
    status: success ? "published" : "deferred",
    projectRoot: (args as { projectRoot: string }).projectRoot,
    previewUrl: success ? "https://maker.taptap.cn/app/demo" : null,
  });
  const server = createTapTapMakerMcpServer();
  const client = new Client({ name: "publication-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const request = {
      name: publishTool.name,
      arguments: { projectRoot: join(root, "game") },
      _meta: { workspace_path: root, workspace_identity: "identity-a", session_id: "task-a" },
    };
    const result = await client.callTool(request);
    assert.notEqual(result.isError, true);
    const path = join(root, TAPTAP_PREVIEW_RECEIPT_RELATIVE_PATH);
    const receipt = JSON.parse(await readFile(path, "utf8"));
    assert.equal(receipt.sessionId, "task-a");
    assert.equal(receipt.workspaceKey, "identity-a");
    assert.equal(receipt.revision, 1);
    success = false;
    await client.callTool(request);
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), receipt);
  } finally {
    publishTool.execute = execute;
    await client.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
