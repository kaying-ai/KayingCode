import type { WorkspaceTabState } from "@/store/tabStore.js";
import type { RemoteTargetSnapshot } from "@zcode/shared";
import type { VirtualProject, RemoteProjectDirectory } from "@zcode/services";
export {
  buildRemoteHostWorkspaceIdentity,
  buildRemoteWorkspaceIdentity,
  remoteTargetSchema,
  parseRemoteWorkspaceIdentity,
} from "@zcode/shared";
export type { IServiceAccessor } from "@zcode/services";
export type { VirtualProject, RemoteProjectDirectory };
/** 配置目录地址不是 tab/session；连接信息只能复用已存在的 attachment。 */
export type ConfigWorkspaceTarget = Pick<
  WorkspaceTabState,
  | "workspacePath"
  | "workspaceIdentity"
  | "label"
  | "remoteSessionId"
  | "localWorkspacePath"
  | "availability"
> & {
  /**
   * 目录 host 的只读快照与 tab 的连接目标都可能出现；消费方只把它交给
   * workspace 解析/展示，不自行拆分 authority。
   */
  remoteTarget?: WorkspaceTabState["remoteTarget"] | RemoteTargetSnapshot;
  hostId?: string;
  configOnline?: boolean;
};
export type {
  ProjectCatalogPort as ConfigCatalogPort,
  ProjectCatalogSnapshot as ConfigCatalogSnapshot,
} from "@zcode/services";
