import type { Event } from "@zcode/rpc";
import type { KayingCodeTaskMeta } from "@zcode/shared";
import type { WindowHostTaskAddress } from "@zcode/shared/kayingcode-protocol-v4";
import type {
  IServiceAccessor,
  ISourceServerManagementService,
  ITaskGroupService,
  IProjectService,
  IRemoteProjectService,
  IWindowControllerService,
  WindowProjectDirectoryServices,
} from "@zcode/services";

/**
 * KayingCode.localrun 过渡期服务面扩展（WS5 → WS2 交接点）。
 *
 * 上游 `project-sidebar` 读取的项目目录、任务分组、Source Server 管理与窗口目录 bridge 服务
 * 在本地 `packages/services` 已注册（`node.ts` 里 `IProjectService` / `ITaskGroupService` /
 * `IRemoteProjectService` / Source Server 管理），但尚未加入 `IServiceAccessor` 的公开面；
 * `@zcode/services` 归 WS2 所有，本批次不能直接改。
 *
 * 这里用显式的窄接口声明「侧栏期望的 accessor 形态」，由调用点一次性断言，避免在业务代码里
 * 逐个 `as any`。WS2 把字段补进 `IServiceAccessor` 后，删除本文件与调用点的断言即可，
 * 不需要改组件逻辑。运行时字段缺失时组件按可选值降级（不伪造项目树）。
 */
export interface LocalrunWorkspaceServiceSurface {
  readonly projectService?: IProjectService;
  readonly remoteProjectService?: IRemoteProjectService;
  readonly windowProjectDirectory?: WindowProjectDirectoryServices;
  readonly taskGroupService?: ITaskGroupService;
  readonly sourceServerManagementService?: ISourceServerManagementService;
}

/**
 * 上游 `WindowHostTaskUnreadSignal`：窗口级 Controller 只实时发送完成/失败提醒。
 * 本地 services 尚未导出该类型，先按协议字段在 UI 侧声明；WS2 补齐后改为从 `@zcode/services` 导入。
 */
export interface WindowHostTaskUnreadSignal {
  address: WindowHostTaskAddress;
  updatedAt: number;
  status: "completed" | "error";
}

/** 上游窗口 Controller 新增的轻量 meta 读取与未读信号；WS2 补齐后删除。 */
export interface WindowControllerSurface extends IWindowControllerService {
  getTaskMeta(params: { address: WindowHostTaskAddress }): Promise<KayingCodeTaskMeta | null>;
  onDynamicTaskUnreadSignal(): Event<WindowHostTaskUnreadSignal>;
}

/**
 * 本地 `LEGACY_SINGLE_ROOT_PROJECT_PREFIX` 只存在于 `@zcode/services` 内部模块，
 * 未从包根导出；值为旧远端单 root 项目的 ID 前缀，WS2 补齐导出后改为直接 import。
 */
export const LEGACY_SINGLE_ROOT_PROJECT_PREFIX = "legacy-single-root:";

export type LocalrunServiceAccessor = IServiceAccessor & LocalrunWorkspaceServiceSurface;

export function asLocalrunServiceAccessor(services: IServiceAccessor): LocalrunServiceAccessor {
  return services as LocalrunServiceAccessor;
}

export function asWindowControllerSurface(
  controller: IWindowControllerService,
): WindowControllerSurface {
  return controller as WindowControllerSurface;
}
