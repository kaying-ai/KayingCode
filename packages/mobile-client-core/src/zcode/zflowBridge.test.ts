// 桥生命周期：打开/换栈、早期帧缓冲冲刷、降级恢复、看门狗。
//
// 这是本次移植的核心风险面——桥簿记从 zflowClient 拆到 ZflowBridgeManager 后，
// 两端等价性必须由端到端用例守住（relay 假 socket + 手动时间）。
// 门面其余行为见 zflowClient.test.ts；共享装置见 zflowClientTestHarness.ts。
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  flushMicrotasks,
  lastViewState,
  openBridgeForTest,
  rpcFrame,
  setup,
} from "./zflowClientTestHarness.js";

test("openBridge：ready 后补发 mobile-view-state（取桥覆盖的 effectiveKey/initialTaskId）", async () => {
  const harness = await setup();
  const { client, socket } = harness;
  const pending = client.openBridge("requested-key");
  await flushMicrotasks();
  const open = socket.payloadsOfType("workspace-bridge-open").at(-1)!;
  socket.emit({
    type: "data",
    payload: {
      zcode_type: "workspace-bridge-ready",
      bridgeSessionId: open.bridgeSessionId,
      bridge: {
        bridgeSessionId: open.bridgeSessionId,
        workspaceKey: "effective-key",
        initialTaskId: "task-9",
      },
    },
  });
  const session = await pending;
  assert.equal(session.workspaceKey, "effective-key");
  // manager 不发 view-state，客户端必须补发——这是 Flutter openBridge 的行为。
  assert.equal(socket.payloadsOfType("mobile-view-state-update").length, 1);
  const viewState = lastViewState(socket)!;
  assert.equal(viewState.viewState.activeWorkspaceKey, "effective-key");
  assert.equal(viewState.viewState.activeTaskId, "task-9");
});

test("openBridge 失败：workspace-bridge-error 抛错且不补发 view-state", async () => {
  const harness = await setup();
  const { client, socket } = harness;
  const pending = client.openBridge("wk-1");
  await flushMicrotasks();
  const open = socket.payloadsOfType("workspace-bridge-open").at(-1)!;
  socket.emit({
    type: "data",
    payload: {
      zcode_type: "workspace-bridge-error",
      bridgeSessionId: open.bridgeSessionId,
      error: "denied",
    },
  });
  await assert.rejects(pending, /workspace-bridge-error: denied/);
  assert.equal(socket.payloadsOfType("mobile-view-state-update").length, 0);
  assert.equal(client.bridges.length, 0, "失败的桥不应留在 bookkeeping 里");
});

test("bridges getter 透传 manager 的活动桥集合", async () => {
  const harness = await setup();
  const { client } = harness;
  assert.equal(client.bridges.length, 0);
  const { session } = await openBridgeForTest(harness);
  assert.equal(client.bridges.length, 1);
  assert.equal(client.bridges[0], session);
});

test("桥帧先于注册到达：缓冲不丢，ready 之后的帧正常投递", async () => {
  const harness = await setup();
  const { client, socket } = harness;
  const pending = client.openBridge("wk-1");
  await flushMicrotasks();
  const open = socket.payloadsOfType("workspace-bridge-open").at(-1)!;
  const bridgeSessionId = open.bridgeSessionId as string;

  // 关键时序：桌面在 openBridge 的 await 续体挂传输之前就推帧
  //（真机上即 IPC Initialize）。此帧必须被缓冲而非丢弃。
  socket.emit({
    type: "data",
    payload: rpcFrame({ bridgeSessionId, messageSeq: 1, bytes: new Uint8Array([1, 2, 3, 4]) }),
  });
  socket.emit({
    type: "data",
    payload: {
      zcode_type: "workspace-bridge-ready",
      bridgeSessionId,
      bridge: { bridgeSessionId, workspaceKey: "wk-1" },
    },
  });
  const session = await pending;
  assert.equal(client.bridges.length, 1);

  // ready 之后注册监听并再推一帧，验证路由已挂好。
  const received: Uint8Array[] = [];
  session.transport.onMessage((message) => received.push(message));
  socket.emit({
    type: "data",
    payload: rpcFrame({ bridgeSessionId, messageSeq: 2, bytes: new Uint8Array([9, 9, 9, 9]) }),
  });
  assert.equal(received.length, 1);
  assert.deepEqual(Array.from(received[0]!), [9, 9, 9, 9]);
});

test("rpc-frame-ack 由 manager 路由，不进入 pendingRequests", async () => {
  const harness = await setup();
  const { socket } = harness;
  const { bridgeSessionId } = await openBridgeForTest(harness);
  socket.emit({
    type: "data",
    payload: { zcode_type: "rpc-frame-ack", bridgeSessionId, ackMessageSeq: 1 },
  });
  assert.equal(harness.client.bridges.length, 1);
});

test("bridge-degraded → 廉价恢复（workspace-reconnect）成功后清降级并计数", async () => {
  const harness = await setup();
  const { socket } = harness;
  const { session, bridgeSessionId } = await openBridgeForTest(harness);
  assert.equal(session.degraded, null);
  assert.equal(session.recovered, 0);

  socket.emit({
    type: "data",
    payload: { zcode_type: "bridge-degraded", bridgeSessionId, reason: "rpc-transport-fault" },
  });
  await flushMicrotasks();
  // 恢复循环启动后立刻转入 recovering（不再停在原始原因）。
  assert.ok(
    session.degraded === "rpc-transport-fault" || session.degraded === "recovering",
    `degraded 应为原始原因或 recovering，实际 ${String(session.degraded)}`,
  );
  const reconnect = socket.payloadsOfType("workspace-reconnect-request").at(-1)!;
  assert.equal(reconnect.workspaceKey, "wk-1");
  socket.emit({
    type: "data",
    payload: {
      zcode_type: "workspace-reconnect-response",
      requestId: reconnect.requestId,
      workspaceKey: "wk-1",
      success: true,
    },
  });
  await flushMicrotasks(16);
  assert.equal(session.degraded, null, "廉价恢复成功后应清降级");
  assert.equal(session.recovered, 1);
});

test("廉价恢复失败 → 回退到完整重开（reopenBridge，新 bridgeSessionId）", async () => {
  const harness = await setup();
  const { client, socket } = harness;
  const { session, bridgeSessionId: firstId } = await openBridgeForTest(harness);

  socket.emit({
    type: "data",
    payload: {
      zcode_type: "bridge-degraded",
      bridgeSessionId: firstId,
      reason: "rpc-transport-fault",
    },
  });
  await flushMicrotasks();
  // 廉价路径回 success:false。
  const reconnect = socket.payloadsOfType("workspace-reconnect-request").at(-1)!;
  socket.emit({
    type: "data",
    payload: {
      zcode_type: "workspace-reconnect-response",
      requestId: reconnect.requestId,
      workspaceKey: "wk-1",
      success: false,
    },
  });
  await flushMicrotasks(16);
  // 兜底：发起新的 workspace-bridge-open，并把新栈换进同一 session。
  const reopens = socket.payloadsOfType("workspace-bridge-open");
  assert.ok(reopens.length >= 2, `应发起重开，实际 ${reopens.length} 次 open`);
  const reopen = reopens.at(-1)!;
  const secondId = reopen.bridgeSessionId as string;
  assert.notEqual(secondId, firstId, "重开应换新的 bridgeSessionId");
  socket.emit({
    type: "data",
    payload: {
      zcode_type: "workspace-bridge-ready",
      bridgeSessionId: secondId,
      bridge: { bridgeSessionId: secondId, workspaceKey: "wk-1" },
    },
  });
  await flushMicrotasks(16);
  assert.equal(session.degraded, null, "重开成功后应清降级");
  assert.equal(session.recovered, 1);
  assert.equal(client.bridges.length, 1, "换栈不应新增桥");
  assert.equal(session.bridge.bridgeSessionId, secondId, "session 应持有新栈");
});

test("relay 重连（reconnecting→paired）触发所有活动桥恢复", async () => {
  const harness = await setup();
  const { socket, time } = harness;
  const { session } = await openBridgeForTest(harness);

  // 断链 → reconnecting：桥应立刻标降级，让在途命令卡在恢复门上。
  socket.emitClose(1006, "network");
  assert.equal(session.degraded, "reconnecting");
  // 退避到期后重连，重新配对即触发桥恢复。
  time.advance(1_000);
  await flushMicrotasks(16);
  socket.emit({ type: "auth_ack", device_sid: "sid-1", pair_status: "matched" });
  await flushMicrotasks();
  const reconnect = socket.payloadsOfType("workspace-reconnect-request").at(-1);
  assert.ok(reconnect !== undefined, "重配对后应触发桥恢复");
  socket.emit({
    type: "data",
    payload: {
      zcode_type: "workspace-reconnect-response",
      requestId: reconnect!.requestId,
      workspaceKey: "wk-1",
      success: true,
    },
  });
  await flushMicrotasks(16);
  assert.equal(session.degraded, null);
});

test("看门狗：桥帧静默跨过阈值跳点才触发主动重连（限频 30s）", async () => {
  const harness = await setup();
  const { socket, time, logs } = harness;
  const { bridgeSessionId } = await openBridgeForTest(harness);
  // 记一次桥帧活性（看门狗只以 rpc-frame 到达为活性信号）。
  socket.emit({
    type: "data",
    payload: rpcFrame({ bridgeSessionId, messageSeq: 1, bytes: new Uint8Array([1, 2, 3, 4]) }),
  });
  const before = socket.payloadsOfType("workspace-reconnect-request").length;

  // 看门狗每 10s 一跳、阈值 25s：+10s 与 +20s 两跳看到的静默都不足 25s，
  // 首个能观察到超阈值的跳点在 +30s。只推到 +26s 会停在两次「不足阈值」
  // 的跳点之间——这不是代码问题，是探针推进量不足。
  time.advance(26_000);
  await flushMicrotasks(16);
  assert.equal(
    socket.payloadsOfType("workspace-reconnect-request").length,
    before,
    "+26s 尚未跨过可观察阈值的那一跳，不应触发",
  );
  time.advance(4_000); // 到 +30s，跨过跳点
  await flushMicrotasks(16);
  assert.ok(
    socket.payloadsOfType("workspace-reconnect-request").length > before,
    `看门狗应触发 reconnectWorkspace；日志：${logs.filter((l) => l.includes("watchdog")).join(" | ")}`,
  );
  assert.ok(
    logs.some((line) => line.includes("[watchdog]")),
    "应记录看门狗日志",
  );
});

test("看门狗限频：30s 内不重复触发第二次恢复", async () => {
  const harness = await setup();
  const { socket, time } = harness;
  const { bridgeSessionId } = await openBridgeForTest(harness);
  socket.emit({
    type: "data",
    payload: rpcFrame({ bridgeSessionId, messageSeq: 1, bytes: new Uint8Array([1, 2, 3, 4]) }),
  });
  // 跨过 +30s 跳点，触发第一次恢复。
  time.advance(30_000);
  await flushMicrotasks(16);
  const firstCount = socket.payloadsOfType("workspace-reconnect-request").length;
  assert.ok(firstCount > 0, "首次应触发");
  // 再推 10s（仍在 30s 限频窗口内）→ 不应再有新的恢复请求。
  time.advance(10_000);
  await flushMicrotasks(16);
  assert.equal(
    socket.payloadsOfType("workspace-reconnect-request").length,
    firstCount,
    "限频窗口内不应重复触发",
  );
});

test("多个桥共用同一 manager：桥帧按 bridgeSessionId 各自路由", async () => {
  const harness = await setup();
  const { client, socket } = harness;
  const first = await openBridgeForTest(harness, "wk-1");
  // 第二个桥：用同一装置手工开（openBridgeForTest 依赖 .at(-1) 取最后一条 open）。
  const pending = client.openBridge("wk-2");
  await flushMicrotasks();
  const open = socket.payloadsOfType("workspace-bridge-open").at(-1)!;
  const secondId = open.bridgeSessionId as string;
  socket.emit({
    type: "data",
    payload: {
      zcode_type: "workspace-bridge-ready",
      bridgeSessionId: secondId,
      bridge: { bridgeSessionId: secondId, workspaceKey: "wk-2" },
    },
  });
  const second = await pending;
  assert.equal(client.bridges.length, 2);

  const firstReceived: Uint8Array[] = [];
  const secondReceived: Uint8Array[] = [];
  first.session.transport.onMessage((message) => firstReceived.push(message));
  second.transport.onMessage((message) => secondReceived.push(message));
  socket.emit({
    type: "data",
    payload: rpcFrame({
      bridgeSessionId: first.bridgeSessionId,
      messageSeq: 1,
      bytes: new Uint8Array([1]),
    }),
  });
  socket.emit({
    type: "data",
    payload: rpcFrame({ bridgeSessionId: secondId, messageSeq: 1, bytes: new Uint8Array([2]) }),
  });
  assert.equal(firstReceived.length, 1, "桥 1 只应收到自己的帧");
  assert.equal(secondReceived.length, 1, "桥 2 只应收到自己的帧");
  assert.deepEqual(Array.from(firstReceived[0]!), [1]);
  assert.deepEqual(Array.from(secondReceived[0]!), [2]);
});

test("dispose 关闭所有桥并停止看门狗", async () => {
  const harness = await setup();
  const { client, socket, time } = harness;
  const { session, bridgeSessionId } = await openBridgeForTest(harness);
  socket.emit({
    type: "data",
    payload: rpcFrame({ bridgeSessionId, messageSeq: 1, bytes: new Uint8Array([1, 2, 3, 4]) }),
  });
  client.dispose();
  assert.equal(session.isDisposed, true);
  assert.equal(client.bridges.length, 0);
  // 看门狗已停：推进时间不应再产生任何恢复请求。
  const before = socket.payloadsOfType("workspace-reconnect-request").length;
  time.advance(60_000);
  await flushMicrotasks(16);
  assert.equal(socket.payloadsOfType("workspace-reconnect-request").length, before);
});
