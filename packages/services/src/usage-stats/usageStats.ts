import type {
  AppUsageRequest,
  AppUsageSnapshot,
  UsageStatsRequest,
  UsageStatsSnapshot,
} from "@zcode/shared";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

/**
 * KayingCode.localrun：无账号/无订阅/无官方额度。
 * 仅保留 agent 数据库本地用量（App Usage）与本地空用量快照。
 */
export interface IUsageStatsService {
  getAppUsageSnapshot(request: AppUsageRequest): Promise<AppUsageSnapshot>;
  getSnapshot(request: UsageStatsRequest): Promise<UsageStatsSnapshot>;
}

export const IUsageStatsService = createServiceDescriptor<IUsageStatsService>(
  ServiceChannels.UsageStats,
);
