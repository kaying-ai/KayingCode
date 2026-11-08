import assert from "node:assert/strict";
import test from "node:test";
import { createToolResultDisplay } from "../src/tool/executor/result-display.js";
import { projectCompactMediaForRetry } from "../src/runtime/helpers/compact-media.js";
import { normalizeMcpToolResultForModel } from "../src/mcp/image-normalization.js";
import { computeOfficialCuaServerNames } from "../src/runtime/methods/mcp.js";
import {
  KAYINGCODE_CUA_OFFICIAL_PLUGIN_ID,
  KAYINGCODE_PLUGIN_ID_ENV_KEY,
} from "@zcode/shared";

test("runtime permission group requires both trusted registry provenance and native plugin identity", () => {
  const server = {
    type: "stdio" as const,
    command: "native-server",
    env: { [KAYINGCODE_PLUGIN_ID_ENV_KEY]: KAYINGCODE_CUA_OFFICIAL_PLUGIN_ID },
  };
  assert.deepEqual([...computeOfficialCuaServerNames({ native: server }, new Set())], []);
  assert.deepEqual(
    [...computeOfficialCuaServerNames({ native: server }, new Set(["native"]))],
    ["native"],
  );
  assert.deepEqual(
    [...computeOfficialCuaServerNames({ native: { ...server, env: {} } }, new Set(["native"]))],
    [],
  );
});

test("native Computer Use retains images and errors without Helper permission projection", () => {
  const display = createToolResultDisplay("mcp__plugin_computer-use_computer-use__get_app_state", {
    isError: true,
    content: [
      { type: "image", data: "cGl4ZWxz", mimeType: "image/png" },
      { type: "text", text: "capture failed" },
    ],
    _meta: { "kayingcode.cua/request-access-status-v1": { accessibility: "granted" } },
  });
  assert.equal(display?.kind, "cua");
  if (display?.kind !== "cua") throw new Error("missing native tool display");
  assert.equal(display.status, "failed");
  assert.equal(display.media?.length, 1);
  assert.equal(display.permissionStatus, undefined);
});

test("generic MCP inline budget still omits oversized images without an artifact store", async () => {
  const result = await normalizeMcpToolResultForModel({
    compressOversizedImages: false,
    context: {} as Parameters<typeof normalizeMcpToolResultForModel>[0]["context"],
    descriptor: { serverName: "native", toolName: "screenshot", inputSchema: {} },
    result: { content: [{ type: "image", mimeType: "image/png", data: "A".repeat(300_000) }] },
    toolName: "mcp__native__screenshot",
  });
  assert.equal(result.content[0]?.type, "text");
  assert.match(String(result.content[0]?.text), /exceeds inline limit/);
});

test("compact retry removes media while preserving ordinary adjacent text", () => {
  const result = projectCompactMediaForRetry([
    {
      role: "tool",
      content: [
        { type: "image", dataUrl: "data:image/png;base64,cGl4ZWxz", mediaType: "image/png" },
        { type: "text", text: "visible state" },
      ],
    },
  ]);
  assert.equal(result.replacedMediaCount, 1);
  assert.deepEqual(result.messages[0]?.content, [
    { type: "text", text: "[image]" },
    { type: "text", text: "visible state" },
  ]);
});
