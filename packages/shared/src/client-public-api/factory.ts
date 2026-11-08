import { buildKayingCodeEndpointUrls } from "../kayingcodeEndpoint.js";
import type { ClientConfigsSnapshot } from "./contracts.js";
import { createLocalClientPublicApi, type LocalClientPublicApiOptions } from "./mock.js";
import { createRemoteClientPublicApi } from "./remote.js";
import type { ClientPublicApiRequest, IClientPublicApi } from "./types.js";

export interface CreateClientPublicApiOptions {
  /** 当前官方端点；可异步解析（settings/env）。 */
  resolveEndpointOrigin: () => string | Promise<string>;
  /** 远端请求端口；无官方端点时不会被调用。 */
  request: ClientPublicApiRequest;
  /** 本地缺省/覆盖，localrun 下的 ApiMock 数据源。 */
  local?: LocalClientPublicApiOptions;
}

/**
 * 装配公开 Client API：
 * - 无官方端点（KayingCode.localrun）→ 本地 ApiMock，纯本地返回；
 * - 有官方端点 → 远端实现。
 *
 * 每次调用按当前 endpointOrigin 选择实现，便于设置页改端点后立即生效。
 */
export function createClientPublicApi(options: CreateClientPublicApiOptions): IClientPublicApi {
  const local = createLocalClientPublicApi(options.local);
  return {
    async getClientConfigs(call) {
      const origin = buildKayingCodeEndpointUrls(await options.resolveEndpointOrigin()).origin;
      if (!origin) return local.getClientConfigs(call);
      return createRemoteClientPublicApi({
        endpointOrigin: origin,
        request: options.request,
      }).getClientConfigs(call);
    },
    async getClientScenes(call) {
      const origin = buildKayingCodeEndpointUrls(await options.resolveEndpointOrigin()).origin;
      if (!origin) return local.getClientScenes(call);
      return createRemoteClientPublicApi({
        endpointOrigin: origin,
        request: options.request,
      }).getClientScenes(call);
    },
  };
}

export type { ClientConfigsSnapshot };
