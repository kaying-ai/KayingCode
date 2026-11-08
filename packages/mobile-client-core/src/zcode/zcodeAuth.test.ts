import assert from "node:assert/strict";
import { test } from "vitest";
import { ZcodeAuthSession } from "./zcodeAuth.js";

const secret = "a".repeat(64);
function setup() {
  let now = 1_000;
  const requests: Array<{ url: string; init: any }> = [];
  let answer: any = {
    code: 0,
    data: {
      flow_id: "flow",
      authorize_url: "https://chat.z.ai/login?state=test",
      expires_at: 301,
      poll_interval_sec: 2,
    },
  };
  let status = 200;
  const auth = new ZcodeAuthSession({
    origin: "https://relay.example.com",
    randomSecret: async () => secret,
    now: () => now,
    request: async (url, init) => {
      requests.push({ url, init });
      return { ok: status === 200, status, json: async () => answer };
    },
  });
  return {
    auth,
    requests,
    answer: (next: any) => {
      answer = next;
    },
    status: (next: number) => {
      status = next;
    },
    tick: () => {
      now += 2_000;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("V2 OAuth 使用服务端 callback，pending 节流，ready 后可申请 terminal token", async () => {
  const s = setup();
  const flow = await s.auth.begin("zai");
  assert.equal(flow.authorizeUrl, "https://chat.z.ai/login?state=test");
  assert.equal(s.requests[0]!.init.headers.Authorization, `Bearer ${secret}`);
  s.answer({ code: 0, data: { status: "pending" } });
  assert.equal(await s.auth.poll(), false);
  assert.equal(await s.auth.poll(), false);
  assert.equal(s.requests.length, 2);
  s.tick();
  s.answer({ code: 0, data: { status: "ready", token: "account-jwt", user: { user_id: "user" } } });
  assert.equal(await s.auth.poll(), true);
  s.answer({ code: 0, data: { token: "a".repeat(22), expires_in: 60 } });
  assert.equal(await s.auth.getTerminalToken(), "a".repeat(22));
  assert.equal(s.requests.at(-1)!.url, "https://relay.example.com/api/v1/remote/token");
  assert.equal(s.requests.at(-1)!.init.body, JSON.stringify({ role: "terminal" }));
});

test("登录过期、授权失败与非法随机源都不能进入已登录态", async () => {
  const expired = setup();
  await expired.auth.begin("zai");
  expired.advance(301_000);
  await assert.rejects(expired.auth.poll(), /login-expired/);
  assert.equal(expired.auth.signedIn, false);
  assert.equal(expired.requests.length, 1);
  const denied = setup();
  await denied.auth.begin("bigmodel");
  denied.answer({ code: 0, data: { status: "failed" } });
  await assert.rejects(denied.auth.poll(), /login-failed/);
  assert.equal(denied.auth.signedIn, false);
  let requests = 0;
  const insecure = new ZcodeAuthSession({
    origin: "https://relay.example.com",
    randomSecret: async () => "weak",
    request: async () => {
      requests++;
      throw new Error("must not request");
    },
  });
  await assert.rejects(insecure.begin("zai"), /Secure OAuth/);
  assert.equal(requests, 0);
});

test("未登录不请求 token，401 清除账户，取消后的迟到结果不能登录", async () => {
  const s = setup();
  await assert.rejects(s.auth.getTerminalToken(), /auth-required/);
  assert.equal(s.requests.length, 0);
  await s.auth.begin("bigmodel");
  s.answer({ code: 0, data: { status: "ready", token: "jwt", user: { user_id: "user" } } });
  await s.auth.poll();
  s.status(401);
  await assert.rejects(s.auth.getTerminalToken(), /auth-required/);
  assert.equal(s.auth.signedIn, false);

  const pending = Promise.withResolvers<any>();
  let count = 0;
  const auth = new ZcodeAuthSession({
    origin: "https://relay.example.com",
    randomSecret: async () => secret,
    request: async () => ({
      ok: true,
      status: 200,
      json: () =>
        ++count === 1
          ? Promise.resolve({
              code: 0,
              data: {
                flow_id: "f",
                authorize_url: "https://chat.z.ai/login",
                expires_at: Date.now() / 1000 + 300,
                poll_interval_sec: 2,
              },
            })
          : pending.promise,
    }),
  });
  await auth.begin("zai");
  const polled = auth.poll();
  auth.cancelLogin();
  pending.resolve({ code: 0, data: { status: "ready", token: "late", user: { user_id: "u" } } });
  assert.equal(await polled, false);
  assert.equal(auth.signedIn, false);
});
