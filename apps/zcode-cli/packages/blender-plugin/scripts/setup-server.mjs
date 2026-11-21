import { isAbsolute } from "node:path";
import { createInterface } from "node:readline";
import { installAddon } from "./install-addon.mjs";

const tool = {
  name: "blender_install_addon",
  description:
    "Install or enable the pinned Blender add-on on this execution host. Dry-run by default; writes to the Blender user configuration only when confirm=true. Never run automatically: call it only after the user explicitly requests /blender-install and approves the plan. Refuses while Blender is running, for remote BLENDER_HOST targets, for an uninitialized Blender version, or when an extensions copy already exists.",
  inputSchema: {
    type: "object",
    properties: {
      dryRun: {
        type: "boolean",
        description: "Plan only; never write. Defaults to true unless confirm is true.",
      },
      confirm: {
        type: "boolean",
        description: "Must be true to install or enable the add-on. Keep false for planning.",
      },
      executable: {
        type: "string",
        description: "Absolute path to the Blender executable. Optional; discovery is used otherwise.",
      },
    },
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const send = (id, result) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
const fail = (id, code, message) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);

function validateArgs(args) {
  if (args === undefined) return {};
  if (!args || Array.isArray(args) || typeof args !== "object")
    throw new Error("blender_install_addon 参数必须是对象");
  const allowed = new Set(["dryRun", "confirm", "executable"]);
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) throw new Error(`未知参数：${key}`);
  }
  for (const key of ["dryRun", "confirm"]) {
    if (args[key] !== undefined && typeof args[key] !== "boolean")
      throw new Error(`${key} 必须是布尔值`);
  }
  if (args.executable !== undefined) {
    if (typeof args.executable !== "string" || !isAbsolute(args.executable))
      throw new Error("executable 必须是绝对路径");
  }
  return args;
}

async function dispatch(message) {
  if (message.id === undefined) return;
  switch (message.method) {
    case "initialize":
      send(message.id, {
        protocolVersion: message.params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "kayingcode-blender-setup", version: "0.1.0" },
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
      let args;
      try {
        args = validateArgs(message.params.arguments);
      } catch (error) {
        return fail(message.id, -32602, error.message);
      }
      // 只有 confirm=true 且未显式 dryRun 才允许写入；默认始终是计划模式。
      const dryRun = args.confirm !== true || args.dryRun === true;
      const report = await installAddon({
        dryRun,
        executable: args.executable,
      });
      send(message.id, {
        content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
      });
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
        content: [{ type: "text", text: `安装未能完成：${error.message}` }],
      });
    else fail(message.id, -32603, "Internal error");
  });
});
