import assert from "node:assert/strict";
import test from "node:test";
import worker from "./worker.js";
import type { RelayCloudflareEnv } from "./contract.js";
const called: string[] = [];
const env = {
  WEB_REMOTE: { idFromName: (name: string) => name, get: () => ({ fetch: async (request: Request) => { called.push(new URL(request.url).pathname); return Response.json({ ok: true }); } }) },
  ASSETS: { fetch: async () => new Response("Web") },
} as unknown as RelayCloudflareEnv;
test("only current V2 routes reach the remote owner; retired ingress is absent", async () => {
  called.length = 0;
  for (const path of ["/v1/nodes", "/v1/client-config", "/v1/node/control", "/v1/attachments/test/client", "/admin/", "/admin/api/v1/apps"]) {
    assert.equal((await worker.fetch(new Request(`https://relay.test${path}`), env)).status, 404);
  }
  assert.equal(called.length, 0);
  for (const path of ["/api/v1/remote/device", "/api/v1/account/claim", "/readyz"]) {
    assert.equal((await worker.fetch(new Request(`https://relay.test${path}`), env)).status, 200);
  }
  assert.deepEqual(called, ["/api/v1/remote/device", "/api/v1/account/claim", "/readyz"]);
  assert.equal((await worker.fetch(new Request("https://relay.test/healthz"), env)).status, 200);
  assert.equal((await worker.fetch(new Request("https://relay.test/remote/v4"), env)).status, 200);
});
