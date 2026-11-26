import { expect, test } from "vitest";
import { isExtensionHostControlMessage } from "../src/main/extensionHostMessages.js";

test("识别 Window Host 的 extension-host 控制消息", () => {
  expect(isExtensionHostControlMessage({ type: "extension-host/window-ready" })).toBe(true);
  expect(isExtensionHostControlMessage({ type: "extension-host/logs-request", requestId: "r1" })).toBe(
    true,
  );
});

test("普通 HostResponse、字符串和非对象不当作 extension-host 消息", () => {
  expect(isExtensionHostControlMessage({ type: "database-startup-state" })).toBe(false);
  expect(isExtensionHostControlMessage({ type: "extension-host" })).toBe(false);
  expect(isExtensionHostControlMessage("extension-host/window-ready")).toBe(false);
  expect(isExtensionHostControlMessage(null)).toBe(false);
});
