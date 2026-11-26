import assert from "node:assert/strict";
import test from "node:test";
import type { RelayCloudflareEnv } from "./contract.js";
import { handleOAuthApi } from "./oauthApi.js";
import worker from "./worker.js";

function env(overrides: Partial<RelayCloudflareEnv> = {}): RelayCloudflareEnv {
  return {
    WEB_REMOTE: {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async () => Response.json({ remote: true }) }),
    } as unknown as DurableObjectNamespace,
    ASSETS: { fetch: async () => new Response("Web") } as unknown as Fetcher,
    KAYINGCODE_API_MODE: "mock",
    ...overrides,
  };
}

test("mock 模式返回可用的 CLI OAuth init/poll/profile", async () => {
  const init = await handleOAuthApi(
    new Request("https://relay.test/api/v1/oauth/cli/init", { method: "POST" }),
    env(),
  );
  assert.equal(init?.status, 200);
  const initBody = (await init?.json()) as {
    code: number;
    data: { flow_id: string; authorize_url: string; expires_at: number };
  };
  assert.equal(initBody.code, 0);
  assert.equal(initBody.data.flow_id, "mock-flow");
  assert.match(initBody.data.authorize_url, /^https:\/\//);

  const poll = await handleOAuthApi(
    new Request("https://relay.test/api/v1/oauth/cli/poll/mock-flow"),
    env(),
  );
  assert.equal(poll?.status, 200);
  const pollBody = (await poll?.json()) as {
    code: number;
    data: { status: string; user: { user_id: string }; accessToken: string };
  };
  assert.equal(pollBody.code, 0);
  assert.equal(pollBody.data.status, "ready");
  assert.equal(pollBody.data.user.user_id, "mock-user");
  assert.equal(pollBody.data.accessToken, "mock-access-token");

  const profile = await handleOAuthApi(
    new Request("https://relay.test/api/v1/oauth/profile"),
    env(),
  );
  assert.equal(profile?.status, 200);
});

test("OAuth mock 在非 mock 模式关闭，worker 路由可达", async () => {
  const disabled = await handleOAuthApi(
    new Request("https://relay.test/api/v1/oauth/cli/init", { method: "POST" }),
    env({ KAYINGCODE_API_MODE: "proxy" }),
  );
  assert.equal(disabled?.status, 404);

  const viaWorker = await worker.fetch(
    new Request("https://relay.test/api/v1/oauth/profile"),
    env(),
  );
  assert.equal(viaWorker.status, 200);
});

test("非白名单 OAuth 路径不进入 mock", async () => {
  assert.equal(
    await handleOAuthApi(new Request("https://relay.test/api/v1/oauth/other"), env()),
    null,
  );
});
