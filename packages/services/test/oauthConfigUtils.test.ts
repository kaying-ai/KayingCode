import { expect, test } from "vitest";
import { buildDesktopOAuthRedirectUriFromEnv } from "../src/oauth/providers/configUtils.js";
import { createOAuthRuntimeConfig } from "../src/oauth/runtimeConfig.js";

test("localrun 无端点时回退到本地 deep link，不抛 Invalid URL", () => {
  expect(buildDesktopOAuthRedirectUriFromEnv({})).toBe("kayingcode://oauth/callback");
});

test("localrun 无端点时可构造 OAuth provider 配置", () => {
  const config = createOAuthRuntimeConfig({});

  expect(config.providers.map((provider) => provider.redirectUri)).toEqual([
    "kayingcode://oauth/callback",
    "kayingcode://oauth/callback",
    "kayingcode://oauth/callback",
  ]);
});

test("配置官方端点后生成网站登录 URL", () => {
  const redirectUri = buildDesktopOAuthRedirectUriFromEnv({
    KAYINGCODE_BASE_URL: "https://example.com",
  });
  const parsed = new URL(redirectUri);

  expect(parsed.origin).toBe("https://example.com");
  expect(parsed.pathname).toBe("/app/oauth/login");
  expect(parsed.searchParams.get("redirect")).toBe("kayingcode://oauth/callback");
});
