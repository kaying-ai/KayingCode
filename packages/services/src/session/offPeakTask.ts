import type {
  OffPeakTaskCreateResult,
  OffPeakTakeNumberAvailability,
  KayingCodeOffPeakTask,
  KayingCodeOffPeakTaskCreateParams,
  ModelSelection,
} from "@zcode/shared";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

// 闲时任务管理服务通道（与 automation 服务面互不复用）。
// renderer 经 ProxyChannel 直连（codingPlanSubscription 同款范式）；
// 轮询/取号/核销由服务内部驱动，不暴露给 renderer。

export interface OffPeakUpdateTaskParams {
  title?: string;
  prompt?: string;
  permissionMode?: string;
  /** undefined=不改；Off-Peak Submission 不允许清空为跟随默认。 */
  modelSelection?: ModelSelection | null;
}

export interface IOffPeakTaskService {
  /** 服务端取号额度即时快照；仅控制新建入口，POST /ticket 仍是最终准入权威。 */
  getTakeNumberAvailability(): Promise<OffPeakTakeNumberAvailability>;
  /** 创建即取号（成功才落库）；失败返回稳定分类，不跨 RPC 传 raw error。 */
  createTask(params: KayingCodeOffPeakTaskCreateParams): Promise<OffPeakTaskCreateResult>;
  cancelTask(offPeakTaskId: string): Promise<KayingCodeOffPeakTask | null>;
  pauseTask(offPeakTaskId: string): Promise<KayingCodeOffPeakTask | null>;
  continueTask(offPeakTaskId: string): Promise<KayingCodeOffPeakTask | null>;
  deleteTask(offPeakTaskId: string): Promise<void>;
  /** 仅隐藏本地 History 行；不删除 task/session/执行字段。 */
  deleteHistory(offPeakTaskId: string): Promise<KayingCodeOffPeakTask | null>;
  updateTask(
    offPeakTaskId: string,
    params: OffPeakUpdateTaskParams,
  ): Promise<KayingCodeOffPeakTask | null>;
  list(): Promise<KayingCodeOffPeakTask[]>;
  get(offPeakTaskId: string): Promise<KayingCodeOffPeakTask | null>;
}

export const IOffPeakTaskService = createServiceDescriptor<IOffPeakTaskService>(
  ServiceChannels.OffPeakTask,
);
