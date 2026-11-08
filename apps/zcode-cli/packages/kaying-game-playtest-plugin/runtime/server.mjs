#!/usr/bin/env node
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { TOOLS } from "./tools.mjs";
import { PlaytestRuntime } from "./playtest.mjs";

const runtime = new PlaytestRuntime();
const lines = createInterface({ input: process.stdin, terminal: false });
let tail = Promise.resolve();
let closing = false;
function send(response) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}
function error(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function dispatch(request) {
  if (
    !request ||
    typeof request !== "object" ||
    Array.isArray(request) ||
    request.jsonrpc !== "2.0" ||
    typeof request.method !== "string"
  ) {
    error(request?.id ?? null, -32600, "Invalid request");
    return;
  }
  if (request.id === undefined) return;
  const { id, method, params } = request;
  let result;
  switch (method) {
    case "initialize":
      result = {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "kaying-game-playtest", version: "0.1.0" },
      };
      break;
    case "ping":
      result = {};
      break;
    case "tools/list":
      result = { tools: TOOLS };
      break;
    case "tools/call": {
      try {
        const value = await runtime.call(params?.name, params?.arguments ?? {});
        const { imagePath, previewImagePath, ...metadata } = value;
        const content = [{ type: "text", text: JSON.stringify(metadata) }];
        if (imagePath)
          content.push({
            type: "image",
            mimeType: "image/png",
            data: (await readFile(previewImagePath ?? imagePath)).toString("base64"),
          });
        result = { content };
      } catch (failure) {
        result = { isError: true, content: [{ type: "text", text: failure.message }] };
      }
      break;
    }
    default:
      error(id, -32601, "Method not found");
      return;
  }
  send({ jsonrpc: "2.0", id, result });
}

lines.on("line", (line) => {
  if (closing || !line.trim()) return;
  if (Buffer.byteLength(line) > 1024 * 1024) {
    error(null, -32600, "Request too large");
    return;
  }
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    error(null, -32700, "Parse error");
    return;
  }
  tail = tail
    .then(() => dispatch(request))
    .catch(() => error(request?.id ?? null, -32603, "Internal error"));
});
async function close() {
  if (closing) return;
  closing = true;
  lines.close();
  await tail;
  await runtime.close();
}
lines.on("close", () => {
  void close();
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void close();
  });
