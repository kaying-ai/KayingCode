import { expect, test } from "vitest";
import { normalizeSettingsPatch } from "../src/setting/normalizeSettingsPatch.js";

test("清空手机远控 Relay 地址时删除旧值", () => {
  expect(normalizeSettingsPatch({ mobileRelayOrigin: "   " }).mobileRelayOrigin).toBeUndefined();
  expect(
    normalizeSettingsPatch({ mobileRelayOrigin: " https://relay.example.com " }).mobileRelayOrigin,
  ).toBe("https://relay.example.com");
});
