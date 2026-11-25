// 内建 stdio server 意外退出后的自动重启上限与目录保留。用真实子进程（真 stdio 握手），
// 通过 SIGKILL 制造"启动后很快退出"的外因，不 mock SDK 内部。
import { readFile, rm, writeFile, mkdtemp } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { McpServerConfig, McpServerToolSnapshot } from "@zcode/contracts";
import { createMcpAdapter } from "../src/mcp/index.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/**
 * 子进程启动即把 PID 写盘，随后按标准 MCP 协议回答 initialize / tools/list。
 * 存在 failMarker 时立即退出，用来模拟重启失败。
 */
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-mcp-restart-"));
  roots.push(root);
  const pidFile = join(root, "pid");
  const failMarker = join(root, "fail");
  const script = join(root, "server.mjs");
  await writeFile(
    script,
    `import { existsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
if (existsSync(${JSON.stringify(failMarker)})) process.exit(1);
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (request.id === undefined) continue;
  const result =
    request.method === 'initialize'
      ? { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'restart-test', version: '1' } }
      : request.method === 'tools/list'
        ? { tools: [{ name: 'js', description: 'builtin probe', inputSchema: { type: 'object' } }] }
        : request.method === 'ping'
          ? {}
          : {};
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');
}
`,
  );
  const config = (source: McpServerConfig["source"]): McpServerConfig => ({
    type: "stdio",
    args: [script],
    command: process.execPath,
    protocolVersion: "legacy",
    source,
  });
  return {
    builtin: config({ kind: "builtin" }),
    plain: config({ kind: "workspace" }),
    failMarker,
    pidFile,
    root,
  };
}

async function childPid(pidFile: string): Promise<number> {
  return Number(await readFile(pidFile, "utf8"));
}

async function waitFor<T>(read: () => T | undefined, timeoutMs = 5_000): Promise<T> {
  const startedAt = Date.now();
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() - startedAt > timeoutMs)
      throw new Error("timed out waiting for MCP restart condition");
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}

function row(
  adapter: ReturnType<typeof createMcpAdapter>,
  name: string,
): McpServerToolSnapshot | undefined {
  return adapter.getToolSnapshot!()[name];
}

function toolNames(snapshot: McpServerToolSnapshot | undefined): string[] {
  return (snapshot?.tools ?? []).map((tool) => tool.toolName);
}

it("restarts a built-in stdio server after an unexpected exit and keeps its catalog", async () => {
  const f = await fixture();
  const adapter = createMcpAdapter();
  try {
    await adapter.connectServer("node_repl", f.builtin);
    const observed: Array<{ status: string; tools: number | undefined }> = [];
    adapter.onSnapshotChanged!(() => {
      const current = row(adapter, "node_repl");
      observed.push({ status: current?.status.status ?? "missing", tools: current?.tools?.length });
    });
    const pid = await childPid(f.pidFile);

    process.kill(pid, "SIGKILL");
    // 等到新子进程的 PID 出现且连接已重新就绪；只看状态会读到 kill 之前的 connected 快照。
    const restarted = await waitFor(() => {
      const current = row(adapter, "node_repl");
      if (current?.status.status !== "connected") return undefined;
      return readFileSyncPid(f.pidFile) === pid ? undefined : current;
    });
    expect(toolNames(restarted)).toEqual(["js"]);
    expect(await childPid(f.pidFile)).not.toBe(pid);
    // 重启期间目录不离开视图：既没有 failed 快照，也没有 tools 缺失的快照。
    expect(observed.filter((entry) => entry.tools === undefined)).toEqual([]);
    expect(observed.some((entry) => entry.status === "failed")).toBe(false);
    expect(observed.some((entry) => entry.status === "connecting" && entry.tools === 1)).toBe(true);
  } finally {
    await adapter.close();
  }
});

it("stops at five built-in restarts and keeps the retained catalog for execution admission", async () => {
  const f = await fixture();
  const adapter = createMcpAdapter();
  try {
    await adapter.connectServer("node_repl", f.builtin);
    for (let restart = 0; restart < 5; restart++) {
      const pid = await childPid(f.pidFile);
      process.kill(pid, "SIGKILL");
      await waitFor(() => {
        const current = row(adapter, "node_repl");
        if (current?.status.status !== "connected") return undefined;
        return Number(readFileSyncPid(f.pidFile)) === pid ? undefined : current;
      });
    }

    // 第 6 次退出仍在滚动窗口内：不再自动重启，登记意外断连但保留目录。
    const limitedPid = await childPid(f.pidFile);
    process.kill(limitedPid, "SIGKILL");
    const limited = await waitFor(() => {
      const current = row(adapter, "node_repl");
      return current?.status.status === "failed" ? current : undefined;
    });
    expect(limited.status.failureKind).toBe("unexpected_disconnect");
    expect(toolNames(limited)).toEqual(["js"]);
    expect(await childPid(f.pidFile)).toBe(limitedPid);

    // 下一次执行准入重连一次；重连期间目录仍在视图里。
    const waiting = adapter.waitForServer!("node_repl", { reconnect: true, timeoutMs: 5_000 });
    const during = row(adapter, "node_repl");
    expect(during?.status.status).toBe("connecting");
    expect(toolNames(during)).toEqual(["js"]);
    await expect(waiting).resolves.toEqual({ timedOut: false });
    expect(row(adapter, "node_repl")?.status.status).toBe("connected");
    expect(await childPid(f.pidFile)).not.toBe(limitedPid);
  } finally {
    await adapter.close();
  }
});

it("drops the retained built-in catalog when the execution-admission restart fails", async () => {
  const f = await fixture();
  const adapter = createMcpAdapter();
  try {
    await adapter.connectServer("node_repl", f.builtin);
    for (let restart = 0; restart < 6; restart++) {
      const pid = await childPid(f.pidFile);
      process.kill(pid, "SIGKILL");
      if (restart === 5) {
        await waitFor(() => {
          const current = row(adapter, "node_repl");
          return current?.status.status === "failed" ? current : undefined;
        });
        break;
      }
      await waitFor(() => {
        const current = row(adapter, "node_repl");
        if (current?.status.status !== "connected") return undefined;
        return Number(readFileSyncPid(f.pidFile)) === pid ? undefined : current;
      });
    }
    expect(toolNames(row(adapter, "node_repl"))).toEqual(["js"]);

    // 执行准入重连仍只有一次尝试；启动失败后按普通失败清空目录。
    await writeFile(f.failMarker, "fail");
    await adapter.waitForServer!("node_repl", { reconnect: true, timeoutMs: 5_000 });
    const failed = row(adapter, "node_repl");
    expect(failed?.status.status).toBe("failed");
    expect(failed?.status.failureKind).not.toBe("unexpected_disconnect");
    expect(failed?.tools).toBeUndefined();
  } finally {
    await adapter.close();
  }
});

it("keeps an ordinary stdio server's catalog for the product's on-demand reconnect", async () => {
  const f = await fixture();
  const adapter = createMcpAdapter();
  try {
    await adapter.connectServer("plain", f.plain);
    const pid = await childPid(f.pidFile);
    process.kill(pid, "SIGKILL");
    // 产品边界：普通 stdio 不在 adapter 里后台重启，登记未授权断连但保留目录，
    // 由执行准入按需重连（bootstrap 的 workspace-mcp-trust 用例覆盖该流程）。
    const lost = await waitFor(() => {
      const current = row(adapter, "plain");
      return current?.status.status === "disconnected" ? current : undefined;
    });
    expect(lost.status.failureKind).toBe("unexpected_disconnect");
    expect(toolNames(lost)).toEqual(["js"]);
    // 下一次执行准入按需重连，且目录在重连期间不消失。
    const waiting = adapter.waitForServer!("plain", { reconnect: true, timeoutMs: 5_000 });
    expect(toolNames(row(adapter, "plain"))).toEqual(["js"]);
    await expect(waiting).resolves.toEqual({ timedOut: false });
    expect(row(adapter, "plain")?.status.status).toBe("connected");
  } finally {
    await adapter.close();
  }
});

// 同步读 PID 文件用于轮询比较；失败返回 NaN 让条件继续等待。
function readFileSyncPid(pidFile: string): number {
  try {
    return Number(readFileSync(pidFile, "utf8"));
  } catch {
    return Number.NaN;
  }
}
