import {
  localClientConfigsDefaults,
  localClientScenesDefaults,
  type ClientConfigsSnapshot,
  type ClientScenesResponse,
} from "./contracts.js";
import type { ClientPublicApiCallOptions, IClientPublicApi } from "./types.js";

/**
 * 旁路消费方（Electron net.request 灰度/强更等）在无官方端点时返回的 wire envelope。
 * 与 createLocalClientPublicApi 同源缺省：不下发任何 configs key，由各自 resolveConfig
 * 回退 fail-close（disabled / null）。不要在这里抛 empty endpoint origin。
 */
export function localClientConfigsEnvelope(): {
  code: 0;
  data: { configs: Record<string, never> };
} {
  return { code: 0, data: { configs: {} } };
}

export interface LocalClientPublicApiOptions {
  /**
   * 本地覆盖的公开配置。未提供的字段仍用 localClientConfigsDefaults()。
   * 例如把 config/default.json 的 help 形状填进来，localrun 下帮助/社群入口就有值。
   */
  configs?: Partial<ClientConfigsSnapshot>;
}

/**
 * 本地 ApiMock：localrun / 无官方端点时使用，不发起任何网络请求。
 * 与远端实现共享同一接口，未来补充新 API 时在此补齐本地缺省即可。
 *
 * 旁路灰度（desktopContextPrompt / rendererActionTrace / forceUpdate 等）同样以本文件
 * 为缺省真源：无官方端点时返回 disabled/null，不抛错、不发请求。
 */
export function createLocalClientPublicApi(
  options: LocalClientPublicApiOptions = {},
): IClientPublicApi {
  const defaults = localClientConfigsDefaults();
  const configs: ClientConfigsSnapshot = {
    ...defaults,
    ...options.configs,
    // 未覆盖时保持裁决语义：显式 null 不被 defaults 的同名空值“回填”。
    pluginStoreOrder: options.configs?.pluginStoreOrder ?? defaults.pluginStoreOrder,
    help: options.configs?.help ?? defaults.help,
    builtinProviderConfigJson:
      options.configs?.builtinProviderConfigJson ?? defaults.builtinProviderConfigJson,
    forceUpdate: options.configs?.forceUpdate ?? defaults.forceUpdate,
  };
  return {
    async getClientConfigs(_options: ClientPublicApiCallOptions): Promise<ClientConfigsSnapshot> {
      return structuredClone(configs);
    },
    async getClientScenes(_options: ClientPublicApiCallOptions): Promise<ClientScenesResponse> {
      return structuredClone(localClientScenesDefaults());
    },
  };
}
