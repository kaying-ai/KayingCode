import { ServiceChannels, type ClientScenesResponse } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

// 场景数据结构归 public-api 契约；这里只保留服务描述符与兼容 re-export。
export type {
  ClientSceneConfig,
  ClientSceneItem,
  ClientSceneOption,
  ClientScenesResponseBody,
  ClientScenesResponse,
} from "@zcode/shared";
/** 兼容旧导出名（历史为单数 Scene）。 */
export type { ClientScenesResponseBody as ClientSceneResponseBody } from "@zcode/shared";

export interface IClientScenesService {
  list(): Promise<ClientScenesResponse>;
}

export const IClientScenesService = createServiceDescriptor<IClientScenesService>(
  ServiceChannels.ClientScenes,
);
