import assert from "node:assert/strict";
import { test } from "vitest";
import { Emitter, SocketProtocol, VSBuffer } from "@zcode/rpc";
import {
  connectViaSocketLike,
  socketLikeFromISocket,
  socketLikeToISocket,
  type KayingCodeSocketLike,
  type SocketLikeCloseEvent,
} from "./socketLike.js";

// ---------------------------------------------------------------------------
// 内存 SocketLike 对：契约测试与未来 Relay mock 共用的最小回环实现
// ---------------------------------------------------------------------------

interface MemorySideState {
  onData: Emitter<Uint8Array>;
  onClose: Emitter<SocketLikeCloseEvent>;
  peerQueue: Uint8Array[];
  peerFlushScheduled: boolean;
  closed: boolean;
}

function flush(side: MemorySideState): void {
  side.peerFlushScheduled = false;
  const queued = side.peerQueue;
  side.peerQueue = [];
  for (const bytes of queued) {
    side.onData.fire(bytes);
  }
}

function createInMemorySocketLikePair(): [KayingCodeSocketLike, KayingCodeSocketLike] {
  const sideA: MemorySideState = {
    onData: new Emitter<Uint8Array>(),
    onClose: new Emitter<SocketLikeCloseEvent>(),
    peerQueue: [],
    peerFlushScheduled: false,
    closed: false,
  };
  const sideB: MemorySideState = {
    ...sideA,
    onData: new Emitter<Uint8Array>(),
    onClose: new Emitter<SocketLikeCloseEvent>(),
  };

  const deliver = (from: MemorySideState, to: MemorySideState, bytes: Uint8Array) => {
    if (from.closed || to.closed) return;
    to.peerQueue.push(bytes);
    if (!to.peerFlushScheduled) {
      to.peerFlushScheduled = true;
      setTimeout(() => flush(to), 0);
    }
  };

  const makeSocket = (self: MemorySideState, peer: MemorySideState): KayingCodeSocketLike => ({
    onData: self.onData.event,
    onClose: self.onClose.event,
    write: (bytes) => deliver(self, peer, bytes),
    close: () => {
      if (self.closed) return;
      self.closed = true;
      const event = { code: 1000, reason: "closed", wasClean: true };
      self.onClose.fire(event);
      peer.onClose.fire(event);
    },
  });

  return [makeSocket(sideA, sideB), makeSocket(sideB, sideA)];
}

function waitForClose(socket: KayingCodeSocketLike): Promise<SocketLikeCloseEvent> {
  return new Promise((resolve) => {
    socket.onClose((event) => resolve(event));
  });
}

test("SocketLike 契约：binary 帧按序完整交付", async () => {
  const [client, server] = createInMemorySocketLikePair();
  const received: Uint8Array[] = [];
  server.onData((bytes) => received.push(bytes));

  const encoder = new TextEncoder();
  const frames = [
    encoder.encode("small"),
    new Uint8Array(256 * 1024).fill(7),
    new Uint8Array(1024 * 1024).fill(9),
  ];
  for (const frame of frames) {
    await client.write(frame);
  }
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(received.length, 3);
  assert.equal(new TextDecoder().decode(received[0]), "small");
  assert.equal(received[1]?.length, 256 * 1024);
  assert.equal(received[1]?.[0], 7);
  assert.equal(received[2]?.length, 1024 * 1024);
  assert.equal(received[2]?.[1024 * 1024 - 1], 9);
});

test("dispose 数据监听后不再接收帧", async () => {
  const [client, server] = createInMemorySocketLikePair();
  const received: Uint8Array[] = [];
  const subscription = server.onData((bytes) => received.push(bytes));
  subscription.dispose();

  await client.write(new TextEncoder().encode("ignored"));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(received.length, 0);
});

test("close 通知对端并携带 CloseInfo；关闭后写入不投递也不抛错", async () => {
  const [client, server] = createInMemorySocketLikePair();
  const received: Uint8Array[] = [];
  server.onData((bytes) => received.push(bytes));
  const serverClosed = waitForClose(server);

  client.close();
  const event = await serverClosed;
  assert.deepEqual(event, { code: 1000, reason: "closed", wasClean: true });

  await client.write(new TextEncoder().encode("after-close"));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(received.length, 0);
});

test("socketLikeToISocket 桥：VSBuffer 写入转为 SocketLike 字节，对端关闭触发 onClose+onEnd", async () => {
  const [client, server] = createInMemorySocketLikePair();
  const isocket = socketLikeToISocket(server);
  // 回环方向：server 侧 ISocket 写入 → client 侧 SocketLike 收到。
  const received: string[] = [];
  let closeFired = false;
  let endFired = false;
  client.onData((bytes) => received.push(new TextDecoder().decode(bytes)));
  isocket.onClose(() => {
    closeFired = true;
  });
  isocket.onEnd(() => {
    endFired = true;
  });

  isocket.write(VSBuffer.fromString("via-isocket"));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(received, ["via-isocket"]);

  client.close();
  assert.equal(closeFired, true);
  assert.equal(endFired, true);
});

test("socketLikeFromISocket：ISocket 字节映射为 SocketLike 监听，close() 触发 socket.end()，onEnd 映射 wasClean=true", async () => {
  let ended = false;
  const emitterOnEnd = new Emitter<void>();
  const fakeSocket = {
    onData: new Emitter<VSBuffer>().event,
    onClose: new Emitter<void>().event,
    onEnd: emitterOnEnd.event,
    write: () => undefined,
    end: () => {
      ended = true;
    },
    drain: () => Promise.resolve(),
    dispose: () => undefined,
  };
  const socketLike = socketLikeFromISocket(fakeSocket);

  socketLike.close();
  assert.equal(ended, true);

  const closePromise = waitForClose(socketLike);
  emitterOnEnd.fire();
  const event = await closePromise;
  assert.equal(event.wasClean, true);
});

test("connectViaSocketLike → SocketProtocol 全链路帧回路", async () => {
  const [client, server] = createInMemorySocketLikePair();
  const accessor = connectViaSocketLike(client);
  assert.ok(accessor);

  const serverProtocol = new SocketProtocol(socketLikeToISocket(server));
  const received: string[] = [];
  serverProtocol.onMessage((buffer) => received.push(buffer.toString()));
  const clientProtocol = new SocketProtocol(socketLikeToISocket(client));

  clientProtocol.send(VSBuffer.fromString("ping-through-channelclient"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(received, ["ping-through-channelclient"]);
  serverProtocol.dispose();
  clientProtocol.dispose();
});
