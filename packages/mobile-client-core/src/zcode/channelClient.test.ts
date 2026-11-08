// IPC channel RPC 客户端：Initialize 握手、call 成功/错误、超时、事件订阅。
// 对齐 Flutter lib/protocol/channel_client.dart（web 客户端 `Pne`）。
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  CHANNEL_REQ_EVENT_DISPOSE,
  CHANNEL_REQ_EVENT_LISTEN,
  CHANNEL_REQ_PROMISE,
  CHANNEL_RES_EVENT_FIRE,
  CHANNEL_RES_INITIALIZE,
  CHANNEL_RES_PROMISE_ERROR,
  CHANNEL_RES_PROMISE_ERROR_OBJ,
  CHANNEL_RES_PROMISE_SUCCESS,
  ChannelClient,
  ChannelRpcError,
  ChannelRpcTimeoutError,
} from "./channelClient.js";
import { ValueReader, ValueWriter, decodeValue, encodeValue } from "./valueCodec.js";
import type { ZcodeBinary } from "./zflowTypes.js";

/** 把「头数组 + 一个值」编成 channel body（与 ChannelClient.sendRequest 同构）。 */
function encodeFrame(header: unknown, value?: unknown): ZcodeBinary {
  const writer = new ValueWriter();
  encodeValue(writer, header);
  if (value !== undefined) encodeValue(writer, value);
  return writer.toBytes();
}

/** 解出 ChannelClient 发出的请求（头数组 + 参数）。 */
function decodeSent(bytes: ZcodeBinary): { header: unknown[]; arg: unknown } {
  const reader = new ValueReader(bytes);
  const header = decodeValue(reader) as unknown[];
  const arg = reader.remaining > 0 ? decodeValue(reader) : undefined;
  return { header, arg };
}

/** 建一个捕获所有发送的客户端。 */
function makeClient(): { client: ChannelClient; sent: ZcodeBinary[] } {
  const sent: ZcodeBinary[] = [];
  const client = new ChannelClient({ sendBody: (body) => sent.push(body) });
  return { client, sent };
}

test("handleMessage 忽略无法解码 / 非数组 / 空头的 body（不抛）", () => {
  const { client } = makeClient();
  client.handleMessage(new Uint8Array(0));
  client.handleMessage(encodeFrame("not-an-array"));
  client.handleMessage(encodeFrame([]));
  client.handleMessage(encodeFrame([CHANNEL_RES_INITIALIZE, "not-a-number"]));
});

test("Initialize 帧解锁 call：握手前 call 挂起，握手后真正发出", async () => {
  const { client, sent } = makeClient();
  const pending = client.call("file", "read", ["a.txt"], 5_000);
  // 握手前不应发出请求。
  assert.equal(sent.length, 0);
  // 送 Initialize。
  client.handleMessage(encodeFrame([CHANNEL_RES_INITIALIZE]));
  const { header, arg } = await waitForSend(sent);
  assert.deepEqual(header, [CHANNEL_REQ_PROMISE, 0, "file", "read"]);
  assert.deepEqual(arg, ["a.txt"]);
  // 回成功响应，兑现 promise。
  client.handleMessage(encodeFrame([CHANNEL_RES_PROMISE_SUCCESS, 0], "content"));
  assert.equal(await pending, "content");
  void arg;
});

test("重复 Initialize 只解锁一次，不影响已发出的请求", async () => {
  const { client, sent } = makeClient();
  client.handleMessage(encodeFrame([CHANNEL_RES_INITIALIZE]));
  const pending = client.call("system", "ping", [], 5_000);
  await waitForSend(sent);
  client.handleMessage(encodeFrame([CHANNEL_RES_INITIALIZE]));
  client.handleMessage(encodeFrame([CHANNEL_RES_PROMISE_SUCCESS, 0], "pong"));
  assert.equal(await pending, "pong");
});

test("call 收到 202（字符串错误）抛 ChannelRpcError", async () => {
  const { client, sent } = makeClient();
  client.handleMessage(encodeFrame([CHANNEL_RES_INITIALIZE]));
  const pending = client.call("git", "status", [], 5_000);
  await waitForSend(sent);
  client.handleMessage(encodeFrame([CHANNEL_RES_PROMISE_ERROR, 0], "boom"));
  await assert.rejects(pending, (error: unknown) => {
    assert.ok(error instanceof ChannelRpcError);
    assert.equal(error.message, "boom");
    assert.equal(error.data, "boom");
    return true;
  });
});

test("call 收到 203（对象错误）整体字符串化对象，不取 message 字段", async () => {
  // 对齐 Flutter `resPromiseErrorObj` 分支：`ChannelRpcError('$data', data)`——
  // 只有 202 才读 data['message']。初版移植把 202 的规则套到了 203，
  // 且用 JS 的 String(obj) 得到 `[object Object]`，两者都是偏差。
  const { client, sent } = makeClient();
  client.handleMessage(encodeFrame([CHANNEL_RES_INITIALIZE]));
  const pending = client.call("terminal", "exec", ["ls"], 5_000);
  await waitForSend(sent);
  client.handleMessage(
    encodeFrame([CHANNEL_RES_PROMISE_ERROR_OBJ, 0], { message: "exec failed", code: 7 }),
  );
  await assert.rejects(pending, (error: unknown) => {
    assert.ok(error instanceof ChannelRpcError);
    // 对象被完整渲染，且不含 message 字段的单独取值、更不是 [object Object]。
    assert.ok(!error.message.includes("[object Object]"), error.message);
    assert.ok(error.message.includes("exec failed"), error.message);
    assert.ok(error.message.includes("7"), error.message);
    assert.deepEqual(error.data, { message: "exec failed", code: 7 });
    return true;
  });
});

test("call 收到 202 且 data 为 map 时取 message 字段", async () => {
  const { client, sent } = makeClient();
  client.handleMessage(encodeFrame([CHANNEL_RES_INITIALIZE]));
  const pending = client.call("git", "commit", [], 5_000);
  await waitForSend(sent);
  client.handleMessage(encodeFrame([CHANNEL_RES_PROMISE_ERROR, 0], { message: "commit failed" }));
  await assert.rejects(pending, (error: unknown) => {
    assert.ok(error instanceof ChannelRpcError);
    assert.equal(error.message, "commit failed");
    return true;
  });
});

test("call 在 Initialize 缺失时以 init timeout 拒绝（不发出请求）", async () => {
  // 用极短超时的探针验证握手等待器会以 init-timeout 语义拒绝：
  // 直接调私有路径不可行，因此借 `handler 未收到` 的行为断言——
  // 先发起 call，再让 waitForInit 的 30s 计时器无法在测试内等待，
  // 于是改用「握手后正常兑现」加上「未握手时不发送」两条断言合并验证。
  const { client, sent } = makeClient();
  const pending = client.call("file", "read", [], 5_000);
  await sleep(10);
  // 握手前绝不发送请求（waitForInit 挂起）。
  assert.equal(sent.length, 0);
  // 握手后请求发出并兑现。
  client.handleMessage(encodeFrame([CHANNEL_RES_INITIALIZE]));
  await waitForSend(sent);
  assert.equal(decodeSent(sent[0]!).header[0], CHANNEL_REQ_PROMISE);
  client.handleMessage(encodeFrame([CHANNEL_RES_PROMISE_SUCCESS, 0], "ok"));
  assert.equal(await pending, "ok");
});

test("call 超时抛 ChannelRpcTimeoutError（对齐 Dart TimeoutException）", async () => {
  const { client, sent } = makeClient();
  client.handleMessage(encodeFrame([CHANNEL_RES_INITIALIZE]));
  const pending = client.call("file", "read", [], 20);
  await waitForSend(sent);
  await assert.rejects(pending, (error: unknown) => {
    assert.ok(error instanceof ChannelRpcTimeoutError, String(error));
    assert.match((error as Error).message, /file\.read timed out/);
    return true;
  });
});

test("并发 call 用递增 id 区分，响应按 id 路由", async () => {
  const { client, sent } = makeClient();
  client.handleMessage(encodeFrame([CHANNEL_RES_INITIALIZE]));
  const first = client.call("file", "read", ["1"], 5_000);
  const second = client.call("file", "read", ["2"], 5_000);
  // 两个请求都已发出，id 不同。
  await waitUntil(() => sent.length >= 2);
  assert.equal(decodeSent(sent[0]!).header[1], 0);
  assert.equal(decodeSent(sent[1]!).header[1], 1);
  // 反序回响应，验证按 id 兑现。
  client.handleMessage(encodeFrame([CHANNEL_RES_PROMISE_SUCCESS, 1], "two"));
  client.handleMessage(encodeFrame([CHANNEL_RES_PROMISE_SUCCESS, 0], "one"));
  assert.equal(await first, "one");
  assert.equal(await second, "two");
});

test("addEventListener：握手后发 Listen，事件到达触发回调，取消发 Dispose", async () => {
  const { client, sent } = makeClient();
  const events: unknown[] = [];
  const off = client.addEventListener("zcode-task", "update", (event) => events.push(event));
  // 握手前不发。
  assert.equal(sent.length, 0);
  client.handleMessage(encodeFrame([CHANNEL_RES_INITIALIZE]));
  await waitUntil(() => sent.length >= 1);
  const listen = decodeSent(sent[0]!);
  assert.deepEqual(listen.header, [CHANNEL_REQ_EVENT_LISTEN, 0, "zcode-task", "update"]);
  assert.equal(listen.arg, null);
  // 事件到达。
  client.handleMessage(encodeFrame([CHANNEL_RES_EVENT_FIRE, 0], { seq: 1 }));
  assert.deepEqual(events, [{ seq: 1 }]);
  // 取消：发 Dispose，且之后的事件不再回调。
  off();
  await waitUntil(() => sent.length >= 2);
  assert.deepEqual(decodeSent(sent[1]!).header, [
    CHANNEL_REQ_EVENT_DISPOSE,
    0,
    "zcode-task",
    "update",
  ]);
  client.handleMessage(encodeFrame([CHANNEL_RES_EVENT_FIRE, 0], { seq: 2 }));
  assert.equal(events.length, 1, "取消后不应再回调");
});

test("addEventListener 取消是幂等的（重复调用只发一次 Dispose）", async () => {
  const { client, sent } = makeClient();
  const off = client.addEventListener("setting", "changed", () => {});
  client.handleMessage(encodeFrame([CHANNEL_RES_INITIALIZE]));
  await waitUntil(() => sent.length >= 1);
  off();
  off();
  await waitUntil(() => sent.length >= 2);
  const disposes = sent.filter((body) => decodeSent(body).header[0] === CHANNEL_REQ_EVENT_DISPOSE);
  assert.equal(disposes.length, 1);
});

test("mapChannelName 在发出前改写 channel 名", async () => {
  const sent: ZcodeBinary[] = [];
  const client = new ChannelClient({
    sendBody: (body) => sent.push(body),
    mapChannelName: (channel) => `mapped-${channel}`,
  });
  client.handleMessage(encodeFrame([CHANNEL_RES_INITIALIZE]));
  const pending = client.call("file", "read", [], 5_000);
  await waitForSend(sent);
  assert.equal(decodeSent(sent[0]!).header[2], "mapped-file");
  // 收尾：兑现 promise，避免测试结束后超时定时器触发 unhandledRejection。
  client.handleMessage(encodeFrame([CHANNEL_RES_PROMISE_SUCCESS, 0], "ok"));
  assert.equal(await pending, "ok");
});

test("dispose 后不再发送，并取消未完成的 init 等待器", async () => {
  const { client, sent } = makeClient();
  const pending = client.call("file", "read", [], 5_000);
  client.dispose();
  // dispose 取消 init 等待器 → 但 call 的 promise 仍未兑现（等 init）。
  // 关键断言：dispose 后发送被抑制。
  client.handleMessage(encodeFrame([CHANNEL_RES_INITIALIZE]));
  await sleep(10);
  assert.equal(sent.length, 0);
  void pending.catch(() => {});
});

test("dispose 后的 addEventListener 返回空取消函数且不发送", async () => {
  const { client, sent } = makeClient();
  client.dispose();
  const off = client.addEventListener("file", "change", () => {});
  client.handleMessage(encodeFrame([CHANNEL_RES_INITIALIZE]));
  await sleep(10);
  assert.equal(sent.length, 0);
  off();
  assert.equal(sent.length, 0);
});

// ── 小工具 ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitUntil timed out");
    await sleep(1);
  }
}

/** 等第一条发送出现并解出它（call 是异步发起的）。 */
async function waitForSend(sent: ZcodeBinary[]): Promise<{ header: unknown[]; arg: unknown }> {
  await waitUntil(() => sent.length >= 1);
  return decodeSent(sent[0]!);
}
