import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");

test("Electron fetch adapter normalizes URL and preserves Request, options and receiver", async () => {
  const source = await readFile(
    new URL("../src/main/desktopTelemetryFetch.ts", import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2024 },
  });
  const exports = {};
  runInNewContext(outputText, { exports, URL });
  const calls = [];
  const response = new Response("ok");
  const sourcePort = {
    async fetch(input, init) {
      assert.equal(this, sourcePort);
      assert.ok(
        typeof input === "string" || input instanceof Request,
        "Electron net.fetch does not accept URL objects",
      );
      calls.push({ input, init });
      return response;
    },
  };
  const fetchImpl = exports.createDesktopTelemetryFetch(sourcePort);
  const init = { method: "POST", headers: { "x-test": "1" } };
  assert.equal(await fetchImpl(new URL("https://example.org/config"), init), response);
  const request = new Request("https://example.org/events", init);
  await fetchImpl(request);
  await fetchImpl("https://example.org/ping");
  assert.equal(calls[0].input, "https://example.org/config");
  assert.equal(calls[0].init, init);
  assert.equal(calls[1].input, request);
  assert.equal(calls[2].input, "https://example.org/ping");
});
