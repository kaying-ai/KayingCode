import assert from "node:assert/strict";
import test from "node:test";
import { handleClientApi } from "./clientApi.js";
import type { RelayCloudflareEnv } from "./contract.js";
import worker from "./worker.js";

function env(overrides: Partial<RelayCloudflareEnv> = {}): RelayCloudflareEnv {
  return {
    WEB_REMOTE: {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async () => Response.json({ remote: true }) }),
    } as unknown as DurableObjectNamespace,
    ASSETS: { fetch: async () => new Response("Web") } as unknown as Fetcher,
    ...overrides,
  };
}

test("mock 模式返回 configs/scenes，且不进入 Relay", async () => {
  const called: string[] = [];
  const relayEnv = env({
    KAYINGCODE_API_MODE: "mock",
    WEB_REMOTE: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (request: Request) => {
          called.push(new URL(request.url).pathname);
          return Response.json({ remote: true });
        },
      }),
    } as unknown as DurableObjectNamespace,
  });

  const configs = await handleClientApi(
    new Request("https://relay.test/api/v1/client/configs?app_version=0.2.4"),
    relayEnv,
  );
  assert.equal(configs?.status, 200);
  assert.deepEqual(await configs?.json(), { code: 0, data: { configs: {} } });

  const scenes = await handleClientApi(
    new Request("https://relay.test/api/v1/client/scenes"),
    relayEnv,
  );
  assert.equal(scenes?.status, 200);
  const scenesBody = (await scenes?.json()) as { code: number; data: unknown[] };
  assert.equal(scenesBody.code, 0);
  assert.ok(Array.isArray(scenesBody.data));

  const viaWorker = await worker.fetch(
    new Request("https://relay.test/api/v1/client/configs"),
    relayEnv,
  );
  assert.equal(viaWorker.status, 200);
  assert.deepEqual(called, []);
});

test("proxy 模式只转发固定路径，不转发凭据头", async () => {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return Response.json({ from: "upstream" }, { headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const response = await handleClientApi(
    new Request("https://relay.test/api/v1/client/scenes?a=1", {
      headers: { authorization: "Bearer secret", cookie: "session=1", accept: "application/json" },
    }),
    env({
      KAYINGCODE_API_MODE: "proxy",
      KAYINGCODE_API_UPSTREAM_ORIGIN: "https://upstream.test",
    }),
    fetchImpl,
  );

  assert.equal(response?.status, 200);
  assert.deepEqual(await response?.json(), { from: "upstream" });
  assert.equal(calls[0]?.url, "https://upstream.test/api/v1/client/scenes?a=1");
  assert.equal(calls[0]?.headers.get("authorization"), null);
  assert.equal(calls[0]?.headers.get("cookie"), null);
});

test("proxy 缺少合法 https origin 时失败，不回落 mock", async () => {
  for (const origin of [undefined, "http://upstream.test", "https://upstream.test/path"]) {
    const response = await handleClientApi(
      new Request("https://relay.test/api/v1/client/configs"),
      env({ KAYINGCODE_API_MODE: "proxy", KAYINGCODE_API_UPSTREAM_ORIGIN: origin }),
    );
    assert.equal(response?.status, 503);
  }
});

test("未配置模式、非白名单路径与非 GET 请求保持拒绝", async () => {
  const missing = await handleClientApi(
    new Request("https://relay.test/api/v1/client/configs"),
    env(),
  );
  assert.equal(missing?.status, 404);

  assert.equal(
    await handleClientApi(new Request("https://relay.test/api/v1/client/other"), env()),
    null,
  );

  const post = await handleClientApi(
    new Request("https://relay.test/api/v1/client/configs", { method: "POST" }),
    env({ KAYINGCODE_API_MODE: "mock" }),
  );
  assert.equal(post?.status, 405);
});
