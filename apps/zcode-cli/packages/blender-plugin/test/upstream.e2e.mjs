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
    let protocol = lock.addonProtocol;
    let writes = 0;
    const server = createServer((socket) => {
      const socketProtocol = protocol;
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
            protocol_version: socketProtocol,
            addon_version: [1, 8],
            blender_version: "simulated",
            capabilities: [],
            premium_generators: [],
          };
        if (command.type === "get_scene_info")
          result = { name: "KayingCode E2E", objects: [{ name: "EvidenceCube", type: "MESH" }] };
        if (command.type === "execute_code") {
          // 上游 get_scene_info 也会执行观察脚本，此处只计数显式测试写入。
          if (command.params?.code === "print(1)") writes++;
          result = { result: "Executed on simulated Blender" };
        }
        socket.write(JSON.stringify({ status: "success", result }));
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    });
    const client = startMcp(join(pluginRoot, "scripts/launch.mjs"), {
      BLENDER_HOST: " 127.0.0.1 ",
      BLENDER_PORT: String(server.address().port),
      DISABLE_TELEMETRY: "false",
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
    const statusText = status.content.map((item) => item.text || "").join("\n");
    assert.match(statusText, new RegExp(`"protocol_version":\\s*${lock.addonProtocol}\\b`));
    assert.match(statusText, /"telemetry_consent":\s*false/);
    const scene = await client.request("tools/call", { name: "get_scene_info", arguments: {} });
    assert.match(JSON.stringify(scene), /EvidenceCube/);
    const execute = () =>
      client.request("tools/call", {
        name: "execute_blender_code",
        arguments: { code: "print(1)" },
      });
    assert.match(JSON.stringify(await execute()), /Executed on simulated Blender/);
    assert.equal(writes, 1);

    // 旧 socket 上已通过配对，重新连接到另一个版本必须重新握手。
    protocol = lock.addonProtocol - 1;
    for (const socket of sockets) socket.destroy();
    const disconnected = await execute();
    assert.match(JSON.stringify(disconnected), /Error executing code|协议不匹配/);
    assert.match(JSON.stringify(await execute()), /协议不匹配.*blender-doctor/);
    const oldStatus = await client.request("tools/call", {
      name: "get_addon_status",
      arguments: {},
    });
    assert.match(oldStatus.content[0].text, new RegExp(`"protocol_version":\\s*${protocol}\\b`));
    assert.equal(writes, 1);
    assert.equal((await verifyUpstream()).commit, lock.commit);
  },
);
