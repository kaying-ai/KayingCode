import assert from "node:assert/strict";
import test from "node:test";

test("macOS DMG layout does not copy generated background and volume icon as source files", async () => {
  const previous = {
    targetOs: process.env.KAYINGCODE_TARGET_OS,
    targetArch: process.env.KAYINGCODE_TARGET_ARCH,
    macSign: process.env.KAYINGCODE_ENABLE_MAC_SIGN,
  };
  process.env.KAYINGCODE_TARGET_OS = "mac";
  process.env.KAYINGCODE_TARGET_ARCH = "arm64";
  process.env.KAYINGCODE_ENABLE_MAC_SIGN = "0";
  try {
    const { default: config } = await import("../electron-builder.config.js");
    assert.equal(config.dmg.background, "build/dmg_background.png");
    assert.equal(config.dmg.icon, "build/icon_installer.icns");
    assert.deepEqual(config.dmg.contents, [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: "link", path: "/Applications" },
    ]);
  } finally {
    for (const [key, value] of [
      ["KAYINGCODE_TARGET_OS", previous.targetOs],
      ["KAYINGCODE_TARGET_ARCH", previous.targetArch],
      ["KAYINGCODE_ENABLE_MAC_SIGN", previous.macSign],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
