import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { probeAddon, diagnose, resolveNextAction } from "../scripts/diagnostics.mjs";
import { pluginRoot, resolveConnection, runtimePlan } from "../scripts/runtime.mjs";
import { verifyUpstream } from "../scripts/verify-upstream.mjs";

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
  const plugin = resolve("plugin with spaces");
  const cache = resolve("writable cache", "a".repeat(40));
  const plan = runtimePlan(
    plugin,
    { commit: "a".repeat(40) },
    {
      KAYINGCODE_BLENDER_CACHE: resolve("writable cache"),
      DISABLE_TELEMETRY: "false",
    },
  );
  assert.ok(plan.args.includes("--frozen"));
  assert.equal(plan.source, join(plugin, "vendor", "mcp-for-blender"));
  assert.ok(plan.args.includes(join(cache, "project")));
  assert.equal(plan.env.UV_PROJECT_ENVIRONMENT, join(cache, "environment"));
  assert.equal(plan.env.DISABLE_TELEMETRY, "true");
  assert.deepEqual(plan.args.slice(-3), ["python", "-B", join(plugin, "scripts", "server.py")]);
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

test("nextAction follows the first blocking layer and points at /blender-install", () => {
  const passing = ["snapshot", "uv", "python-runtime", "connection-config"].map((id) => ({
    id,
    status: "pass",
  }));
  const base = {
    ready: false,
    checks: passing,
    installation: { protocol: 16 },
    addonFiles: { installed: [{ protocol: 16 }] },
    addon: { id: "addon", status: "pass" },
    target: { host: "127.0.0.1", port: 9876, remote: false },
  };
  const action = (overrides = {}) =>
    resolveNextAction({ ...base, ...overrides }).id;
  assert.equal(action({ ready: true }), "ready");
  assert.equal(
    action({ checks: [{ id: "snapshot", status: "error" }, ...passing] }),
    "restore-snapshot",
  );
  assert.equal(
    action({ checks: passing.map((item) => (item.id === "uv" ? { ...item, status: "error" } : item)) }),
    "install-uv",
  );
  assert.equal(
    action({
      checks: passing.map((item) =>
        item.id === "python-runtime" ? { ...item, status: "error" } : item,
      ),
    }),
    "prepare-python-runtime",
  );
  assert.equal(action({ addonFiles: { installed: [] } }), "install-addon");
  assert.equal(action({ target: { ...base.target, remote: true } }), "install-addon-remote");
  assert.equal(
    action({ addon: { id: "addon", status: "error", running: { protocol: 15 } } }),
    "restart-blender",
  );
  assert.equal(
    action({
      addon: { id: "addon", status: "error", evidence: "连接失败：ECONNREFUSED。" },
    }),
    "open-blender",
  );
  assert.equal(action({ addon: { id: "addon", status: "error" } }), "fix-connection");
  assert.equal(action({ addon: { id: "addon", status: "warning" } }), "fix-connection");
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
  assert.equal(report.target, null);
  assert.equal(report.nextAction.id, "install-uv");
});

test("doctor reports the verified install path, disk copy and running version separately", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "Blender staged plugin "));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(join(pluginRoot, "vendor"), join(root, "vendor"), { recursive: true });
  await cp(join(pluginRoot, "upstream-lock.json"), join(root, "upstream-lock.json"));
  const lock = await verifyUpstream(root);
  const addonPath = join(root, "vendor/mcp-for-blender/addon.py");
  const addons = join(root, "Blender addons");
  await mkdir(addons);
  const installed = join(addons, "addon.py");
  await cp(addonPath, installed);
  await withAddon(
    (socket) =>
      socket.once("data", () =>
        socket.end(
          JSON.stringify({
            status: "success",
            result: {
              protocol_version: lock.addonProtocol - 1,
              addon_version: [1, 9],
              blender_version: "5.2",
            },
          }),
        ),
      ),
    async (port) => {
      const env = {
        BLENDER_HOST: "127.0.0.1",
        BLENDER_PORT: String(port),
        BLENDER_USER_ADDONS: addons,
      };
      const report = await diagnose(env, root);
      assert.equal(report.ready, false);
      assert.equal(report.installation.addonPath, addonPath);
      assert.equal(report.installation.pluginRoot, root);
      assert.equal(report.installation.protocol, lock.addonProtocol);
      assert.match(report.installation.addonVersion, /^\d+\.\d+/);
      assert.deepEqual(report.target, { host: "127.0.0.1", port, remote: false });
      const disk = report.checks.find((check) => check.id === "addon-files");
      assert.deepEqual(
        disk.installed.find(({ path }) => path === installed),
        {
          path: installed,
          protocol: lock.addonProtocol,
          addonVersion: report.installation.addonVersion,
        },
      );
      const running = report.checks.find((check) => check.id === "addon");
      assert.deepEqual(running.running, {
        protocol: lock.addonProtocol - 1,
        addonVersion: "1.9",
        blenderVersion: "5.2",
      });
      assert.ok(running.suggestion.includes(addonPath));
      assert.match(running.suggestion, /磁盘/);
      // 该环境没有 uv/Python 运行时，运行时准备优先于 add-on 重启。
      assert.equal(report.nextAction.id, "prepare-python-runtime");

      await writeFile(addonPath, "corrupted addon");
      const corrupted = await diagnose(env, root);
      assert.equal(corrupted.installation, null);
      assert.equal(corrupted.nextAction.id, "restore-snapshot");
    },
  );
});
