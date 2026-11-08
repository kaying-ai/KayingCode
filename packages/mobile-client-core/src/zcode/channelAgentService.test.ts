import assert from "node:assert/strict";
import { test } from "vitest";
import { BridgeSession } from "./bridgeSession.js";
import {
  ChannelClient,
  CHANNEL_REQ_EVENT_LISTEN,
  CHANNEL_REQ_PROMISE,
  CHANNEL_RES_EVENT_FIRE,
  CHANNEL_RES_INITIALIZE,
  CHANNEL_RES_PROMISE_SUCCESS,
  Channels,
} from "./channelClient.js";
import { RpcFrameTransport } from "./rpcFrameTransport.js";
import { ValueReader, ValueWriter, decodeValue, encodeValue } from "./valueCodec.js";
import { ChannelBackedKayingCodeAgentService } from "./channelAgentService.js";
import { RelayAgentConnection } from "../relayAgentConnection.js";
import type { MobileAgentService } from "../mobileAgentService.js";

function response(type: number, id: number, data: unknown): Uint8Array {
  const writer = new ValueWriter();
  encodeValue(writer, [type, id]);
  encodeValue(writer, data);
  return writer.toBytes();
}

function harness() {
  const calls: Array<{ type: number; id: number; channel: string; method: string; args: unknown }> =
    [];
  const bridge = new BridgeSession({ workspaceKey: "identity" });
  let eventId = -1;
  const channels = new ChannelClient({
    sendBody(body) {
      const reader = new ValueReader(body);
      const [type, id, channel, method] = decodeValue(reader) as [number, number, string, string];
      const args = decodeValue(reader);
      calls.push({ type, id, channel, method, args });
      if (type === CHANNEL_REQ_EVENT_LISTEN) eventId = id;
      if (type === CHANNEL_REQ_PROMISE) {
        queueMicrotask(() =>
          channels.handleMessage(
            response(CHANNEL_RES_PROMISE_SUCCESS, id, {
              ack: { subscriptionId: "sub-1" },
            }),
          ),
        );
      }
    },
  });
  bridge.swapStack({
    bridge: { workspaceKey: "identity" },
    channels,
    transport: new RpcFrameTransport({ bridgeSessionId: "bridge-1", sendPayload: () => {} }),
  });
  channels.handleMessage(response(CHANNEL_RES_INITIALIZE, 0, null));
  return {
    bridge,
    calls,
    fire(data: unknown) {
      assert.notEqual(eventId, -1);
      channels.handleMessage(response(CHANNEL_RES_EVENT_FIRE, eventId, data));
    },
  };
}

test("通道 agent 按 Flutter 的单对象参数与 scope 调用 V4", async () => {
  const { bridge, calls } = harness();
  const agent = new ChannelBackedKayingCodeAgentService(bridge, {
    workspacePath: "/repo",
    workspaceIdentity: "identity",
  });
  await agent.helloConversationV4();
  await agent.subscribeConversationV4({ workspacePath: "/ignored", sessionId: "session-1" });
  await agent.sendConversationCommandV4({
    workspacePath: "/ignored",
    envelope: { commandId: "c" } as never,
  });
  assert.deepEqual(
    calls.map(({ channel, method }) => [channel, method]),
    [
      [Channels.zcodeAgent, "helloConversationV4"],
      [Channels.zcodeAgent, "subscribeConversationV4"],
      [Channels.zcodeAgent, "sendConversationCommandV4"],
    ],
  );
  assert.deepEqual(calls[0]?.args, []);
  assert.deepEqual(calls[1]?.args, [
    { workspacePath: "/repo", workspaceIdentity: "identity", sessionId: "session-1" },
  ]);
  const sent = calls[2];
  assert.ok(sent);
  assert.equal(
    (sent.args as Array<{ envelope: { commandId: string } }>)[0]?.envelope.commandId,
    "c",
  );
  bridge.dispose();
});

test("动态帧在订阅 RPC 前登记且非法信封被拒绝", async () => {
  const { bridge, calls, fire } = harness();
  const agent = new ChannelBackedKayingCodeAgentService(bridge, { workspacePath: "/repo" });
  const received: unknown[] = [];
  const subscription = agent.onDynamicSessionsIndexFrame({ workspacePath: "/repo" })((wire) =>
    received.push(wire),
  );
  await agent.subscribeSessionsIndexV4({ workspacePath: "/repo", runtimePolicy: "existing-only" });
  assert.deepEqual(
    calls.slice(0, 2).map((call) => [call.type, call.method]),
    [
      [CHANNEL_REQ_EVENT_LISTEN, "onDynamicSessionsIndexFrame"],
      [CHANNEL_REQ_PROMISE, "subscribeSessionsIndexV4"],
    ],
  );
  fire({ kind: "garbage", topic: "sessions-index" });
  assert.equal(received.length, 0);
  subscription.dispose();
  bridge.dispose();
});

test("ZCode 桥接受宿主 desktop-continuous hello 并发送 mobileApp clientHello", async () => {
  let received: unknown = null;
  const agent = {
    helloConversationV4: async () => ({
      kind: "hello",
      protocolVersion: 3,
      connectionId: "bridge-conn",
      clientMode: "desktop-continuous",
      deliveryProfile: "continuous",
      serverTime: Date.now(),
      capabilities: {
        nativeDialogs: true,
        localTerminal: true,
        binaryFrames: false,
        compression: "none",
      },
      auth: {},
    }),
    initializeConversationV4: async (hello: unknown) => {
      received = hello;
    },
  } as MobileAgentService;
  const connection = await RelayAgentConnection.fromAgent(agent, { workspacePath: "/repo" }, null);
  assert.equal((received as { clientKind: string }).clientKind, "mobileApp");
  connection.dispose();
});
