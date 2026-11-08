import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test } from "node:test";

import { probeAddon, diagnose } from "../scripts/diagnostics.mjs";
import { resolveConnection, runtimePlan } from "../scripts/runtime.mjs";

async function withAddon(handler, run) {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    handler(socket);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(server.address().port);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("invalid ports never fall back to the default", () => {
  for (const port of ["abc", "0", "65536", "9.2", "-1", " 9876 "]) {
    assert.throws(() => resolveConnection({ BLENDER_PORT: port }), /BLENDER_PORT/);
  }
  assert.deepEqual(resolveConnection({}), { host: "localhost", port: 9876 });
});

test("runtime plan pins the project and external environment; no client setup or update", () => {
  const plan = runtimePlan(
    "/plugin with spaces",
    { commit: "a".repeat(40) },
    {
      KAYINGCODE_BLENDER_CACHE: "/writable cache",
      DISABLE_TELEMETRY: "false",
    },
  );
  assert.ok(plan.args.includes("--frozen"));
  assert.equal(plan.source, "/plugin with spaces/vendor/mcp-for-blender");
  assert.ok(plan.args.includes(`/writable cache/${"a".repeat(40)}/project`));
  assert.equal(plan.env.UV_PROJECT_ENVIRONMENT, `/writable cache/${"a".repeat(40)}/environment`);
  assert.equal(plan.env.DISABLE_TELEMETRY, "true");
  assert.deepEqual(plan.args.slice(-3), ["python", "-B", "/plugin with spaces/scripts/server.py"]);
  assert.ok(!plan.args.some((arg) => ["setup", "update", "install-addon"].includes(arg)));
});

test("probe sends only a read-only handshake and handles fragmented UTF-8", async () => {
  await withAddon(
    (socket) =>
      socket.once("data", (data) => {
        assert.deepEqual(JSON.parse(data), { type: "get_addon_info", params: {} });
        const response = Buffer.from(
          JSON.stringify({
            status: "success",
            result: {
              protocol_version: 14,
              blender_version: "测试 4.5",
              capabilities: ["get_scene_info"],
            },
          }),
        );
        const split = response.indexOf(Buffer.from("测试")) + 1;
        socket.write(response.subarray(0, split));
        setImmediate(() => socket.end(response.subarray(split)));
      }),
    async (port) => {
      const result = await probeAddon({ host: "127.0.0.1", port }, 14);
      assert.equal(result.status, "pass");
      assert.match(result.evidence, /测试 4.5/);
    },
  );
});

test("outdated and newer add-ons require a matching pinned pair", async () => {
  for (const protocol of [13, 15]) {
    await withAddon(
      (socket) =>
        socket.once("data", () =>
          socket.end(
            JSON.stringify({
              status: "success",
              result: { protocol_version: protocol },
            }),
          ),
        ),
      async (port) => {
        const result = await probeAddon({ host: "127.0.0.1", port }, 14);
        assert.equal(result.status, "error");
        assert.match(result.suggestion, /add-on/);
      },
    );
  }
});

test("wrong service, old add-on and busy timeout produce distinct evidence", async () => {
  for (const [payload, expected] of [
    ["HTTP/1.1 400 Bad Request\r\n", /JSON/],
    [
      JSON.stringify({ status: "error", message: "Unknown command: get_addon_info" }),
      /Unknown command/,
    ],
    [JSON.stringify({ hello: "other service" }), /get_addon_info/],
  ]) {
    await withAddon(
      (socket) => socket.once("data", () => socket.end(payload)),
      async (port) => {
        const result = await probeAddon({ host: "127.0.0.1", port }, 14);
        assert.equal(result.status, "error");
        assert.match(result.evidence, expected);
      },
    );
  }
  await withAddon(
    () => {},
    async (port) => {
      const result = await probeAddon({ host: "127.0.0.1", port }, 14, 30);
      assert.equal(result.status, "warning");
      assert.match(result.suggestion, /忙碌/);
    },
  );
});

test("doctor survives missing dependencies and malformed configuration", async () => {
  const report = await diagnose({
    KAYINGCODE_BLENDER_UV: "/missing-uv",
    KAYINGCODE_BLENDER_CACHE: "/missing-cache",
    BLENDER_EXECUTABLE: "/missing-blender",
    BLENDER_PORT: "bad",
  });
  assert.equal(report.ready, false);
  for (const id of ["uv", "python-runtime", "connection-config"]) {
    assert.equal(report.checks.find((check) => check.id === id).status, "error");
  }
  assert.equal(report.checks.find((check) => check.id === "snapshot").status, "pass");
});
