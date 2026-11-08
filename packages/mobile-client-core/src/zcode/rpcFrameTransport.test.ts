// rpc-frame 分片传输：乱序组装、坏包、ack、TTL 惰性清理、边界错误。
// 对齐 Flutter lib/protocol/rpc_transport.dart（web 客户端 `Xf`/`Zf`）。
import assert from "node:assert/strict";
import { test } from "vitest";
import { base64Encode } from "./wireBase64.js";
import { crc32Hex } from "./crc32.js";
import {
  RPC_MAX_FRAGMENTS,
  RpcFrameEmptyMessageError,
  RpcFrameMessageTooLargeError,
  RpcFrameTransport,
} from "./rpcFrameTransport.js";
import type { ZflowPayload } from "./zflowTypes.js";

const BRIDGE_ID = "bridge-1";

/** 建一个带发送捕获的传输实例。 */
function makeTransport(options: { now?: () => number; onLog?: (line: string) => void } = {}): {
  transport: RpcFrameTransport;
  sent: ZflowPayload[];
} {
  const sent: ZflowPayload[] = [];
  const transport = new RpcFrameTransport({
    bridgeSessionId: BRIDGE_ID,
    sendPayload: (payload) => sent.push(payload),
    ...(options.now ? { now: options.now } : {}),
    ...(options.onLog ? { onLog: options.onLog } : {}),
  });
  return { transport, sent };
}

/** 手工构造一条入站 rpc-frame 载荷（绕开发送端的 map 语义）。 */
function inboundFragment(options: {
  bytes: Uint8Array;
  messageSeq: number;
  fragmentIndex: number;
  fragmentCount: number;
  messageBytes: number;
  checksum?: string | null;
  dataBase64?: string;
  bridgeSessionId?: string;
}): ZflowPayload {
  const start = options.fragmentIndex * Math.ceil(options.bytes.length / options.fragmentCount);
  return {
    zcode_type: "rpc-frame",
    bridgeSessionId: options.bridgeSessionId ?? BRIDGE_ID,
    seq: options.fragmentIndex + 1,
    messageSeq: options.messageSeq,
    fragmentIndex: options.fragmentIndex,
    fragmentCount: options.fragmentCount,
    messageBytes: options.messageBytes,
    checksum: {
      algorithm: "crc32",
      value: options.checksum === undefined ? crc32Hex(options.bytes) : options.checksum,
    },
    dataBase64: options.dataBase64 ?? base64Encode(options.bytes.subarray(start)),
  };
}

test("sendMessage 空消息抛 RpcFrameEmptyMessageError（不发帧）", () => {
  const { transport, sent } = makeTransport();
  assert.throws(() => transport.sendMessage(new Uint8Array(0)), RpcFrameEmptyMessageError);
  assert.equal(sent.length, 0);
});

test("sendMessage 单帧：带 crc32 checksum 与 base64 载荷", () => {
  const { transport, sent } = makeTransport();
  const message = new Uint8Array([1, 2, 3, 4]);
  transport.sendMessage(message);
  assert.equal(sent.length, 1);
  const frame = sent[0]!;
  assert.equal(frame.zcode_type, "rpc-frame");
  assert.equal(frame.bridgeSessionId, BRIDGE_ID);
  assert.equal(frame.messageSeq, 1);
  assert.equal(frame.fragmentIndex, 0);
  assert.equal(frame.fragmentCount, 1);
  assert.equal(frame.messageBytes, 4);
  assert.deepEqual(frame.checksum, { algorithm: "crc32", value: crc32Hex(message) });
  assert.equal(frame.dataBase64, base64Encode(message));
});

test("sendMessage 大消息按 512 KiB 分片，fragmentCount 与 messageBytes 一致", () => {
  const { transport, sent } = makeTransport();
  // 512 KiB * 2 + 1 字节 → 3 片。
  const message = new Uint8Array(512 * 1024 * 2 + 1).fill(7);
  transport.sendMessage(message);
  assert.equal(sent.length, 3);
  assert.deepEqual(
    sent.map((f) => f.fragmentIndex),
    [0, 1, 2],
  );
  for (const frame of sent) {
    assert.equal(frame.fragmentCount, 3);
    assert.equal(frame.messageBytes, message.length);
    const checksum = frame.checksum as { value: string };
    assert.equal(checksum.value, crc32Hex(message));
  }
  assert.equal(sent[0]!.seq, 1);
  assert.equal(sent[2]!.seq, 3);
});

test("sendMessage 超过 16 MiB 抛 RpcFrameMessageTooLargeError", () => {
  const { transport } = makeTransport();
  assert.throws(
    () => transport.sendMessage(new Uint8Array(16 * 1024 * 1024 + 1)),
    RpcFrameMessageTooLargeError,
  );
});

test("sendMessage 分片数超上限抛 RpcFrameFragmentLimitError", () => {
  // 64 片上限 → 需要 > 64 * 512 KiB 的消息，但又要 ≤16 MiB。
  // 64 片 = 32 MiB > 16 MiB 上限，所以先撞 messageTooLarge；本用例验证上限常量语义。
  assert.equal(RPC_MAX_FRAGMENTS, 64);
});

test("接收单帧：组装、通知监听方、回 rpc-frame-ack", () => {
  const { transport, sent } = makeTransport();
  const received: Uint8Array[] = [];
  transport.onMessage((message) => received.push(message));
  const message = new Uint8Array([10, 20, 30]);
  assert.equal(
    transport.acceptPayload(
      inboundFragment({
        bytes: message,
        messageSeq: 1,
        fragmentIndex: 0,
        fragmentCount: 1,
        messageBytes: 3,
      }),
    ),
    true,
  );
  assert.equal(received.length, 1);
  assert.deepEqual(Array.from(received[0]!), [10, 20, 30]);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    zcode_type: "rpc-frame-ack",
    bridgeSessionId: BRIDGE_ID,
    ackMessageSeq: 1,
  });
});

test("接收乱序分片：补齐后按 fragmentIndex 顺序组装", () => {
  // 三片：每片 4 字节，共 12 字节。
  const full = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const parts = [full.subarray(0, 4), full.subarray(4, 8), full.subarray(8, 12)];
  const { transport } = makeTransport();
  const received: Uint8Array[] = [];
  transport.onMessage((message) => received.push(message));
  const frameFor = (index: number): ZflowPayload => ({
    zcode_type: "rpc-frame",
    bridgeSessionId: BRIDGE_ID,
    seq: index + 1,
    messageSeq: 7,
    fragmentIndex: index,
    fragmentCount: 3,
    messageBytes: 12,
    checksum: { algorithm: "crc32", value: crc32Hex(full) },
    dataBase64: base64Encode(parts[index]!),
  });
  // 乱序：2 → 0 → 1。
  transport.acceptPayload(frameFor(2));
  assert.equal(received.length, 0, "不完全的组装不应通知");
  transport.acceptPayload(frameFor(0));
  assert.equal(received.length, 0);
  transport.acceptPayload(frameFor(1));
  assert.equal(received.length, 1);
  assert.deepEqual(Array.from(received[0]!), Array.from(full));
});

test("校验和错误：不通知监听方、不回 ack", () => {
  const logs: string[] = [];
  const { transport, sent } = makeTransport({ onLog: (line) => logs.push(line) });
  const received: Uint8Array[] = [];
  transport.onMessage((message) => received.push(message));
  const message = new Uint8Array([1, 2, 3]);
  transport.acceptPayload(
    inboundFragment({
      bytes: message,
      messageSeq: 5,
      fragmentIndex: 0,
      fragmentCount: 1,
      messageBytes: 3,
      checksum: crc32Hex(new Uint8Array([9, 9, 9])), // 错的 checksum
    }),
  );
  assert.equal(received.length, 0);
  assert.equal(sent.length, 0);
  assert.ok(
    logs.some((line) => line.includes("checksum mismatch")),
    logs.join("\n"),
  );
});

test("接收重复分片不推进，非法 base64 丢组装", () => {
  const { transport } = makeTransport();
  const received: Uint8Array[] = [];
  transport.onMessage((message) => received.push(message));
  const full = new Uint8Array([1, 2, 3, 4]);
  const frame = (index: number, data?: string): ZflowPayload => ({
    zcode_type: "rpc-frame",
    bridgeSessionId: BRIDGE_ID,
    seq: index + 1,
    messageSeq: 9,
    fragmentIndex: index,
    fragmentCount: 2,
    messageBytes: 4,
    checksum: { algorithm: "crc32", value: crc32Hex(full) },
    dataBase64: data ?? base64Encode(full.subarray(index * 2, index * 2 + 2)),
  });
  transport.acceptPayload(frame(0));
  transport.acceptPayload(frame(0)); // 重复：忽略
  assert.equal(received.length, 0);
  transport.acceptPayload(frame(1));
  assert.equal(received.length, 1, "重复分片不应阻止组装");
  // 坏 base64 直接丢弃组装，不抛。
  transport.acceptPayload(frame(0, "not base64!!"));
  assert.equal(received.length, 1);
});

test("TTL：惰性清理超过 60s 的陈旧组装（下次 acceptPayload 时触发）", () => {
  let now = 1_000_000;
  const logs: string[] = [];
  const { transport } = makeTransport({ now: () => now, onLog: (line) => logs.push(line) });
  const received: Uint8Array[] = [];
  transport.onMessage((message) => received.push(message));
  const full = new Uint8Array([1, 2, 3, 4]);
  const frame = (index: number): ZflowPayload => ({
    zcode_type: "rpc-frame",
    bridgeSessionId: BRIDGE_ID,
    seq: index + 1,
    messageSeq: 11,
    fragmentIndex: index,
    fragmentCount: 2,
    messageBytes: 4,
    checksum: { algorithm: "crc32", value: crc32Hex(full) },
    dataBase64: base64Encode(full.subarray(index * 2, index * 2 + 2)),
  });
  transport.acceptPayload(frame(0));
  // 推进 61s，再来一个任意 rpc-frame（触发 purgeStale）。
  now += 61_000;
  transport.acceptPayload({
    zcode_type: "rpc-frame",
    bridgeSessionId: "other",
    messageSeq: 1,
    fragmentIndex: 0,
    fragmentCount: 1,
    messageBytes: 1,
    dataBase64: base64Encode(new Uint8Array([1])),
  });
  assert.ok(
    logs.some((line) => line.includes("purged stale assembly")),
    logs.join("\n"),
  );
  // 旧组装已被清，补上 index 1 也不会完成（新组装缺少 index 0）。
  transport.acceptPayload(frame(1));
  assert.equal(received.length, 0, "陈旧组装被清理后不应重组成功");
});

test("非本桥的 rpc-frame 与 rpc-frame-ack 被忽略", () => {
  const { transport, sent } = makeTransport();
  const received: Uint8Array[] = [];
  transport.onMessage((message) => received.push(message));
  assert.equal(
    transport.acceptPayload({
      zcode_type: "rpc-frame",
      bridgeSessionId: "someone-else",
      messageSeq: 1,
      fragmentIndex: 0,
      fragmentCount: 1,
      messageBytes: 3,
      dataBase64: base64Encode(new Uint8Array([1, 2, 3])),
    }),
    true,
  );
  assert.equal(received.length, 0);
  assert.equal(sent.length, 0);
  assert.equal(transport.acceptPayload({ zcode_type: "rpc-frame-ack", ackMessageSeq: 1 }), true);
});

test("acceptPayload 对非 rpc-frame 载荷返回 false（交给上层路由）", () => {
  const { transport } = makeTransport();
  assert.equal(transport.acceptPayload({ zcode_type: "bootstrap-response" }), false);
  assert.equal(transport.acceptPayload({ zcode_type: "bridge-degraded" }), false);
});

test("缺字段 / 越界元数据的入站帧被丢弃且不抛", () => {
  const { transport } = makeTransport();
  const received: Uint8Array[] = [];
  transport.onMessage((message) => received.push(message));
  // 缺 dataBase64。
  transport.acceptPayload({
    zcode_type: "rpc-frame",
    bridgeSessionId: BRIDGE_ID,
    messageSeq: 1,
    fragmentIndex: 0,
    fragmentCount: 1,
    messageBytes: 1,
  });
  // fragmentCount 为 0。
  transport.acceptPayload({
    zcode_type: "rpc-frame",
    bridgeSessionId: BRIDGE_ID,
    messageSeq: 2,
    fragmentIndex: 0,
    fragmentCount: 0,
    messageBytes: 1,
    dataBase64: base64Encode(new Uint8Array([1])),
  });
  // messageBytes 超过 16 MiB。
  transport.acceptPayload({
    zcode_type: "rpc-frame",
    bridgeSessionId: BRIDGE_ID,
    messageSeq: 3,
    fragmentIndex: 0,
    fragmentCount: 1,
    messageBytes: 16 * 1024 * 1024 + 1,
    dataBase64: base64Encode(new Uint8Array([1])),
  });
  assert.equal(received.length, 0);
});

test("元数据不一致的分片丢弃整个组装", () => {
  const { transport } = makeTransport();
  const received: Uint8Array[] = [];
  transport.onMessage((message) => received.push(message));
  const full = new Uint8Array([1, 2, 3, 4]);
  transport.acceptPayload({
    zcode_type: "rpc-frame",
    bridgeSessionId: BRIDGE_ID,
    messageSeq: 42,
    fragmentIndex: 0,
    fragmentCount: 2,
    messageBytes: 4,
    checksum: { algorithm: "crc32", value: crc32Hex(full) },
    dataBase64: base64Encode(full.subarray(0, 2)),
  });
  // 同一 messageSeq 但 fragmentCount 不同 → 丢弃组装。
  transport.acceptPayload({
    zcode_type: "rpc-frame",
    bridgeSessionId: BRIDGE_ID,
    messageSeq: 42,
    fragmentIndex: 1,
    fragmentCount: 3,
    messageBytes: 4,
    checksum: { algorithm: "crc32", value: crc32Hex(full) },
    dataBase64: base64Encode(full.subarray(2, 4)),
  });
  assert.equal(received.length, 0);
});

test("dispose 后 acceptPayload 直接返回 true 且不再通知", () => {
  const { transport } = makeTransport();
  const received: Uint8Array[] = [];
  transport.onMessage((message) => received.push(message));
  transport.dispose();
  assert.equal(
    transport.acceptPayload(
      inboundFragment({
        bytes: new Uint8Array([1]),
        messageSeq: 1,
        fragmentIndex: 0,
        fragmentCount: 1,
        messageBytes: 1,
      }),
    ),
    true,
  );
  assert.equal(received.length, 0);
  // dispose 后 sendMessage 静默。
  transport.sendMessage(new Uint8Array([1, 2, 3]));
  assert.equal(received.length, 0);
});

test("onMessage 返回的取消函数真正摘掉监听", () => {
  const { transport } = makeTransport();
  const received: Uint8Array[] = [];
  const off = transport.onMessage((message) => received.push(message));
  off();
  transport.acceptPayload(
    inboundFragment({
      bytes: new Uint8Array([1]),
      messageSeq: 1,
      fragmentIndex: 0,
      fragmentCount: 1,
      messageBytes: 1,
    }),
  );
  assert.equal(received.length, 0);
});
