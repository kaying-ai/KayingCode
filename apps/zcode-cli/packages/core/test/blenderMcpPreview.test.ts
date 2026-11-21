import assert from "node:assert/strict";
import test from "node:test";
import type { McpPort, McpToolCallResult } from "@zcode/contracts";
import { createMcpToolEntry } from "../src/mcp/index.js";
import { MCP_IMAGE_INLINE_BASE64_BYTES } from "../src/mcp/image-normalization.js";
import type { ToolExecutionContext } from "../src/tool/types.js";

const blenderPluginId = "blender@kayingcode-plugins-official";
const preview = Buffer.alloc(MCP_IMAGE_INLINE_BASE64_BYTES, 97);
const thumbnail = Buffer.from("test thumbnail").toString("base64");

function invoke(
  toolName: string,
  result: McpToolCallResult,
  pluginId: string | undefined = blenderPluginId,
  useImageProcessor = true,
  useArtifactStore = true,
) {
  const originals: Uint8Array[] = [];
  let compressions = 0;
  const context = {
    abortSignal: new AbortController().signal,
    sessionId: "session",
    turnId: "turn",
    toolCallId: "call",
    workspaceRoot: "/workspace",
    ...(useImageProcessor
      ? {
          imageProcessorPort: {
            async prepareForModel(input: { maxBase64Bytes: number }) {
              assert.equal(input.maxBase64Bytes, MCP_IMAGE_INLINE_BASE64_BYTES);
              compressions++;
              return { data: Buffer.from("test thumbnail"), mediaType: "image/jpeg" };
            },
          },
        }
      : {}),
    ...(useArtifactStore
      ? {
          artifactStore: {
            async writeToolResultBinaryArtifact(input: { content: Uint8Array }) {
              originals.push(input.content);
              return {
                path: "/workspace/original.png",
                uri: "artifact://original",
                bytes: input.content.length,
                contentType: "image/png",
              };
            },
          },
        }
      : {}),
  } as ToolExecutionContext;
  const serverName = "plugin:blender:blender";
  const port = { callTool: async () => result } as unknown as McpPort;
  const tool = createMcpToolEntry(
    `mcp__blender__${toolName}`,
    { serverName, toolName, inputSchema: { type: "object" } },
    port,
    false,
    { pluginId },
  );
  return tool
    .handler({}, context)
    .then((output) => ({ output: output as McpToolCallResult, originals, compressions }));
}

test("Blender look shows a budgeted preview and retains the full PNG", async () => {
  const result = {
    content: [{ type: "image", data: preview.toString("base64"), mimeType: "image/png" }],
  };
  const { output, originals, compressions } = await invoke("look", result);
  assert.equal(compressions, 1);
  assert.deepEqual(originals, [preview]);
  assert.deepEqual(output.content[0], { type: "image", data: thumbnail, mimeType: "image/jpeg" });
  assert.match(String(output.content[1].text), /original\.png/);
});

test("Blender compression falls back to the original artifact and leaves third-party tools unchanged", async () => {
  const result = {
    content: [{ type: "image", data: preview.toString("base64"), mimeType: "image/png" }],
  };
  for (const [pluginId, enabled] of [
    [blenderPluginId, false],
    ["blender@inline", true],
  ] as const) {
    const { output, originals, compressions } = await invoke("look", result, pluginId, enabled);
    assert.equal(compressions, 0);
    assert.deepEqual(originals, [preview]);
    assert.equal(output.content[0].type, "text");
  }
  const small = { content: [{ type: "image", data: thumbnail, mimeType: "image/jpeg" }] };
  const { output, originals } = await invoke("look", small);
  assert.equal(output, small);
  assert.deepEqual(originals, []);
});

test("Blender keeps the inline thumbnail when no artifact store can retain the original", async () => {
  const result = {
    content: [{ type: "image", data: preview.toString("base64"), mimeType: "image/png" }],
  };
  const { output, originals, compressions } = await invoke(
    "look",
    result,
    blenderPluginId,
    true,
    false,
  );
  assert.equal(compressions, 1);
  assert.deepEqual(originals, []);
  assert.deepEqual(output.content, [
    { type: "image", data: thumbnail, mimeType: "image/jpeg" },
  ]);
});

test("Blender's tool-level error text is marked failed without interpreting successful script output", async () => {
  const error = {
    content: [{ type: "text", text: "Error executing code: Blender add-on 协议不匹配" }],
  };
  assert.equal((await invoke("execute_blender_code", error)).output.isError, true);
  assert.equal(
    (await invoke("execute_blender_code", error, "blender@inline")).output.isError,
    undefined,
  );
  const safeMode = { content: [{ type: "text", text: "Rejected by safe mode - invalid code" }] };
  const connection = {
    content: [{ type: "text", text: "Error checking addon status: Connection refused" }],
  };
  assert.equal((await invoke("execute_blender_code", safeMode)).output.isError, true);
  assert.equal((await invoke("get_addon_status", connection)).output.isError, true);
  const success = {
    content: [{ type: "text", text: "Code executed successfully: Error: sample" }],
  };
  assert.equal((await invoke("execute_blender_code", success)).output.isError, undefined);
});
