import assert from "node:assert/strict";
import test from "node:test";
import { mobileWebAssetsResponse } from "./mobileWebAssets.js";

const request = (path: string, method = "GET") =>
  new Request(`https://relay.test${path}`, { method });
const fetcher = { fetch: async (r: Request) => new Response(new URL(r.url).pathname) };
test("same-origin Web assets serve current routes and exclude retired ingress", async () => {
  const env = { ASSETS: fetcher } as never;
  assert.equal((await mobileWebAssetsResponse(request("/remote"), env))?.status, 308);
  assert.equal(await mobileWebAssetsResponse(request("/"), env), null);
  assert.equal(
    await (await mobileWebAssetsResponse(request("/remote/assets/app.js"), env))?.text(),
    "/remote/assets/app.js",
  );
  assert.equal((await mobileWebAssetsResponse(request("/remote/", "POST"), env))?.status, 405);
  assert.equal(await mobileWebAssetsResponse(request("/admin/"), env), null);
  assert.equal(await mobileWebAssetsResponse(request("/v1/nodes"), env), null);
  assert.equal(await mobileWebAssetsResponse(request("/remote/../admin/"), env), null);
});
test("upstream SPA fallback preserves the v4 route without an index redirect", async () => {
  const assets = {
    fetch: async (r: Request) => {
      const path = new URL(r.url).pathname;
      if (path === "/remote/index.html")
        return new Response(null, { status: 307, headers: { location: "/remote/" } });
      return new Response(path === "/remote/" ? "official Web" : "missing", {
        status: path === "/remote/" ? 200 : 404,
      });
    },
  };
  const result = await mobileWebAssetsResponse(request("/remote/v4?sid=test"), {
    ASSETS: assets,
  } as never);
  assert.equal(result?.status, 200);
  assert.equal(result?.headers.get("location"), null);
  assert.equal(await result?.text(), "official Web");
});

test("only the exact domain verification path is forwarded to the static assets", async () => {
  const env = { ASSETS: fetcher } as never;
  const path = "/69txzPKb7q.txt";
  assert.equal(await (await mobileWebAssetsResponse(request(path), env))?.text(), path);
  assert.equal((await mobileWebAssetsResponse(request(path, "HEAD"), env))?.status, 200);
  assert.equal((await mobileWebAssetsResponse(request(path, "POST"), env))?.status, 405);
  assert.equal(await mobileWebAssetsResponse(request("/other-verification.txt"), env), null);
});
