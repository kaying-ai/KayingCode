import assert from "node:assert/strict";
import { createServer } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { pluginRoot } from "../scripts/runtime.mjs";
import { verifyUpstream } from "../scripts/verify-upstream.mjs";
import { startMcp } from "./mcp-client.mjs";

test(
  "real pinned upstream MCP starts, discovers tools and reads a simulated addon",
  { timeout: 90000 },
  async (t) => {
    const lock = await verifyUpstream();
    const sockets = new Set();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => {});
      let buffer = "";
      socket.on("data", (data) => {
        buffer += data.toString();
        let command;
        try {
          command = JSON.parse(buffer);
        } catch {
          return;
        }
        buffer = "";
        let result = {};
        if (command.type === "get_addon_info")
          result = {
            protocol_version: lock.addonProtocol,
            addon_version: [1, 8],
            blender_version: "simulated",
            capabilities: [],
            premium_generators: [],
          };
        if (command.type === "get_scene_info")
          result = { name: "KayingCode E2E", objects: [{ name: "EvidenceCube", type: "MESH" }] };
        socket.write(JSON.stringify({ status: "success", result }));
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    });
    const client = startMcp(join(pluginRoot, "scripts/launch.mjs"), {
      BLENDER_HOST: "127.0.0.1",
      BLENDER_PORT: String(server.address().port),
    });
    t.after(() => client.close());
    await client.initialize();
    const tools = await client.request("tools/list");
    for (const name of ["get_addon_status", "get_scene_info", "execute_blender_code", "look"])
      assert.ok(
        tools.tools.some((item) => item.name === name),
        name,
      );
    const status = await client.request("tools/call", { name: "get_addon_status", arguments: {} });
    assert.ok(
      !status.content.some((item) => /Error checking addon status/.test(item.text || "")),
      JSON.stringify(status),
    );
    assert.match(JSON.stringify(status), /protocol_version/);
    const scene = await client.request("tools/call", { name: "get_scene_info", arguments: {} });
    assert.match(JSON.stringify(scene), /EvidenceCube/);
    assert.equal((await verifyUpstream()).commit, lock.commit);
  },
);
