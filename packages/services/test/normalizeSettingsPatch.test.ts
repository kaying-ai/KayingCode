import { expect, test } from "vitest";
import { normalizeSettingsPatch } from "../src/setting/normalizeSettingsPatch.js";

test("清空手机远控 Relay 地址时删除旧值", () => {
  expect(normalizeSettingsPatch({ mobileRelayOrigin: "   " }).mobileRelayOrigin).toBeUndefined();
  expect(
    normalizeSettingsPatch({ mobileRelayOrigin: " https://relay.example.com " }).mobileRelayOrigin,
  ).toBe("https://relay.example.com");
});

test("回复语言空串表示删除覆盖，非空值 trim 后保存", () => {
  expect(normalizeSettingsPatch({ replyLanguage: "   " }).replyLanguage).toBeUndefined();
  expect(normalizeSettingsPatch({ replyLanguage: " 简体中文 " }).replyLanguage).toBe("简体中文");
});
