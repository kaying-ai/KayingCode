import { buildKayingCodeEndpointUrls } from "../kayingcodeEndpoint.js";

/** 公开 Client API 路径常量；新增接口先在这里落路径，避免各处手写字符串。 */
export const CLIENT_CONFIGS_API_PATH = "/api/v1/client/configs" as const;
export const CLIENT_SCENES_API_PATH = "/api/v1/client/scenes" as const;

export interface ClientPublicApiQuery {
  appVersion: string;
  /** 服务端按平台分流；Web 端可省略。 */
  platform?: string;
}

function buildClientApiUrl(
  endpointOrigin: string,
  path: string,
  query: ClientPublicApiQuery,
): string {
  const origin = buildKayingCodeEndpointUrls(endpointOrigin).origin;
  // KayingCode.localrun：无官方端点时返回空串，由调用方走本地 ApiMock。
  if (!origin) return "";
  const url = new URL(path, origin);
  url.searchParams.set("app_version", query.appVersion);
  if (query.platform) url.searchParams.set("platform", query.platform);
  return url.toString();
}

export function buildClientConfigsUrl(
  endpointOrigin: string,
  query: ClientPublicApiQuery,
): string {
  return buildClientApiUrl(endpointOrigin, CLIENT_CONFIGS_API_PATH, query);
}

export function buildClientScenesUrl(
  endpointOrigin: string,
  query: ClientPublicApiQuery,
): string {
  return buildClientApiUrl(endpointOrigin, CLIENT_SCENES_API_PATH, query);
}
