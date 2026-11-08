import type { ApiClient } from "../api.js";
import type {
  ClientConfigsSnapshot,
  ClientFeatureFlagConfig,
  ClientScenesResponse,
  ForceUpdateConfig,
  HelpAppConfig,
  PluginStoreOrder,
} from "./contracts.js";

export interface ClientPublicApiCallOptions {
  signal?: AbortSignal;
  appVersion: string;
  /** 服务端按平台分流；Web 端可省略。 */
  platform?: string;
}

/**
 * 公开 Client API 端口。
 * - 本地/localrun 走 ApiMock，返回内置缺省，不发起网络请求；
 * - 有官方端点时走远端实现；未来补充新接口时在本接口增加方法，两侧同步实现即可。
 */
export interface IClientPublicApi {
  /** GET /api/v1/client/configs —— 公开客户端配置（插件排序 / 帮助 / 灰度 / 强更等）。 */
  getClientConfigs(options: ClientPublicApiCallOptions): Promise<ClientConfigsSnapshot>;
  /** GET /api/v1/client/scenes —— 推荐场景目录。 */
  getClientScenes(options: ClientPublicApiCallOptions): Promise<ClientScenesResponse>;
}

export type ClientPublicApiRequest = ApiClient["request"];

export type {
  ClientConfigsSnapshot,
  ClientFeatureFlagConfig,
  ClientScenesResponse,
  ForceUpdateConfig,
  HelpAppConfig,
  PluginStoreOrder,
};
