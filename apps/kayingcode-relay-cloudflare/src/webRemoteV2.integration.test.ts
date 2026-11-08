import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  parseWebRemoteControlRelayV2IncomingMessage,
  parseWebRemoteControlRelayV2HttpResponse,
} from "@zcode/shared/web-remote-relay";
const origin = process.env.REMOTE_V2_TEST_ORIGIN;
const local = origin && ["127.0.0.1", "localhost"].includes(new URL(origin).hostname);
test("domain verification is served unchanged at the origin root", { skip: !local }, async () => {
  const file = "69txzPKb7q.txt";
  const expected = await readFile(new URL(`../domain-verification/${file}`, import.meta.url));
  const response = await fetch(`${origin}/${file}`, { redirect: "manual" });
  assert.equal(response.status, 200);
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(expected));
  assert.equal((await fetch(`${origin}/${file}`, { method: "HEAD" })).status, 200);
  assert.equal((await fetch(`${origin}/${file}`, { method: "POST" })).status, 405);
});
test(
  "V2 account, HTTP, roles, replay, socket leases and forwarding",
  { skip: !local, timeout: 30000 },
  async () => {
    async function call(path: string, body?: unknown, token?: string, method = "POST") {
      const response = await fetch(`${origin}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: (await response.json()) as any };
    }
    for (const path of ["/healthz", "/readyz", "/remote/v4", "/remote/mobile-web-manifest.json"]) {
      assert.equal((await fetch(`${origin}${path}`)).status, 200, path);
    }
    const manifest = (await (await fetch(`${origin}/remote/mobile-web-manifest.json`)).json()) as {
      notices: { productSha256: string; upstreamSha256: string };
    };
    for (const [file, expected] of [
      ["THIRD-PARTY-NOTICES.md", manifest.notices.productSha256],
      ["UPSTREAM-THIRD-PARTY-NOTICES.md", manifest.notices.upstreamSha256],
    ]) {
      const response = await fetch(`${origin}/remote/${file}`);
      assert.equal(response.status, 200, file);
      assert.equal(
        createHash("sha256")
          .update(Buffer.from(await response.arrayBuffer()))
          .digest("hex"),
        expected,
        file,
      );
    }
    const html = await (await fetch(`${origin}/remote/v4`)).text();
    assert.ok(html.includes('rel="license" href="/remote/THIRD-PARTY-NOTICES.md"'));
    assert.ok(html.includes('rel="license" href="/remote/UPSTREAM-THIRD-PARTY-NOTICES.md"'));
    for (const path of [
      "/v1/nodes",
      "/v1/client-config",
      "/v1/node/control",
      "/admin/",
      "/admin/api/v1/apps",
    ]) {
      assert.equal((await fetch(`${origin}${path}`)).status, 404, path);
    }
    const owner = randomBytes(32).toString("base64url");
    const other = randomBytes(32).toString("base64url");
    const a = await call("/api/v1/account/register", { ownerSecret: owner });
    assert.equal(a.status, 200);
    assert.equal(
      (await call("/api/v1/account/register", { ownerSecret: owner })).body.userId,
      a.body.userId,
    );
    assert.equal((await call("/api/v1/account/register", { ownerSecret: other })).status, 200);
    assert.equal((await call("/api/v1/remote/device", {})).status, 401);
    assert.equal(
      (await call("/api/v1/remote/device", { device_mid: "", extra: 1 }, owner)).status,
      400,
    );
    const invitation = await call("/api/v1/account/invite", {}, owner);
    const terminal = (
      await call("/api/v1/account/claim", { invitation: invitation.body.invitation })
    ).body.token;
    assert.equal(typeof terminal, "string");
    assert.equal(
      (await call("/api/v1/account/claim", { invitation: invitation.body.invitation })).status,
      401,
    );
    assert.equal((await call("/api/v1/account/invite", {}, terminal)).status, 403);
    assert.equal((await call("/api/v1/remote/token", { role: "device" }, terminal)).status, 403);
    assert.equal((await call("/api/v1/remote/token", { role: "terminal" }, owner)).status, 403);
    const mid = randomBytes(8).toString("hex");
    const registration = await call("/api/v1/remote/device", { device_mid: mid }, owner);
    assert.ok(parseWebRemoteControlRelayV2HttpResponse("register", registration.body));
    const sid = registration.body.data.device_sid;
    assert.equal(
      (await call("/api/v1/remote/device", undefined, other, "GET")).body.data.length,
      0,
    );
    assert.equal(
      (await call("/api/v1/remote/device/delete", { device_sid: sid }, other)).status,
      403,
    );
    const sockets: WebSocket[] = [];
    async function connect(role: "device" | "terminal", credential: string, target = sid) {
      const ticket = await call("/api/v1/remote/token", { role }, credential);
      assert.ok(parseWebRemoteControlRelayV2HttpResponse("token", ticket.body));
      const url = new URL("/api/v1/remote/ws2", origin);
      url.protocol = "ws:";
      url.searchParams.set("token", ticket.body.data.token);
      if (role === "device") url.searchParams.set("mid", mid);
      const socket = new WebSocket(url);
      sockets.push(socket);
      const queue: any[] = [];
      socket.on("message", (raw) => {
        const parsed = parseWebRemoteControlRelayV2IncomingMessage(JSON.parse(String(raw)));
        assert.ok(parsed);
        queue.push(parsed);
      });
      await new Promise<void>((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", () => reject(new Error("socket_open_failed")));
      });
      const wait = async (predicate: (message: any) => boolean) => {
        const until = Date.now() + 5000;
        while (Date.now() < until) {
          const index = queue.findIndex(predicate);
          if (index >= 0) return queue.splice(index, 1)[0];
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw new Error("expected_message_timeout");
      };
      socket.send(
        JSON.stringify({
          type: "auth_init",
          device_sid: target,
          meta: { name: "integration", platform: "test", version: "3.17.2" },
        }),
      );
      return { socket, wait, url };
    }
    try {
      const cross = await connect("device", other);
      assert.equal((await cross.wait((m) => m.type === "error")).code, "AUTH_FAILED");
      const desktop = await connect("device", owner);
      assert.equal((await desktop.wait((m) => m.type === "auth_ack")).pair_status, "waiting");
      const phone = await connect("terminal", terminal);
      assert.equal((await phone.wait((m) => m.type === "auth_ack")).pair_status, "matched");
      assert.equal(
        (await desktop.wait((m) => m.type === "pair_status_ack")).pair_status,
        "matched",
      );
      const replay = new WebSocket(phone.url);
      await new Promise<void>((resolve, reject) => {
        replay.once("unexpected-response", (_request, response) => {
          assert.equal(response.statusCode, 401);
          response.destroy();
          replay.terminate();
          resolve();
        });
        replay.once("open", () => reject(new Error("token_replay_accepted")));
        replay.on("error", () => {});
      });
      const list = await call("/api/v1/remote/device", undefined, terminal, "GET");
      assert.ok(parseWebRemoteControlRelayV2HttpResponse("list", list.body));
      assert.equal(list.body.data.find((d: any) => d.device_sid === sid).online, true);
      phone.socket.send(JSON.stringify({ type: "data", payload: { hello: "desktop" } }));
      assert.deepEqual((await desktop.wait((m) => m.type === "data")).payload, {
        hello: "desktop",
      });
      desktop.socket.send(JSON.stringify({ type: "data", payload: ["opaque", 1] }));
      assert.deepEqual((await phone.wait((m) => m.type === "data")).payload, ["opaque", 1]);
      const replacement = await connect("terminal", terminal);
      assert.equal((await replacement.wait((m) => m.type === "auth_ack")).pair_status, "matched");
      assert.equal((await phone.wait((m) => m.type === "error")).code, "KICKED");
      replacement.socket.send(JSON.stringify({ type: "pair_status_query" }));
      assert.equal(
        (await replacement.wait((m) => m.type === "pair_status_ack")).pair_status,
        "matched",
      );
      desktop.socket.close();
      assert.equal(
        (await replacement.wait((m) => m.type === "pair_status_ack" && m.pair_status === "waiting"))
          .pair_status,
        "waiting",
      );
      const restored = await connect("device", owner);
      assert.equal((await restored.wait((m) => m.type === "auth_ack")).pair_status, "matched");
      assert.equal(
        (await replacement.wait((m) => m.type === "pair_status_ack" && m.pair_status === "matched"))
          .pair_status,
        "matched",
      );
      const closed = new Promise<void>((resolve) =>
        replacement.socket.once("close", () => resolve()),
      );
      assert.equal((await call("/api/v1/account/logout", {}, terminal)).status, 200);
      await closed;
      assert.equal(
        (await call("/api/v1/remote/token", { role: "terminal" }, terminal)).status,
        401,
      );
    } finally {
      for (const socket of sockets) socket.terminate();
      await call("/api/v1/remote/device/delete", { device_sid: sid }, owner);
    }
  },
);
