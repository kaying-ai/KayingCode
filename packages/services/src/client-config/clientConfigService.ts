import {
  buildKayingCodeEndpointUrls,
  clientConfigReadOptionsSchema,
  type ClientConfigSnapshot,
  type ClientPublicApiCallOptions,
  type IClientPublicApi,
} from "@zcode/shared";
import type { IClientConfigService } from "./clientConfig.js";

const CACHE_TTL_MS = 60 * 60 * 1000;

interface RequestContext {
  endpointOrigin: string;
  appVersion: string;
  platform: string;
}

interface CacheEntry {
  snapshot?: ClientConfigSnapshot;
  expiresAt: number;
  pending?: Promise<ClientConfigSnapshot>;
}

/** 首期仅公开配置；账户灰度不得通过此实例或缓存复用。 */
export function createClientConfigService(dependencies: {
  /** 公开 Client API；localrun 走 ApiMock，有官方端点走远端。 */
  api: IClientPublicApi;
  resolveRequestContext: () => RequestContext | Promise<RequestContext>;
}): IClientConfigService {
  const entries = new Map<string, CacheEntry>();

  return {
    async getSnapshot(options = {}) {
      const { forceRefresh } = clientConfigReadOptionsSchema.parse(options);
      const context = await dependencies.resolveRequestContext();
      const origin = buildKayingCodeEndpointUrls(context.endpointOrigin).origin;
      // 缓存 key 跟端点走：设置里改 endpoint 后不能命中旧地址的快照。
      const key = origin || "local";
      const entry = entries.get(key) ?? { expiresAt: 0 };
      entries.set(key, entry);
      if (!forceRefresh && entry.snapshot && entry.expiresAt > Date.now()) {
        return structuredClone(entry.snapshot);
      }
      if (!entry.pending) {
        const call: ClientPublicApiCallOptions = {
          appVersion: context.appVersion,
          platform: context.platform,
        };
        entry.pending = dependencies.api
          .getClientConfigs(call)
          .then((snapshot) => {
            const value: ClientConfigSnapshot = {
              pluginStoreOrder: snapshot.pluginStoreOrder,
              zsrcUrl: null,
              uiPluginRecommendations: [],
            };
            entry.snapshot = value;
            entry.expiresAt = Date.now() + CACHE_TTL_MS;
            return value;
          })
          .finally(() => {
            entry.pending = undefined;
          });
      }
      return structuredClone(await entry.pending);
    },
  };
}
