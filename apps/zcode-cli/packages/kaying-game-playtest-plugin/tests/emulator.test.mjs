import assert from "node:assert/strict";
import test from "node:test";
import { EmulatorManager, rendererInfo } from "../runtime/emulator.mjs";

test("reuse ready devices; never restart or wipe them", async () => {
  let spawns = 0;
  const manager = new EmulatorManager({
    run: async (_cmd, args) =>
      Buffer.from(
        args[0] === "devices"
          ? "List of devices attached\nemulator-5554 device\n"
          : args.includes("SurfaceFlinger")
            ? "GLES: Google (Apple), Apple M5 Metal"
            : "1",
      ),
    spawn: () => {
      spawns++;
    },
  });
  const result = await manager.call({ operation: "start" });
  assert.equal(result.reused, true);
  assert.equal(spawns, 0);
  assert.equal(result.device.environment.softwareRendering, false);
});
test("cold launch uses host GPU without snapshot or userdata destruction", async () => {
  let launched;
  const manager = new EmulatorManager({
    run: async (_cmd, args) =>
      Buffer.from(args[0] === "devices" ? "List of devices attached\n" : "test_avd\n"),
    spawn: async (command, args) => {
      launched = { command, args };
      return { pid: 123 };
    },
  });
  const result = await manager.call({ operation: "start", avd: "test_avd" });
  assert.deepEqual(launched.args, [
    "-avd",
    "test_avd",
    "-gpu",
    "host",
    "-no-snapshot-load",
    "-no-snapshot-save",
  ]);
  assert.equal(result.status, "starting");
  assert.ok(!launched.args.includes("-wipe-data"));
  const again = await manager.call({ operation: "start", avd: "test_avd" });
  assert.equal(again.reused, true);
  assert.equal(again.pid, 123);
});
test("multiple devices require selection and software fallback is visible", async () => {
  const manager = new EmulatorManager({
    run: async () => Buffer.from("List of devices attached\none device\ntwo device\n"),
  });
  await assert.rejects(manager.call({ operation: "start" }), /serial/i);
  assert.equal(rendererInfo("GLES: Google, SwiftShader Device").softwareRendering, true);
  assert.equal(rendererInfo("").softwareRendering, null);
});
