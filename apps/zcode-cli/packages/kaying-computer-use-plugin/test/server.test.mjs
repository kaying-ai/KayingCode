import assert from "node:assert/strict";
import test from "node:test";
import { join, resolve } from "node:path";
import { resolveNativeRuntime, runNativeRuntime, runtimeRelativePath } from "../src/server.js";

test("resolves one deterministic runtime path per supported platform", () => {
  assert.equal(
    runtimeRelativePath("win32", "x64"),
    join("native", "win32-x64", "kaying-computer-use.exe"),
  );
  assert.equal(
    runtimeRelativePath("linux", "arm64"),
    join("native", "linux-arm64", "kaying-computer-use"),
  );
  assert.equal(
    runtimeRelativePath("darwin", "arm64"),
    join(
      "native",
      "darwin-arm64",
      "Kaying Computer Use.app",
      "Contents",
      "MacOS",
      "OpenComputerUse",
    ),
  );
});

test("resolves inside the plugin root and rejects unsupported targets", () => {
  const root = resolve("fixture-plugin");
  assert.equal(
    resolveNativeRuntime({ pluginRoot: root, platform: "win32", arch: "arm64" }),
    join(root, "native", "win32-arm64", "kaying-computer-use.exe"),
  );
  assert.throws(() => runtimeRelativePath("freebsd", "x64"), /does not support platform/u);
  assert.throws(() => runtimeRelativePath("win32", "ia32"), /does not support architecture/u);
});

test("fails closed with the target and lock when the bundled runtime is missing", async () => {
  await assert.rejects(
    runNativeRuntime({
      pluginRoot: resolve("missing-plugin"),
      platform: "win32",
      arch: "x64",
      lockVersion: "upstream 0.2.3",
      existsSync: () => false,
    }),
    /missing for win32\/x64 \(upstream 0\.2\.3\)/u,
  );
});
