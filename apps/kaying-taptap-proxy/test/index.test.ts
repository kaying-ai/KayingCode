import { afterEach, describe, expect, it } from "vitest";

import worker, { type Env } from "../src/index.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockUpstream() {
  const calls: { url: string; headers: Headers }[] = [];
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
  return calls;
}

describe("TapTap proxy worker", () => {
  it("serves health without a token", async () => {
    const env: Env = { PROXY_TOKEN: "secret" };
    const response = await worker.fetch(new Request("https://taptap-proxy.example/health"), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it("rejects requests without a valid token", async () => {
    const env: Env = { PROXY_TOKEN: "secret" };
    const response = await worker.fetch(
      new Request("https://taptap-proxy.example/fetch?path=%2Fwebapiv2%2Ftop%2Fv3%2Fterms"),
      env,
    );
    expect(response.status).toBe(401);
  });

  it("rejects paths outside the allowlist", async () => {
    const env: Env = { PROXY_TOKEN: "secret" };
    const response = await worker.fetch(
      new Request(
        "https://taptap-proxy.example/fetch?path=" + encodeURIComponent("/webapiv2/account/v1/me"),
        { headers: { Authorization: "Bearer secret" } },
      ),
      env,
    );
    expect(response.status).toBe(400);
  });

  it("forwards an allowed path to www.taptap.cn", async () => {
    const calls = mockUpstream();
    const env: Env = { PROXY_TOKEN: "secret" };
    const path = "/webapiv2/app-top/v2/hits?type_name=hot&from=0&limit=10&X-UA=abc";
    const response = await worker.fetch(
      new Request("https://taptap-proxy.example/fetch?path=" + encodeURIComponent(path), {
        headers: { Authorization: "Bearer secret" },
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`https://www.taptap.cn${path}`);
    expect(calls[0]?.headers.get("referer")).toBe("https://www.taptap.cn/top/download");
    expect(await response.json()).toMatchObject({ success: true });
  });

  it("enforces an optional client IP allowlist", async () => {
    const env: Env = { PROXY_TOKEN: "secret", ALLOWED_CLIENT_IP: "203.0.113.10" };
    const response = await worker.fetch(
      new Request("https://taptap-proxy.example/fetch?path=%2Fwebapiv2%2Ftop%2Fv3%2Fterms", {
        headers: { Authorization: "Bearer secret", "cf-connecting-ip": "203.0.113.11" },
      }),
      env,
    );
    expect(response.status).toBe(403);
  });
});
