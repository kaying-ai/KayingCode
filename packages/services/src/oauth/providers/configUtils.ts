import {
  KAYINGCODE_VERSION,
  buildRuntimeKayingCodeApiUrl,
  buildRuntimeKayingCodeEndpointUrls,
} from "@zcode/shared";

const DESKTOP_OAUTH_CALLBACK_URI = "kayingcode://oauth/callback";

export function readEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key];
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function readBoolean(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = readEnv(env, key);
  if (raw == null) {
    return fallback;
  }

  return raw !== "0" && raw.toLowerCase() !== "false";
}

export function buildKayingCodeApiUrlFromEnv(env: NodeJS.ProcessEnv, path: string): string {
  // OAuth provider 是运行时配置，必须跟随传入 env.KAYINGCODE_ENV；
  // 地址来自 .env 的通用变量，默认线上；登录与 token 交换必须使用同一配置来源。
  return buildRuntimeKayingCodeApiUrl(env, path);
}

export function buildDesktopOAuthRedirectUriFromEnv(env: NodeJS.ProcessEnv): string {
  const origin = buildRuntimeKayingCodeEndpointUrls(env).origin;
  // Bug 原因：KayingCode.localrun 没有官方端点，origin 允许为空；空串进入 new URL 会抛
  // ERR_INVALID_URL，并让 Desktop Host 在 starting_services 阶段整体启动失败。
  // 无端点时 OAuth 登录不可用，回退到本地 deep link 作为占位，保证服务装配不因此中断。
  if (!origin) return DESKTOP_OAUTH_CALLBACK_URI;

  const url = new URL("/app/oauth/login", origin);
  url.searchParams.set("redirect", DESKTOP_OAUTH_CALLBACK_URI);
  // Website 需要按 App 版本决定是否关闭自动 deep link；缺少版本时必须兼容旧客户端行为。
  url.searchParams.set("app_version", KAYINGCODE_VERSION);
  return url.toString();
}
