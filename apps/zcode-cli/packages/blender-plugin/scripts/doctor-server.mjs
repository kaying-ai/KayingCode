import { createInterface } from "node:readline";
import { diagnose } from "./diagnostics.mjs";

const tool = {
  name: "blender_doctor",
  description:
    "Diagnose Blender setup without installing or modifying anything. Check pinned files, uv/Python, app discovery, socket and addon protocol; return evidence and actionable suggestions. Available even if the Blender MCP runtime fails. Run before Blender work or after a failure.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
const send = (id, result) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
const fail = (id, code, message) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
let running;

async function dispatch(message) {
  if (message.id === undefined) return;
  switch (message.method) {
    case "initialize":
      send(message.id, {
        protocolVersion: message.params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "kayingcode-blender-doctor", version: "0.1.0" },
      });
      break;
    case "ping":
      send(message.id, {});
      break;
    case "tools/list":
      send(message.id, { tools: [tool] });
      break;
    case "tools/call": {
      if (message.params?.name !== tool.name) return fail(message.id, -32602, "Unknown tool");
      const args = message.params.arguments;
      if (
        args !== undefined &&
        (!args || Array.isArray(args) || typeof args !== "object" || Object.keys(args).length)
      )
        return fail(message.id, -32602, "blender_doctor takes no arguments");
      // 只合并同时发生的诊断，不缓存结果，也不创建另一条场景写入队列。
      running ||= diagnose().finally(() => {
        running = undefined;
      });
      const report = await running;
      send(message.id, { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] });
      break;
    }
    default:
      fail(message.id, -32601, "Method not found");
  }
}

createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    fail(null, -32700, "Parse error");
    return;
  }
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    fail(null, -32600, "Invalid request");
    return;
  }
  dispatch(message).catch((error) => {
    if (message.method === "tools/call")
      send(message.id, {
        isError: true,
        content: [{ type: "text", text: `诊断未能完成：${error.message}` }],
      });
    else fail(message.id, -32603, "Internal error");
  });
});
