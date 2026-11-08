import type {
  ClientPublicApiCallOptions,
  ClientScenesResponse,
  IClientPublicApi,
} from "@zcode/shared";
import type { IClientScenesService } from "./clientScenes.js";

export type {
  ClientSceneConfig,
  ClientSceneItem,
  ClientSceneOption,
  ClientScenesResponseBody,
  ClientScenesResponse,
} from "@zcode/shared";

export function createClientScenesService(dependencies: {
  /** 公开 Client API；localrun 走 ApiMock 返回空列表。 */
  api: IClientPublicApi;
  resolveCallOptions?: () => ClientPublicApiCallOptions | Promise<ClientPublicApiCallOptions>;
}): IClientScenesService {
  return {
    list: async (): Promise<ClientScenesResponse> => {
      const call = await dependencies.resolveCallOptions?.();
      return dependencies.api.getClientScenes(
        call ?? {
          // 无上下文时用空版本号；服务端未配置平台分流时可省略。
          appVersion: "",
        },
      );
    },
  };
}
