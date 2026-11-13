import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { TAPTAP_PREVIEW_RECEIPT_RELATIVE_PATH } from "@zcode/shared";
import { createTapTapMakerMcpServer } from "../src/mcp/server.js";
import {
  prepareVisualComparison,
  TRANSCRIPTION_COMPARE_RECEIPT_RELATIVE_PATH,
} from "../src/mcp/visual-comparison.js";

async function fixture() {
  const workspace = await mkdtemp(join(tmpdir(), "kayingcode-t3m-compare-"));
  const projectRoot = join(workspace, "convert_game_demo", "dest");
  await mkdir(projectRoot, { recursive: true });
  const targetPath = join(workspace, ...TAPTAP_PREVIEW_RECEIPT_RELATIVE_PATH.split("/"));
  await mkdir(join(targetPath, ".."), { recursive: true });
  await writeFile(
    targetPath,
    `${JSON.stringify({
      schemaVersion: 1,
      operationId: "target-op-1",
      workspaceKey: "workspace-key",
      previewMode: "transcription-compare",
      projectRoot,
      previewUrl: "https://maker.taptap.cn/app/demo",
      publishedAt: "2026-09-29T00:00:00.000Z",
      revision: 4,
    })}\n`,
  );
  return { workspace, projectRoot };
}

test("built-in plugin publishes a scoped comparison with monotonic revisions", async () => {
  const { workspace, projectRoot } = await fixture();
  try {
    const meta = {
      session_id: "session-1",
      workspace_key: "workspace-key",
      workspace_path: workspace,
    };
    const env = { KAYINGCODE_PLUGIN_ID: "kaying-for-taptap@official" };
    const first = await prepareVisualComparison(
      {
        projectRoot,
        sourceUrl: "https://example.com/game",
        viewport: { width: 1280, height: 720 },
      },
      meta,
      env,
    );
    const second = await prepareVisualComparison(
      { projectRoot, sourceUrl: "https://example.com/game" },
      meta,
      env,
    );

    assert.equal(first.publication.revision, 1);
    assert.equal(second.publication.revision, 2);
    assert.equal(second.publication.pluginId, env.KAYINGCODE_PLUGIN_ID);
    assert.equal(
      second.publication.targetUrl,
      "https://maker.taptap.cn/app/demo?localDev=1&tab=preview",
    );
    assert.deepEqual(second.publication.viewport, { width: 1280, height: 720 });
    const persistedPath = join(
      workspace,
      ...TRANSCRIPTION_COMPARE_RECEIPT_RELATIVE_PATH.split("/"),
    );
    const persisted = JSON.parse(await readFile(persistedPath, "utf8")) as {
      revision: number;
      sessionId: string;
    };
    assert.equal(persisted.revision, 2);
    assert.equal(persisted.sessionId, "session-1");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("comparison preparation rejects workspace and source URL violations", async () => {
  const { workspace, projectRoot } = await fixture();
  try {
    const env = { KAYINGCODE_PLUGIN_ID: "kaying-for-taptap@official" };
    await assert.rejects(
      prepareVisualComparison(
        { projectRoot, sourceUrl: "https://example.com/game" },
        {
          session_id: "session-1",
          workspace_key: "wrong-key",
          workspace_path: workspace,
        },
        env,
      ),
      /different workspace/u,
    );
    await assert.rejects(
      prepareVisualComparison(
        { projectRoot, sourceUrl: "file:///tmp/game.html" },
        {
          session_id: "session-1",
          workspace_key: "workspace-key",
          workspace_path: workspace,
        },
        env,
      ),
      /http\(s\)/u,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("MCP prepare directs resumed tasks to discover the current comparison guests", async (t) => {
  const { workspace, projectRoot } = await fixture();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const pluginId = process.env.KAYINGCODE_PLUGIN_ID;
  process.env.KAYINGCODE_PLUGIN_ID = "kaying-for-taptap@official";
  t.after(() => {
    if (pluginId === undefined) delete process.env.KAYINGCODE_PLUGIN_ID;
    else process.env.KAYINGCODE_PLUGIN_ID = pluginId;
  });
  const server = createTapTapMakerMcpServer();
  const client = new Client({ name: "comparison-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const request = {
    name: "prepare_visual_comparison",
    arguments: { projectRoot, sourceUrl: "https://example.com/game" },
    _meta: {
      workspace_path: workspace,
      workspace_key: "workspace-key",
      session_id: "resumed-task",
    },
  };
  const result = await client.callTool(request);
  assert.notEqual(result.isError, true);
  const content = result.content as { type: string; text: string }[];
  const guidance = content[1]?.text ?? "";
  assert.match(
    guidance,
    /plugin-compare:kaying-for-taptap@official:transcription-compare:resumed-task/u,
  );
  assert.match(guidance, /agent\.browsers\.list\(\).*current Desktop session/u);
  assert.match(guidance, /tabs\.list\(\).*ID prefix.*user\.openTabs\(\).*tabGroup/u);
  assert.match(guidance, /Copy.*original PNG.*workspace.*t3m compare/u);
  assert.deepEqual(JSON.parse(content[0]!.text), result.structuredContent);

  const failed = await client.callTool({
    ...request,
    _meta: { ...request._meta, workspace_key: "other" },
  });
  assert.equal(failed.isError, true);
  assert.equal((failed.content as unknown[]).length, 1);
});
