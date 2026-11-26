import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { McpServerConfig } from "@zcode/contracts";
import { createMcpAdapter } from "../src/mcp/index.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture(tools: Array<Record<string, unknown>>) {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-mcp-snapshot-"));
  roots.push(root);
  const script = join(root, "server.mjs");
  await writeFile(
    script,
    `import {createInterface} from 'node:readline';
for await (const line of createInterface({input:process.stdin})) {
 const r=JSON.parse(line); if(r.id===undefined) continue;
 const result=r.method==='initialize'?{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'snapshot-test',version:'1'}}:
 r.method==='tools/list'?{tools:${JSON.stringify(tools)}}:{};
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n');
}`,
  );
  return {
    root,
    config: {
      type: "stdio",
      command: process.execPath,
      args: [script],
      protocolVersion: "legacy",
      source: { kind: "workspace" },
    } satisfies McpServerConfig,
  };
}

it("exposes status and tool list from memory without listing again", async () => {
  const f = await fixture([
    { name: "probe", description: "local probe", inputSchema: { type: "object" } },
  ]);
  const adapter = createMcpAdapter();
  try {
    const status = await adapter.connectServer("probe", f.config);
    expect(status.status).toBe("connected");
    const snapshot = adapter.getToolSnapshot!();
    expect(snapshot.probe?.status.status).toBe("connected");
    expect(snapshot.probe?.tools?.map((tool) => tool.name)).toEqual(["mcp__probe__probe"]);
    expect(snapshot.probe?.toolsVersion).toBeTruthy();
    // 快照与 listTools 读的是同一份内存目录。
    expect(await adapter.listTools()).toHaveLength(1);
  } finally {
    await adapter.close();
  }
});

it("distinguishes a confirmed empty tool list from not listed yet", async () => {
  const f = await fixture([]);
  const adapter = createMcpAdapter();
  try {
    await adapter.connectServer("probe", f.config);
    const snapshot = adapter.getToolSnapshot!();
    expect(snapshot.probe?.tools).toEqual([]);
    expect(snapshot.probe?.toolsVersion).toBeTruthy();
  } finally {
    await adapter.close();
  }
});

it("reconnects an explicitly disconnected server only when execution admission asks", async () => {
  const f = await fixture([{ name: "probe", inputSchema: { type: "object" } }]);
  const adapter = createMcpAdapter();
  try {
    await adapter.connectServer("probe", f.config);
    await adapter.disconnectServer("probe");
    expect(adapter.getToolSnapshot!().probe?.status.status).toBe("disconnected");

    // 普通等待不重连：ToolSearch 等只观察现有启动任务。
    await adapter.waitForServer!("probe", { timeoutMs: 5_000 });
    expect(adapter.getToolSnapshot!().probe?.status.status).toBe("disconnected");

    const waited = await adapter.waitForServer!("probe", {
      timeoutMs: 10_000,
      reconnect: true,
    });
    expect(waited.timedOut).toBe(false);
    expect(adapter.getToolSnapshot!().probe?.status.status).toBe("connected");
    expect(adapter.getToolSnapshot!().probe?.tools?.[0]?.name).toBe("mcp__probe__probe");
  } finally {
    await adapter.close();
  }
});
