import assert from "node:assert/strict";
import { test } from "vitest";
import { ZcodeRelayClient } from "./zcodeRelayClient.js";
import { ManualZflowTimePorts } from "./zflowTypes.js";
import { FakeSocket } from "./zflowClientTestHarness.js";

const PARAMS = {
  deviceSid: "sid-1",
  passHash: "pass-hash-1",
  deviceName: "Test Phone",
  appVersion: "1.2.3",
  platformName: "weapp",
  relayWsUrl: "wss://relay.example.com/ws?mid=m1",
};

test("V2 获取一次新 token，秒级 auth_init 无 role/proof，鉴权和 sid 门禁阻挡提前 data", async () => {
  const sockets: FakeSocket[] = [];
  const urls: string[] = [],
    logs: string[] = [];
  const token = "sensitive-terminal-token";
  const client = new ZcodeRelayClient(
    {
      ...PARAMS,
      protocol: "v2",
      relayWsUrl: "wss://relay.example.com/api/v1/remote/ws2?mid=machine",
    },
    {
      getTerminalToken: async () => token,
      time: new ManualZflowTimePorts(),
      onLog: (line) => logs.push(line),
      socketFactory: (url) => {
        urls.push(url);
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
    },
  );
  const received: unknown[] = [];
  client.onPayload((value) => received.push(value));
  const started = client.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  sockets[0]!.open();
  await started;
  const init = sockets[0]!.frames().at(-1)!;
  assert.equal(init.role, undefined);
  assert.equal(init.proof, undefined);
  assert.ok((init.client_ts as number) < 10_000_000_000);
  assert.equal(new URL(urls[0]!).searchParams.get("token"), token);
  sockets[0]!.emit({ type: "data", payload: { zcode_type: "early" } });
  sockets[0]!.emit({ type: "auth_ack", device_sid: "other", pair_status: "matched" });
  assert.equal(client.state, "authenticating");
  assert.equal(received.length, 0);
  sockets[0]!.emit({ type: "auth_ack", device_sid: PARAMS.deviceSid, pair_status: "matched" });
  sockets[0]!.emit({ type: "data", payload: { zcode_type: "accepted" } });
  assert.equal(client.state, "paired");
  assert.equal(received.length, 1);
  assert.ok(logs.every((line) => !line.includes(token)));
  client.dispose();
});

test("V2 token 晚到时已 dispose，不创建 socket", async () => {
  const pending = Promise.withResolvers<string>();
  let sockets = 0;
  const client = new ZcodeRelayClient(
    { ...PARAMS, protocol: "v2" },
    {
      getTerminalToken: () => pending.promise,
      socketFactory: () => {
        sockets++;
        return new FakeSocket();
      },
    },
  );
  const started = client.start();
  client.dispose();
  pending.resolve("late");
  await started;
  assert.equal(sockets, 0);
  assert.equal(client.state, "closed");
});

test("V2 重连重新获取 token，AUTH_FAILED 明确结束连接", async () => {
  let calls = 0;
  const sockets: FakeSocket[] = [],
    urls: string[] = [];
  const time = new ManualZflowTimePorts();
  const client = new ZcodeRelayClient(
    { ...PARAMS, protocol: "v2" },
    {
      time,
      getTerminalToken: async () => `token-${++calls}`,
      socketFactory: (url) => {
        urls.push(url);
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
    },
  );
  const started = client.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  sockets[0]!.open();
  await started;
  sockets[0]!.emit({ type: "auth_ack", device_sid: PARAMS.deviceSid, pair_status: "matched" });
  sockets[0]!.emitClose();
  time.advance(1_000);
  await new Promise<void>((resolve) => setImmediate(resolve));
  sockets[1]!.open();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(new URL(urls[1]!).searchParams.get("token"), "token-2");
  sockets[1]!.emit({ type: "error", code: "AUTH_FAILED" });
  assert.equal(client.state, "error");
  assert.equal(client.failure?.reason, "auth-required");
  time.advance(60_000);
  assert.equal(calls, 2);
  client.dispose();
});
