import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { NodeReplSession } from "@zcode/core/repl";
import {
  NODE_REPL_BROWSER_BROKER_SOCKET_ENV,
  NODE_REPL_BROWSER_BROKER_TOKEN_ENV,
} from "@zcode/shared/node-repl-browser-broker";
import { createBrowserBridgeGlobals, type ActiveNodeReplCall } from "../src/browser-bridge.js";
import {
  NODE_REPL_BROWSER_BRIDGE_SYMBOL,
  readNodeReplBrowserRuntimeBridge,
} from "../src/runtime-bridge.js";

const TOKEN = "a".repeat(64);

interface BrokerHarness {
  requests: Record<string, unknown>[];
  server: Server;
  socketPath: string;
}

async function startBroker(
  respond: (request: Record<string, unknown>) => Record<string, unknown>,
): Promise<BrokerHarness> {
  const directory = mkdtempSync(join(tmpdir(), "kayingcode-node-repl-broker-"));
  const socketPath = join(directory, "broker.sock");
  const requests: Record<string, unknown>[] = [];
  const server = createServer((socket: Socket) => {
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const request = JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>;
      requests.push(request);
      socket.end(`${JSON.stringify(respond(request))}\n`);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  return { requests, server, socketPath };
}

async function closeBroker(harness: BrokerHarness): Promise<void> {
  await new Promise<void>((resolve) => harness.server.close(() => resolve()));
  rmSync(join(harness.socketPath, ".."), { recursive: true, force: true });
}

function createBridge(
  requestMeta: Record<string, unknown>,
  session: Pick<NodeReplSession, "mergeResponseMeta" | "recordBrowserScreenshot">,
) {
  const activeCall: ActiveNodeReplCall = {
    generation: 1,
    requestMeta,
    signal: new AbortController().signal,
  };
  const globals = createBrowserBridgeGlobals({
    documentationRoot: "/tmp/node-repl-docs",
    generation: 1,
    getActiveCall: () => activeCall,
    session: () => session as NodeReplSession,
  });
  assert.ok(globals[NODE_REPL_BROWSER_BRIDGE_SYMBOL]);
  return readNodeReplBrowserRuntimeBridge(globals);
}

function withBrokerEnvironment(socketPath: string, run: () => Promise<void>): Promise<void> {
  const previousSocket = process.env[NODE_REPL_BROWSER_BROKER_SOCKET_ENV];
  const previousToken = process.env[NODE_REPL_BROWSER_BROKER_TOKEN_ENV];
  process.env[NODE_REPL_BROWSER_BROKER_SOCKET_ENV] = socketPath;
  process.env[NODE_REPL_BROWSER_BROKER_TOKEN_ENV] = TOKEN;
  return run().finally(() => {
    if (previousSocket === undefined) delete process.env[NODE_REPL_BROWSER_BROKER_SOCKET_ENV];
    else process.env[NODE_REPL_BROWSER_BROKER_SOCKET_ENV] = previousSocket;
    if (previousToken === undefined) delete process.env[NODE_REPL_BROWSER_BROKER_TOKEN_ENV];
    else process.env[NODE_REPL_BROWSER_BROKER_TOKEN_ENV] = previousToken;
  });
}

test("browser bridge consumes the injected broker and sends session context", async () => {
  const harness = await startBroker((request) => ({
    id: request.id,
    ok: true,
    browsers: [],
  }));
  try {
    await withBrokerEnvironment(harness.socketPath, async () => {
      const bridge = createBridge(
        {
          runtime_scope: "main",
          session_id: "session-1",
          turn_id: "turn-1",
          trace_id: "trace-1",
          span_id: "span-1",
        },
        { mergeResponseMeta: () => undefined, recordBrowserScreenshot: () => undefined },
      );
      assert.deepEqual(await bridge.list(), []);
    });
    assert.equal(harness.requests.length, 1);
    const request = harness.requests[0]!;
    assert.equal(request.op, "list");
    assert.equal(request.token, TOKEN);
    assert.equal(request.runtimeScope, "main");
    assert.equal(request.sessionId, "session-1");
    assert.equal(request.turnId, "turn-1");
    assert.deepEqual(request.trace, { traceId: "trace-1", spanId: "span-1" });
  } finally {
    await closeBroker(harness);
  }
});

test("browser bridge records explicit screenshots for result projection", async () => {
  const image = { base64: "cGl4ZWxz", mimeType: "image/png" as const };
  const harness = await startBroker((request) => ({
    id: request.id,
    ok: true,
    result: {
      ok: true,
      elapsedMs: 1,
      image,
      meta: {
        browserUse: true,
        backendType: "iab",
        browserId: "browser-1",
        browserGeneration: 1,
        openTabIds: [],
      },
    },
  }));
  const recorded: unknown[] = [];
  try {
    await withBrokerEnvironment(harness.socketPath, async () => {
      const bridge = createBridge(
        { runtime_scope: "main", session_id: "session-1" },
        {
          mergeResponseMeta: () => undefined,
          recordBrowserScreenshot: (screenshot) => recorded.push(screenshot),
        },
      );
      await bridge.execute("browser-1", 1, { method: "screenshot" });
    });
    assert.deepEqual(recorded, [image]);
  } finally {
    await closeBroker(harness);
  }
});

test("browser bridge fails before connecting when broker environment is absent", async () => {
  const previousSocket = process.env[NODE_REPL_BROWSER_BROKER_SOCKET_ENV];
  const previousToken = process.env[NODE_REPL_BROWSER_BROKER_TOKEN_ENV];
  delete process.env[NODE_REPL_BROWSER_BROKER_SOCKET_ENV];
  delete process.env[NODE_REPL_BROWSER_BROKER_TOKEN_ENV];
  try {
    const bridge = createBridge(
      { runtime_scope: "main", session_id: "session-1" },
      { mergeResponseMeta: () => undefined, recordBrowserScreenshot: () => undefined },
    );
    await assert.rejects(bridge.list(), /Browser control is unavailable/);
  } finally {
    if (previousSocket === undefined) delete process.env[NODE_REPL_BROWSER_BROKER_SOCKET_ENV];
    else process.env[NODE_REPL_BROWSER_BROKER_SOCKET_ENV] = previousSocket;
    if (previousToken === undefined) delete process.env[NODE_REPL_BROWSER_BROKER_TOKEN_ENV];
    else process.env[NODE_REPL_BROWSER_BROKER_TOKEN_ENV] = previousToken;
  }
});

test("browser bridge rejects requests without session metadata", async () => {
  const bridge = createBridge(
    { runtime_scope: "main" },
    { mergeResponseMeta: () => undefined, recordBrowserScreenshot: () => undefined },
  );
  await assert.rejects(bridge.list(), /missing session_id metadata/);
});
