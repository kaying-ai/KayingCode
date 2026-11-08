import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createSiteServer } from "../dev.mjs";

let server;
let origin;
before(async () => {
  server = createSiteServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

test("serves deployment assets with correct content types and HEAD support", async () => {
  for (const [path, type] of [
    ["/", "text/html"],
    ["/site.css", "text/css"],
    ["/site.js", "text/javascript"],
    ["/assets/kayingcode-logo.png", "image/png"],
  ]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-type").startsWith(type));
  }
  const head = await fetch(origin, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("does not expose repository paths, source tools, or unsupported writes", async () => {
  for (const path of [
    "/missing.png",
    "/dev.mjs",
    "/tools/cdp-shot.mjs",
    "/%2e%2e%2fpackage.json",
    "/assets/%2e%2e%2f%2e%2e%2fpackage.json",
  ]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 404, path);
    assert.equal(await response.text(), "Not found");
  }
  assert.equal((await fetch(`${origin}/%ZZ`)).status, 400);
  assert.equal((await fetch(origin, { method: "POST" })).status, 405);
});
