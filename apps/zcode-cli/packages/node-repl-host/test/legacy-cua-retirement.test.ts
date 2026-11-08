import assert from "node:assert/strict";
import test from "node:test";
import { createInProcessNodeReplExecutor } from "../src/server.js";
import { toMcpRunResult } from "../src/result.js";

test("JS and Browser bridge remain available without the retired Computer Use bridge", async () => {
  const run = await createInProcessNodeReplExecutor()({
    code: 'console.log(JSON.stringify({ answer: 6 * 7, cua: typeof globalThis[Symbol.for("kayingcode.node-repl.computer-use-bridge")], browser: typeof globalThis[Symbol.for("kayingcode.node-repl.browser-control-bridge")] }));',
    requestMeta: {},
    signal: new AbortController().signal,
    syncTimeoutMs: 1000,
  });
  assert.equal(run.error, undefined);
  assert.match(run.logs, /"answer":42/);
  assert.match(run.logs, /"cua":"undefined"/);
  assert.match(run.logs, /"browser":"object"/);
});

test("generic MCP images and error status survive result projection", () => {
  const result = toMcpRunResult({
    logs: "done",
    structuredResults: [
      {
        content: [{ type: "image", data: "cGl4ZWxz", mimeType: "image/png" }],
        isError: true,
      },
    ],
  });
  assert.equal(result.content[0]?.type, "image");
  assert.equal(result.isError, true);
  assert.ok(result.content.some((block) => block.type === "text" && block.text === "done"));
});
