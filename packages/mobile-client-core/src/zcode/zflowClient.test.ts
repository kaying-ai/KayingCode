// zflowClient 门面：relay 请求/响应、入站路由、配对等待、生命周期。
//
// 桥生命周期（打开/降级/恢复/看门狗）在 zflowBridge.test.ts；共享装置见
// zflowClientTestHarness.ts（架构策略 400 行上限对测试文件同样生效）。
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  FakeSocket,
  flushMicrotasks,
  lastViewState,
  setup,
  TEST_PARAMS,
} from "./zflowClientTestHarness.js";
import { ZflowClient } from "./zflowClient.js";
import { ManualZflowTimePorts } from "./zflowTypes.js";
import { base64Encode } from "./wireBase64.js";
import { crc32Hex } from "./crc32.js";

test("bootstrap 往返：request 匹配 response 并返回 result", async () => {
  const { client, socket } = await setup();
  const pending = client.bootstrap();
  await flushMicrotasks();
  const request = socket.payloadsOfType("bootstrap-request").at(-1)!;
  socket.emit({
    type: "data",
    payload: {
      zcode_type: "bootstrap-response",
      requestId: request.requestId,
      result: { workspaces: [{ workspaceKey: "wk-1" }] },
    },
  });
  assert.deepEqual(await pending, { workspaces: [{ workspaceKey: "wk-1" }] });
});

test("listWorkspaces 返回 result 字段", async () => {
  const { client, socket } = await setup();
  const pending = client.listWorkspaces();
  await flushMicrotasks();
  const request = socket.payloadsOfType("workspace-list-request").at(-1)!;
  socket.emit({
    type: "data",
    payload: {
      zcode_type: "workspace-list-response",
      requestId: request.requestId,
      result: ["wk-1", "wk-2"],
    },
  });
  assert.deepEqual(await pending, ["wk-1", "wk-2"]);
});

test("request 超时：拒绝并在 relay 队列里撤单", async () => {
  const { client, socket, time } = await setup({ paired: false });
  const pending = client.request(
    { zcode_type: "bootstrap-request", requestId: "r-timeout" },
    () => false,
    5_000,
  );
  time.advance(5_000);
  await assert.rejects(pending, /request r-timeout timed out/);
  // 之后配对，不应再冲刷出这条已超时请求。
  socket.emit({ type: "auth_ack", pair_status: "matched" });
  assert.equal(socket.payloadsOfType("bootstrap-request").length, 0);
});

test("workspace-list-updated 分发给监听方，且可退订", async () => {
  const { client, socket } = await setup();
  const received: unknown[] = [];
  const off = client.onWorkspaceListUpdated((result) => received.push(result));
  socket.emit({
    type: "data",
    payload: { zcode_type: "workspace-list-updated", result: ["wk-1"] },
  });
  assert.deepEqual(received, [["wk-1"]]);
  off();
  socket.emit({
    type: "data",
    payload: { zcode_type: "workspace-list-updated", result: ["wk-2"] },
  });
  assert.equal(received.length, 1, "退订后不应再收到");
});

test("sendMobileViewState：viewState 带 activeWorkspaceKey 与 updatedAt", async () => {
  const { client, socket } = await setup();
  client.sendMobileViewState({ workspaceKey: "wk-1", taskId: "t-1" });
  const payload = lastViewState(socket)!;
  assert.equal(payload.viewState.activeWorkspaceKey, "wk-1");
  assert.equal(payload.viewState.activeTaskId, "t-1");
  assert.equal(typeof payload.viewState.updatedAt, "number");
  assert.deepEqual(payload.deviceInfo, {
    platform: "web",
    version: "web",
    name: "Test Phone",
  });
});

test("waitPaired：已配对立即 resolve", async () => {
  const { client } = await setup();
  await client.waitPaired(1_000);
});

test("waitPaired：未配对超时拒绝", async () => {
  const time = new ManualZflowTimePorts();
  const socket = new FakeSocket();
  const client = new ZflowClient(TEST_PARAMS, { time, getTerminalToken: async () => "fixture-token", socketFactory: () => socket });
  const started = client.connect();
  socket.open();
  await started;
  const pending = client.waitPaired(5_000);
  time.advance(5_000);
  await assert.rejects(pending, /pairing timeout/);
});

test("waitPaired：relay failure 立即 fail-fast（不等超时）", async () => {
  const time = new ManualZflowTimePorts();
  const socket = new FakeSocket();
  const client = new ZflowClient(TEST_PARAMS, { time, getTerminalToken: async () => "fixture-token", socketFactory: () => socket });
  const started = client.connect();
  socket.open();
  await started;
  const pending = client.waitPaired(60_000);
  socket.emit({ type: "error", code: "KICKED", message: "gone" });
  await assert.rejects(pending, /kicked/);
});

test("pokeRelay 透传到 relay（发 pair_status_query）", async () => {
  const { client, socket } = await setup();
  const before = socket.sent.length;
  client.pokeRelay();
  assert.equal(socket.sent.length, before + 1);
  assert.equal(socket.frames().at(-1)!.type, "pair_status_query");
});

test("dispose：reject 所有 pending 请求并关闭 relay", async () => {
  const { client, socket } = await setup();
  const pending = client.bootstrap();
  await flushMicrotasks();
  assert.ok(socket.payloadsOfType("bootstrap-request").length > 0);
  client.dispose();
  await assert.rejects(pending, /zflow client disposed/);
  assert.equal(client.relay.state, "closed");
});

test("reconnectWorkspace 公开 API：匹配 requestId + workspaceKey", async () => {
  const { client, socket } = await setup();
  const pending = client.reconnectWorkspace("wk-1");
  await flushMicrotasks();
  const request = socket.payloadsOfType("workspace-reconnect-request").at(-1)!;
  // 错误的 workspaceKey 不应兑现。
  socket.emit({
    type: "data",
    payload: {
      zcode_type: "workspace-reconnect-response",
      requestId: request.requestId,
      workspaceKey: "other",
      success: true,
    },
  });
  await flushMicrotasks();
  socket.emit({
    type: "data",
    payload: {
      zcode_type: "workspace-reconnect-response",
      requestId: request.requestId,
      workspaceKey: "wk-1",
      success: true,
    },
  });
  assert.equal((await pending).success, true);
});

test("request 的 matcher 逐载荷试匹配（响应不回显 requestId 也能命中）", async () => {
  const { client, socket } = await setup();
  const pending = client.request(
    { zcode_type: "workspace-reconnect-request", requestId: "r-1", workspaceKey: "wk-1" },
    (payload) => payload.zcode_type === "workspace-reconnect-response" && payload.success === true,
    5_000,
  );
  await flushMicrotasks();
  assert.ok(socket.payloadsOfType("workspace-reconnect-request").length > 0);
  // 故意不回显 requestId。
  socket.emit({
    type: "data",
    payload: { zcode_type: "workspace-reconnect-response", success: true },
  });
  assert.equal((await pending).success, true);
});

test("rpc-frame 进入桥路由而非 pendingRequests（无桥时不兑现任何请求）", async () => {
  const { client, socket } = await setup();
  // 无任何 pending 请求时喂 rpc-frame，不应抛错也不应影响状态。
  const bytes = new Uint8Array([1, 2, 3, 4]);
  socket.emit({
    type: "data",
    payload: {
      zcode_type: "rpc-frame",
      bridgeSessionId: "unknown-bridge",
      seq: 1,
      messageSeq: 1,
      fragmentIndex: 0,
      fragmentCount: 1,
      messageBytes: 4,
      checksum: { algorithm: "crc32", value: crc32Hex(bytes) },
      dataBase64: base64Encode(bytes),
    },
  });
  assert.equal(client.relay.state, "paired", "状态不应被未知桥帧改变");
});
