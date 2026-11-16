import assert from "node:assert/strict";
import test from "node:test";

import { TapTapHttpClient } from "../src/collector/httpTransport.js";

test("routes requests through the Cloudflare proxy with bearer auth", async () => {
  const calls: { url: string; headers: Headers }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const client = new TapTapHttpClient({
      minIntervalMs: 0,
      proxyBaseUrl: "https://taptap-proxy.example/",
      proxyToken: "secret",
    });
    const result = await client.getJson<{ ok: boolean }>(
      "/webapiv2/app-top/v2/hits",
      { type_name: "hot" },
      "https://www.taptap.cn/top/download",
    );
    assert.equal(calls.length, 1);
    const proxyUrl = new URL(calls[0]!.url);
    assert.equal(proxyUrl.origin, "https://taptap-proxy.example");
    assert.equal(proxyUrl.pathname, "/fetch");
    const targetPath = proxyUrl.searchParams.get("path") ?? "";
    assert.match(targetPath, /^\/webapiv2\/app-top\/v2\/hits\?type_name=hot&X-UA=/);
    assert.equal(calls[0]!.headers.get("authorization"), "Bearer secret");
    assert.equal(result.data.ok, true);
    assert.equal(result.url, calls[0]!.url);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requires a token when a proxy origin is configured", () => {
  assert.throws(
    () => new TapTapHttpClient({ proxyBaseUrl: "https://taptap-proxy.example" }),
    /proxyToken is required/,
  );
});

test("keeps the direct TapTap URL when no proxy is configured", async () => {
  const calls: { url: string; headers: Headers }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const client = new TapTapHttpClient({ minIntervalMs: 0 });
    await client.getJson(
      "/webapiv2/app-top/v2/hits",
      { type_name: "hot" },
      "https://www.taptap.cn/top/download",
    );
    const directUrl = new URL(calls[0]!.url);
    assert.equal(directUrl.origin, "https://www.taptap.cn");
    assert.equal(calls[0]!.headers.get("x-requested-with"), "XMLHttpRequest");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
