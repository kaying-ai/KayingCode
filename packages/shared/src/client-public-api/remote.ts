import { ApiError } from "../api.js";
import {
  parseClientConfigsSnapshot,
  type ClientConfigsSnapshot,
  type ClientScenesResponse,
} from "./contracts.js";
import { buildClientConfigsUrl, buildClientScenesUrl } from "./endpoints.js";
import type {
  ClientPublicApiCallOptions,
  ClientPublicApiRequest,
  IClientPublicApi,
} from "./types.js";

export interface RemoteClientPublicApiOptions {
  /** 官方端点 origin；空串表示无官方端点（应改走 ApiMock）。 */
  endpointOrigin: string;
  request: ClientPublicApiRequest;
}

async function readJson(
  request: ClientPublicApiRequest,
  url: string,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  if (!url.trim()) {
    throw new ApiError({
      message: "KayingCode public API URL is empty (no official endpoint configured)",
      url,
      method: "GET",
      status: 0,
    });
  }
  let response: Response;
  try {
    response = await request(url, {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    throw new ApiError({
      message: error instanceof Error ? error.message : "public API request failed",
      url,
      method: "GET",
      status: 0,
      cause: error,
    });
  }
  if (!response.ok) {
    throw new ApiError({
      message: `public API HTTP ${response.status}`,
      url,
      method: "GET",
      status: response.status,
    });
  }
  try {
    return await response.json();
  } catch (error) {
    throw new ApiError({
      message: error instanceof Error ? error.message : "Invalid JSON response",
      url,
      method: "GET",
      status: response.status,
      cause: error,
    });
  }
}

/**
 * 远端公开 Client API 实现。请求细节走注入的 request 端口，
 * 便于 Desktop(net.fetch) / Host(apiClient) / Node(fetch) 各自装配。
 */
export function createRemoteClientPublicApi(options: RemoteClientPublicApiOptions): IClientPublicApi {
  return {
    async getClientConfigs(call: ClientPublicApiCallOptions): Promise<ClientConfigsSnapshot> {
      const url = buildClientConfigsUrl(options.endpointOrigin, {
        appVersion: call.appVersion,
        platform: call.platform,
      });
      return parseClientConfigsSnapshot(await readJson(options.request, url, call.signal));
    },
    async getClientScenes(call: ClientPublicApiCallOptions): Promise<ClientScenesResponse> {
      const url = buildClientScenesUrl(options.endpointOrigin, {
        appVersion: call.appVersion,
        platform: call.platform,
      });
      return (await readJson(options.request, url, call.signal)) as ClientScenesResponse;
    },
  };
}
