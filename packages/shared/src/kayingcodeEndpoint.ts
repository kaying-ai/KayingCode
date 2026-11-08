import type { KayingCodeEnv } from "./env.js";

/**
 * KayingCode.localrun：无官方产品服务端。
 * 默认不指向 kayingcode.z.ai / chat.z.ai / api.z.ai / bigmodel.cn；
 * 模型仅走用户自配 Provider。保留类型以兼容现有调用，origin 默认为空/本地。
 */
export const DEFAULT_KAYINGCODE_ENDPOINT_ORIGIN = "";
export const TEST_KAYINGCODE_ENDPOINT_ORIGIN = "";
export const CODING_PLAN_LOCAL_WEBVIEW_ORIGIN = "http://localhost:3000";
export const DEFAULT_BIGMODEL_API_ORIGIN = "";
export const TEST_BIGMODEL_API_ORIGIN = "";
export const DEFAULT_ZAI_OAUTH_ORIGIN = "";
export const TEST_ZAI_OAUTH_ORIGIN = "";
export const DEFAULT_ZAI_BUSINESS_BASE_URL = "";
export const TEST_ZAI_BUSINESS_BASE_URL = "";
export const DEFAULT_ZAI_OAUTH_CLIENT_ID = "";
export const TEST_ZAI_OAUTH_CLIENT_ID = "";
export const DEFAULT_WEB_REMOTE_CONTROL_RELAY_WS_URL = "";
export const WEB_REMOTE_CONTROL_V4_MIN_APP_VERSION = "3.4.0";

// 构建仅注入公开链接；Node 调用方仍可显式传 env，避免读取另一进程的配置。
declare const __KAYINGCODE_ENDPOINT_ENV__: Record<string, string | undefined> | undefined;
export function pickProductEndpointEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const keys = [
    "KAYINGCODE_BASE_URL",
    "KAYINGCODE_ENDPOINT_ORIGIN",
    "BIGMODEL_API_BASE_URL",
    "ZAI_OAUTH_ORIGIN",
    "ZAI_BUSINESS_BASE_URL",
    "ZAI_OAUTH_CLIENT_ID",
    "ZAI_OAUTH_APP_ID",
  ];
  return Object.fromEntries(
    keys.flatMap((key) => (env[key]?.trim() ? [[key, env[key]!.trim()]] : [])),
  );
}
export function readProductEndpointEnv(): Record<string, string | undefined> {
  return {
    ...(typeof __KAYINGCODE_ENDPOINT_ENV__ === "undefined" ? {} : __KAYINGCODE_ENDPOINT_ENV__),
    ...pickProductEndpointEnv(typeof process === "undefined" ? {} : process.env),
  };
}

export interface BuildKayingCodeEndpointUrlsOptions {
  appVersion?: string;
}

function isWebRemoteControlV4AppVersion(appVersion: string | undefined): boolean {
  if (!appVersion) {
    return false;
  }

  // kayingcodeEndpoint 会被 Vite 配置在 Node 加载期直接导入，不能依赖源码态 `.js` runtime import。
  // 这里只比较固定的稳定版门槛；高于 3.4.0 的预发布版本仍满足门槛，3.4.0 自身的预发布版本不满足。
  const normalizedVersion = appVersion.trim().replace(/^v/i, "");
  const match = normalizedVersion.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([^+]+))?(?:\+(.+))?$/,
  );
  if (!match) {
    return false;
  }

  const prereleaseIdentifiers = match[4]?.split(".");
  const hasValidPrerelease =
    prereleaseIdentifiers === undefined ||
    prereleaseIdentifiers.every(
      (identifier) =>
        /^[0-9A-Za-z-]+$/.test(identifier) &&
        (!/^\d+$/.test(identifier) || /^(0|[1-9]\d*)$/.test(identifier)),
    );
  const buildIdentifiers = match[5]?.split(".");
  const hasValidBuild =
    buildIdentifiers === undefined ||
    buildIdentifiers.every((identifier) => /^[0-9A-Za-z-]+$/.test(identifier));
  if (!hasValidPrerelease || !hasValidBuild) {
    return false;
  }

  const versionParts = [Number(match[1]), Number(match[2]), Number(match[3])];
  const floorParts = WEB_REMOTE_CONTROL_V4_MIN_APP_VERSION.split(".").map(Number);
  for (let index = 0; index < floorParts.length; index += 1) {
    if (versionParts[index]! !== floorParts[index]!) {
      return versionParts[index]! > floorParts[index]!;
    }
  }

  return prereleaseIdentifiers === undefined;
}

export interface KayingCodeEndpointUrls {
  origin: string;
  apiBaseUrl: string;
  remoteUrl: string;
  webRemoteCallbackUrl: string;
  webShareCallbackUrl: string;
  relayWsUrl: string;
  kayingcodePlanOpenAiBaseUrl: string;
  kayingcodePlanAnthropicBaseUrl: string;
  kayingcodePlanBillingCurrentUrl: string;
  kayingcodePlanBillingBalanceUrl: string;
}

export interface RuntimeKayingCodeEndpointEnv {
  [key: string]: string | undefined;
  KAYINGCODE_ENV?: string;
  KAYINGCODE_BASE_URL?: string;
  KAYINGCODE_ENDPOINT_ORIGIN?: string;
  KAYINGCODE_TEST_BASE_URL?: string;
  KAYINGCODE_PRODUCTION_BASE_URL?: string;
}

export interface RuntimeBigModelApiEnv {
  [key: string]: string | undefined;
  KAYINGCODE_ENV?: string;
  BIGMODEL_API_BASE_URL?: string;
  BIGMODEL_TEST_API_BASE_URL?: string;
  BIGMODEL_PRODUCTION_API_BASE_URL?: string;
}

export interface RuntimeZaiEndpointEnv {
  [key: string]: string | undefined;
  KAYINGCODE_ENV?: string;
  ZAI_OAUTH_ORIGIN?: string;
  ZAI_TEST_OAUTH_ORIGIN?: string;
  ZAI_PRODUCTION_OAUTH_ORIGIN?: string;
  ZAI_BUSINESS_BASE_URL?: string;
  ZAI_TEST_BUSINESS_BASE_URL?: string;
  ZAI_PRODUCTION_BUSINESS_BASE_URL?: string;
  ZAI_OAUTH_CLIENT_ID?: string;
  ZAI_TEST_OAUTH_CLIENT_ID?: string;
  ZAI_PRODUCTION_OAUTH_CLIENT_ID?: string;
  ZAI_OAUTH_APP_ID?: string;
}

export interface RuntimeProductEndpointEnv
  extends RuntimeKayingCodeEndpointEnv, RuntimeBigModelApiEnv, RuntimeZaiEndpointEnv {}

export interface RuntimeProductEndpointConfig {
  kayingcodeEnv: KayingCodeEnv;
  kayingcodeEndpointOrigin: string;
  kayingcodeEndpointUrls: KayingCodeEndpointUrls;
  zaiOAuthOrigin: string;
  zaiBusinessBaseUrl: string;
  zaiOAuthClientId: string;
  bigModelApiOrigin: string;
}

function readRuntimeEnvValue(
  env: Record<string, string | undefined>,
  key: string,
): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function readRuntimeKayingCodeEnvScopedValue(
  env: Record<string, string | undefined>,
  kayingcodeEnv: KayingCodeEnv,
  testKey: string,
  productionKey: string,
): string | undefined {
  return readRuntimeEnvValue(env, kayingcodeEnv === "production" ? productionKey : testKey);
}

export function normalizeKayingCodeEndpointOrigin(value: string): string {
  const trimmed = value.trim();
  // KayingCode.localrun：无官方产品服务端，允许空 origin（表示禁用该业务端点）。
  if (!trimmed) {
    return "";
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("KayingCode endpoint origin must use http or https");
  }
  return parsed.origin;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function isTrustedCodingPlanWebviewOrigin(
  value: string | null | undefined,
  options?: {
    e2eStoreBridgeEnabled?: boolean;
  },
): boolean {
  if (!value) return false;
  try {
    const origin = normalizeKayingCodeEndpointOrigin(value);
    if (
      origin === DEFAULT_KAYINGCODE_ENDPOINT_ORIGIN ||
      origin === TEST_KAYINGCODE_ENDPOINT_ORIGIN ||
      origin === CODING_PLAN_LOCAL_WEBVIEW_ORIGIN
    ) {
      return true;
    }
    const parsed = new URL(origin);
    return options?.e2eStoreBridgeEnabled === true && isLoopbackHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export function resolveKayingCodeEndpointOrigin(options?: {
  env?: KayingCodeEnv;
  envBaseOrigin?: string | null;
  overrideOrigin?: string | null;
}): string {
  const env = options?.env ?? "test";
  const envBaseOrigin = options?.envBaseOrigin?.trim();
  if (env === "production") {
    return envBaseOrigin
      ? normalizeKayingCodeEndpointOrigin(envBaseOrigin)
      : DEFAULT_KAYINGCODE_ENDPOINT_ORIGIN;
  }

  const overrideOrigin = options?.overrideOrigin?.trim();
  if (overrideOrigin) {
    return normalizeKayingCodeEndpointOrigin(overrideOrigin);
  }

  return envBaseOrigin ? normalizeKayingCodeEndpointOrigin(envBaseOrigin) : TEST_KAYINGCODE_ENDPOINT_ORIGIN;
}

export function resolveRuntimeKayingCodeEnv(env: RuntimeKayingCodeEndpointEnv = {}): KayingCodeEnv {
  // 独立 CLI / 服务测试未注入 KAYINGCODE_ENV 时默认生产域；桌面测试包会显式下发 KAYINGCODE_ENV=test。
  return env.KAYINGCODE_ENV?.trim().toLowerCase() === "test" ? "test" : "production";
}

export function resolveRuntimeKayingCodeEndpointOrigin(
  env: RuntimeKayingCodeEndpointEnv = {},
  options?: { overrideOrigin?: string | null },
): string {
  const kayingcodeEnv = resolveRuntimeKayingCodeEnv(env);
  const scopedBaseOrigin =
    kayingcodeEnv === "production"
      ? readRuntimeEnvValue(env, "KAYINGCODE_PRODUCTION_BASE_URL")
      : readRuntimeEnvValue(env, "KAYINGCODE_TEST_BASE_URL");

  return resolveKayingCodeEndpointOrigin({
    env: kayingcodeEnv,
    envBaseOrigin:
      readRuntimeEnvValue(env, "KAYINGCODE_BASE_URL") ??
      readRuntimeEnvValue(env, "KAYINGCODE_ENDPOINT_ORIGIN") ??
      scopedBaseOrigin,
    overrideOrigin: options?.overrideOrigin,
  });
}

export function buildRuntimeKayingCodeEndpointUrls(
  env: RuntimeKayingCodeEndpointEnv = {},
): KayingCodeEndpointUrls {
  return buildKayingCodeEndpointUrls(resolveRuntimeKayingCodeEndpointOrigin(env));
}

export function buildRuntimeKayingCodeApiUrl(
  env: RuntimeKayingCodeEndpointEnv = readProductEndpointEnv(),
  path: string,
): string {
  const origin = resolveRuntimeKayingCodeEndpointOrigin(env);
  if (!origin) return "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalizedPath}`;
}

export function resolveWebRemoteControlRelayWsUrl(options?: {
  endpointOrigin?: string | null | undefined;
  overrideUrl?: string | null | undefined;
}): string {
  const overrideUrl = options?.overrideUrl?.trim();
  if (overrideUrl) {
    return overrideUrl;
  }

  const origin = new URL(
    normalizeKayingCodeEndpointOrigin(options?.endpointOrigin?.trim() || DEFAULT_KAYINGCODE_ENDPOINT_ORIGIN),
  );
  origin.protocol = origin.protocol === "https:" ? "wss:" : "ws:";
  origin.pathname = "/api/v1/remote/ws2";
  return origin.toString();
}

export function resolveBigModelApiOrigin(env: RuntimeBigModelApiEnv = {}): string {
  const kayingcodeEnv = resolveRuntimeKayingCodeEnv(env);
  const scopedBaseOrigin =
    kayingcodeEnv === "production"
      ? readRuntimeEnvValue(env, "BIGMODEL_PRODUCTION_API_BASE_URL")
      : readRuntimeEnvValue(env, "BIGMODEL_TEST_API_BASE_URL");
  const fallbackOrigin =
    kayingcodeEnv === "production" ? DEFAULT_BIGMODEL_API_ORIGIN : TEST_BIGMODEL_API_ORIGIN;

  return normalizeKayingCodeEndpointOrigin(
    readRuntimeEnvValue(env, "BIGMODEL_API_BASE_URL") ?? scopedBaseOrigin ?? fallbackOrigin,
  );
}

export function buildBigModelApiUrl(env: RuntimeBigModelApiEnv = {}, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${resolveBigModelApiOrigin(env)}${normalizedPath}`;
}

export function buildBigModelCodingPlanPersonalManageUrl(env: RuntimeBigModelApiEnv = {}): string {
  // 修复原因：BigModel Coding Plan 管理页要跟随 KAYINGCODE_ENV；
  // 测试环境如果继续写死 bigmodel.cn，会把测试账号带到生产套餐页。
  return buildBigModelApiUrl(env, "/coding-plan/personal/overview");
}

export function buildBigModelCodingPlanTeamManageUrl(env: RuntimeBigModelApiEnv = {}): string {
  return buildBigModelApiUrl(env, "/coding-plan/team/plans");
}

export function resolveZaiOAuthOrigin(env: RuntimeZaiEndpointEnv = {}): string {
  const kayingcodeEnv = resolveRuntimeKayingCodeEnv(env);
  const scopedOrigin = readRuntimeKayingCodeEnvScopedValue(
    env,
    kayingcodeEnv,
    "ZAI_TEST_OAUTH_ORIGIN",
    "ZAI_PRODUCTION_OAUTH_ORIGIN",
  );
  const fallbackOrigin =
    kayingcodeEnv === "production" ? DEFAULT_ZAI_OAUTH_ORIGIN : TEST_ZAI_OAUTH_ORIGIN;

  return normalizeKayingCodeEndpointOrigin(
    readRuntimeEnvValue(env, "ZAI_OAUTH_ORIGIN") ?? scopedOrigin ?? fallbackOrigin,
  );
}

export function resolveZaiBusinessBaseUrl(env: RuntimeZaiEndpointEnv = {}): string {
  const kayingcodeEnv = resolveRuntimeKayingCodeEnv(env);
  const scopedOrigin = readRuntimeKayingCodeEnvScopedValue(
    env,
    kayingcodeEnv,
    "ZAI_TEST_BUSINESS_BASE_URL",
    "ZAI_PRODUCTION_BUSINESS_BASE_URL",
  );
  const fallbackOrigin =
    kayingcodeEnv === "production" ? DEFAULT_ZAI_BUSINESS_BASE_URL : TEST_ZAI_BUSINESS_BASE_URL;

  return normalizeKayingCodeEndpointOrigin(
    readRuntimeEnvValue(env, "ZAI_BUSINESS_BASE_URL") ?? scopedOrigin ?? fallbackOrigin,
  );
}

export function resolveZaiOAuthClientId(env: RuntimeZaiEndpointEnv = {}): string {
  const kayingcodeEnv = resolveRuntimeKayingCodeEnv(env);
  const scopedClientId = readRuntimeKayingCodeEnvScopedValue(
    env,
    kayingcodeEnv,
    "ZAI_TEST_OAUTH_CLIENT_ID",
    "ZAI_PRODUCTION_OAUTH_CLIENT_ID",
  );
  const fallbackClientId =
    kayingcodeEnv === "production" ? DEFAULT_ZAI_OAUTH_CLIENT_ID : TEST_ZAI_OAUTH_CLIENT_ID;

  return (
    readRuntimeEnvValue(env, "ZAI_OAUTH_CLIENT_ID") ??
    scopedClientId ??
    readRuntimeEnvValue(env, "ZAI_OAUTH_APP_ID") ??
    fallbackClientId
  );
}

export function buildZaiOAuthUrl(origin: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeKayingCodeEndpointOrigin(origin)}${normalizedPath}`;
}

export function buildRuntimeZaiOAuthUrl(env: RuntimeZaiEndpointEnv = {}, path: string): string {
  return buildZaiOAuthUrl(resolveZaiOAuthOrigin(env), path);
}

export function buildRuntimeZaiBusinessUrl(env: RuntimeZaiEndpointEnv = {}, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${resolveZaiBusinessBaseUrl(env)}${normalizedPath}`;
}

export function resolveRuntimeProductEndpointConfig(
  env: RuntimeProductEndpointEnv = {},
): RuntimeProductEndpointConfig {
  const kayingcodeEnv = resolveRuntimeKayingCodeEnv(env);
  const kayingcodeEndpointOrigin = resolveRuntimeKayingCodeEndpointOrigin(env);

  return {
    kayingcodeEnv,
    kayingcodeEndpointOrigin,
    kayingcodeEndpointUrls: buildKayingCodeEndpointUrls(kayingcodeEndpointOrigin),
    zaiOAuthOrigin: resolveZaiOAuthOrigin(env),
    zaiBusinessBaseUrl: resolveZaiBusinessBaseUrl(env),
    zaiOAuthClientId: resolveZaiOAuthClientId(env),
    bigModelApiOrigin: resolveBigModelApiOrigin(env),
  };
}

export function buildKayingCodeEndpointUrls(
  origin: string,
  options: BuildKayingCodeEndpointUrlsOptions = {},
): KayingCodeEndpointUrls {
  const normalizedOrigin = normalizeKayingCodeEndpointOrigin(origin);
  // KayingCode.localrun：无官方端点时返回空 URL，避免拼出非法相对地址。
  if (!normalizedOrigin) {
    return {
      origin: "",
      apiBaseUrl: "",
      remoteUrl: "",
      webRemoteCallbackUrl: "",
      webShareCallbackUrl: "",
      relayWsUrl: "",
      kayingcodePlanOpenAiBaseUrl: "",
      kayingcodePlanAnthropicBaseUrl: "",
      kayingcodePlanBillingCurrentUrl: "",
      kayingcodePlanBillingBalanceUrl: "",
    };
  }
  const parsed = new URL(normalizedOrigin);
  const wsProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  const wsOrigin = `${wsProtocol}//${parsed.host}`;
  // 无法解析或低于分界版本时保守使用 v3，避免开发版本和旧客户端进入未兼容的 v4 页面。
  const remoteVersion = isWebRemoteControlV4AppVersion(options.appVersion) ? "v4" : "v3";
  return {
    origin: normalizedOrigin,
    apiBaseUrl: `${normalizedOrigin}/api/v1`,
    remoteUrl: `${normalizedOrigin}/remote/${remoteVersion}`,
    webRemoteCallbackUrl: `${normalizedOrigin}/remote/v4`,
    webShareCallbackUrl: `${normalizedOrigin}/cn/share/callback`,
    relayWsUrl: `${wsOrigin}/api/v1/remote/ws2`,
    kayingcodePlanOpenAiBaseUrl: `${normalizedOrigin}/api/v1/kayingcode-plan`,
    kayingcodePlanAnthropicBaseUrl: `${normalizedOrigin}/api/v1/kayingcode-plan/anthropic`,
    kayingcodePlanBillingCurrentUrl: `${normalizedOrigin}/api/v1/kayingcode-plan/billing/current`,
    kayingcodePlanBillingBalanceUrl: `${normalizedOrigin}/api/v1/kayingcode-plan/billing/balance`,
  };
}

export function rewriteKayingCodeEndpointUrl(input: string | URL, endpointOrigin: string): string | URL {
  const originalUrl = typeof input === "string" ? input : input.toString();
  let parsed: URL;
  try {
    parsed = new URL(originalUrl);
  } catch {
    return input;
  }
  const sourceOrigin = DEFAULT_KAYINGCODE_ENDPOINT_ORIGIN;
  if (parsed.origin !== sourceOrigin) {
    return input;
  }

  const targetOrigin = normalizeKayingCodeEndpointOrigin(endpointOrigin);
  if (targetOrigin === sourceOrigin) {
    return input;
  }

  const target = new URL(targetOrigin);
  target.pathname = parsed.pathname;
  target.search = parsed.search;
  target.hash = parsed.hash;
  return target.toString();
}
