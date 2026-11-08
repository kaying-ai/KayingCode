import assert from "node:assert/strict";
import test from "node:test";
import { AndroidDevice } from "../runtime/android.mjs";

test("launch resolves the target component and uses explicit am start, independent of monkey keys", async () => {
  const calls = [];
  const device = new AndroidDevice(async (_command, args) => {
    calls.push(args);
    if (args.includes("resolve-activity"))
      return Buffer.from("priority=0\ncom.example.game/.Main\n");
    return Buffer.from("Status: ok");
  }, "emulator-5554");
  await device.install("/tmp/game.apk", "com.example.game");
  assert.ok(calls.some((args) => args.includes("am") && args.includes("com.example.game/.Main")));
  assert.ok(!calls.some((args) => args.includes("monkey")));
});

test("unresolved or foreign-package activities cannot launch", async () => {
  for (const output of [
    "No activity found",
    "com.other.game/.Main",
    "com.example.game/.Main;exit",
  ]) {
    const device = new AndroidDevice(async (_command, args) => {
      assert.ok(!args.includes("am"));
      return Buffer.from(args.includes("resolve-activity") ? output : "Success");
    }, "emulator-5554");
    await assert.rejects(device.install("/tmp/game.apk", "com.example.game"), /resolve.*Activity/i);
  }
});
