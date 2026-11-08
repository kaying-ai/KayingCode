import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { setImmediate } from "node:timers/promises";
import { test } from "vitest";
import { bindDesktopDevLauncherLifetime, canUseWindowsDesktopTray } from "./desktopDevLifecycle.js";

test("Windows tray belongs to packaged apps, independent of the selected backend", () => {
  assert.equal(canUseWindowsDesktopTray("win32", false), false);
  assert.equal(canUseWindowsDesktopTray("win32", true), true);
  assert.equal(canUseWindowsDesktopTray("darwin", true), false);
  assert.equal(canUseWindowsDesktopTray("linux", true), false);
});

test("dev launcher EOF requests quit once even when close follows", async () => {
  const input = new PassThrough();
  let quits = 0;
  bindDesktopDevLauncherLifetime({
    isPackaged: false,
    enabled: true,
    input,
    requestQuit: () => quits++,
  });
  assert.equal(quits, 0);
  input.end();
  await setImmediate();
  input.destroy();
  await setImmediate();
  assert.equal(quits, 1);
});

test("packaged and unbound Electron do not observe the lifetime stream", () => {
  for (const settings of [
    { isPackaged: true, enabled: true },
    { isPackaged: false, enabled: false },
  ]) {
    const input = new PassThrough();
    bindDesktopDevLauncherLifetime({
      ...settings,
      input,
      requestQuit: () => assert.fail("must not quit"),
    });
    assert.equal(input.listenerCount("end"), 0);
    assert.equal(input.listenerCount("close"), 0);
    input.destroy();
  }
});
