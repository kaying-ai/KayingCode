import assert from "node:assert/strict";
import { test } from "vitest";
import { once } from "node:events";
import { WebSocketServer, type WebSocket } from "ws";
import { connectViaNodeWebSocket } from "../src/nodeWebSocket.js";

test("Node WebSocket connector forwards headers and reports remote close", async (t) => {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  t.onTestFinished(() => server.close());
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  let acceptedSocket: WebSocket | undefined;
  const accepted = new Promise<void>((resolve) => {
    server.once("connection", (socket, request) => {
      acceptedSocket = socket;
      assert.equal(request.headers["x-test-capability"], "ticket");
      resolve();
    });
  });
  const connection = await connectViaNodeWebSocket(`ws://127.0.0.1:${address.port}`, {
    headers: { "x-test-capability": "ticket" },
  });
  t.onTestFinished(() => connection.dispose());
  await accepted;

  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    connection.onDidClose(resolve),
  );
  acceptedSocket?.close(4001, "server-restart");
  assert.deepEqual(await closed, { code: 4001, reason: "server-restart" });
});

test("Node WebSocket connector fails immediately for an aborted request", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    connectViaNodeWebSocket("ws://127.0.0.1:1", { signal: controller.signal }),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
});
