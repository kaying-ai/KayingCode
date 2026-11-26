import { expect, test } from "vitest";
import { kayingcodeSessionRuntimePreferencesResultSchema } from "../src/kayingcode-protocol/index.js";
import { appSettingsPatchSchema, appSettingsSchema } from "../src/validationAppSettings.js";

test("旧 Host 缺少会话运行偏好字段时按产品默认关闭解析", () => {
  // 兼容旧 Host：协议 result 只给足历史必填字段，两个新开关必须落到 false，
  // 不能因为缺字段报错，也不能把子代理后台策略当成默认开启。
  const parsed = kayingcodeSessionRuntimePreferencesResultSchema.parse({
    nativeSearchEnhancementsEnabled: true,
  });
  expect(parsed.totalTokensReminderEnabled).toBe(false);
  expect(parsed.agentAlwaysBackgroundEnabled).toBe(false);
});

test("会话运行偏好保留显式开启值", () => {
  const parsed = kayingcodeSessionRuntimePreferencesResultSchema.parse({
    nativeSearchEnhancementsEnabled: true,
    totalTokensReminderEnabled: true,
    agentAlwaysBackgroundEnabled: true,
  });
  expect(parsed.totalTokensReminderEnabled).toBe(true);
  expect(parsed.agentAlwaysBackgroundEnabled).toBe(true);
});

test("AppSettings 为两个新开关提供持久化事实与关闭默认值", () => {
  const defaults = appSettingsSchema.parse({});
  expect(defaults.totalTokensReminderEnabled).toBe(false);
  expect(defaults.agentAlwaysBackgroundEnabled).toBe(false);

  const enabled = appSettingsSchema.parse({
    totalTokensReminderEnabled: true,
    agentAlwaysBackgroundEnabled: true,
  });
  expect(enabled.totalTokensReminderEnabled).toBe(true);
  expect(enabled.agentAlwaysBackgroundEnabled).toBe(true);

  // 显式 false 不能被完整 schema 剥离，否则重启后会恢复成默认值。
  const disabled = appSettingsSchema.parse({ agentAlwaysBackgroundEnabled: false });
  expect(disabled.agentAlwaysBackgroundEnabled).toBe(false);
});

test("设置 patch 接受两个开关并保持布尔原值", () => {
  expect(
    appSettingsPatchSchema.parse({
      totalTokensReminderEnabled: true,
      agentAlwaysBackgroundEnabled: false,
    }),
  ).toEqual({ totalTokensReminderEnabled: true, agentAlwaysBackgroundEnabled: false });
});
