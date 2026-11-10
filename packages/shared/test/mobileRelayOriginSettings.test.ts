import { expect, test } from "vitest";
import { normalizeMobileRelayOrigin } from "../src/mobileRelayOrigin.js";
import { appSettingsPatchSchema, appSettingsSchema } from "../src/validationAppSettings.js";

test("手机远控 Relay 设置只持久化 https origin", () => {
  expect(normalizeMobileRelayOrigin(" https://Relay.Example/some/path ")).toBe(
    "https://relay.example",
  );
  expect(() => normalizeMobileRelayOrigin("http://relay.example")).toThrow();
  expect(
    appSettingsPatchSchema.parse({ mobileRelayOrigin: " https://Relay.Example/some/path " })
      .mobileRelayOrigin,
  ).toBe("https://relay.example");
  expect(
    appSettingsSchema.parse({ mobileRelayOrigin: "https://127.0.0.1:8788" }).mobileRelayOrigin,
  ).toBe("https://127.0.0.1:8788");
});

test("空串、http 和非法 Relay 地址都回落到未设置，避免阻断设置读取", () => {
  expect(appSettingsPatchSchema.parse({ mobileRelayOrigin: "" }).mobileRelayOrigin).toBeUndefined();
  expect(
    appSettingsPatchSchema.parse({ mobileRelayOrigin: "http://relay.example" }).mobileRelayOrigin,
  ).toBeUndefined();
  expect(
    appSettingsPatchSchema.parse({ mobileRelayOrigin: "not a url" }).mobileRelayOrigin,
  ).toBeUndefined();
  expect(
    appSettingsSchema.parse({ mobileRelayOrigin: "ftp://relay.example" }).mobileRelayOrigin,
  ).toBeUndefined();
});
