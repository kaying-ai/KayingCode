import assert from "node:assert/strict";
import { test } from "vitest";
import { setImmediate as nextTurn } from "node:timers/promises";
import { Emitter } from "@zcode/rpc";
import { z } from "zod";
import type { KayingCodeProtocolMessage } from "@zcode/shared";
import { KayingCodeProtocolClient } from "../src/kayingcode-agent/kayingcodeProtocolClient.js";
import type { KayingCodeProtocolTransportClosedEvent } from "../src/kayingcode-agent/kayingcodeProtocolTransport.js";

function fixture() {
  const send = Promise.withResolvers<void>();
  const messages = new Emitter<KayingCodeProtocolMessage>();
  const closed = new Emitter<KayingCodeProtocolTransportClosedEvent>();
  const client = new KayingCodeProtocolClient({
    kind: "memory",
    onMessage: messages.event,
    onClose: closed.event,
    send: () => send.promise,
    dispose() {},
  });
  return { client, send, messages, closed };
}

for (const terminal of ["dispose", "abort", "transport-close", "timeout"] as const) {
  test(`blocked send + ${terminal} settles the request before the send and consumes late failure`, async () => {
    const { client, send, closed } = fixture();
    const controller = new AbortController();
    const aborted = new Error("caller cancelled");
    const pending = client.request("plugins/list", {}, undefined, {
      signal: controller.signal,
      ...(terminal === "timeout" ? { timeoutMs: 10 } : {}),
    });
    const outcome = pending.then(
      () => ({ error: null }),
      (error: Error) => ({ error }),
    );
    try {
      if (terminal === "dispose") client.dispose();
      if (terminal === "abort") controller.abort(aborted);
      if (terminal === "transport-close") closed.fire({ reason: "shutdown" });
      if (terminal === "timeout")
        await new Promise<void>((resolve) => client.onRequestTimeout(() => resolve()));
      await nextTurn();
      const result = await Promise.race([outcome, Promise.resolve("still waiting for send")]);
      assert.notEqual(result, "still waiting for send");
      assert.ok(typeof result === "object" && result.error instanceof Error);
      if (terminal === "abort") assert.equal(result.error, aborted);
      assert.equal(client.pendingRequestCount, 0);
      send.reject(new Error("late send failure"));
      await nextTurn();
    } finally {
      send.resolve();
      client.dispose();
      await outcome;
    }
  });
}

test("success waits for both sending and the validated response", async () => {
  const { client, send, messages } = fixture();
  try {
    let settled = false;
    const pending = client
      .request("plugins/list", {}, z.object({ plugins: z.array(z.unknown()) }))
      .then((value) => {
        settled = true;
        return value;
      });
    messages.fire({ id: 1, result: { plugins: [] } });
    await nextTurn();
    assert.equal(settled, false);
    send.resolve();
    assert.deepEqual(await pending, { plugins: [] });
    assert.equal(client.pendingRequestCount, 0);
  } finally {
    client.dispose();
  }
});

test("send failures propagate and clear pending requests", async () => {
  const { client, send } = fixture();
  try {
    const failure = new Error("send failed");
    const pending = assert.rejects(client.request("plugins/list"), (error) => error === failure);
    send.reject(failure);
    await pending;
    assert.equal(client.pendingRequestCount, 0);
  } finally {
    client.dispose();
  }
});

test("a synchronous transport failure also clears the pending request", async () => {
  const transport = {
    kind: "memory" as const,
    onMessage: new Emitter<KayingCodeProtocolMessage>().event,
    onClose: new Emitter<KayingCodeProtocolTransportClosedEvent>().event,
    send(): Promise<void> {
      throw new Error("synchronous send failed");
    },
    dispose() {},
  };
  const synchronousClient = new KayingCodeProtocolClient(transport);
  try {
    await assert.rejects(synchronousClient.request("plugins/list"), /synchronous send failed/);
    assert.equal(synchronousClient.pendingRequestCount, 0);
  } finally {
    synchronousClient.dispose();
  }
});
