import type {
  AppUsageRequest,
  AppUsageSnapshot,
  UsageStatsRequest,
  UsageStatsSnapshot,
} from "@zcode/shared";
import type { IKayingCodeAgentService } from "../kayingcode-agent/kayingcodeAgent.js";
import type { IUsageStatsService } from "./usageStats.js";

/**
 * KayingCode.localrun：无账号 / 无订阅 / 无官方额度。
 * 仅保留 agent 数据库本地用量（App Usage）。
 */
interface UsageStatsServiceDependencies {
  /** App Usage 经 KayingCode Protocol 读取 agent 数据库真实统计。 */
  kayingcodeAgentService: Pick<IKayingCodeAgentService, "getAppUsageStats">;
}

function emptyUsageStatsSnapshot(request: UsageStatsRequest): UsageStatsSnapshot {
  return {
    range: request.range,
    generatedAt: Date.now(),
    timeZone: request.timeZone ?? "UTC",
    estimatedTokenCharDivisor: 4,
    summary: {
      totalSessions: 0,
      totalMessages: 0,
      totalCharacters: 0,
      totalEstimatedTokens: 0,
      activeDays: 0,
      mostActiveDay: null,
      favoriteModel: null,
      longestSessionMs: 0,
      longestStreakDays: 0,
      currentStreakDays: 0,
      firstActivityDate: null,
      lastActivityDate: null,
      peakHour: null,
    },
    daily: [],
    heatmap: {
      startDate: null,
      endDate: null,
      maxActivityScore: 0,
      weeks: [],
      monthLabels: [],
    },
    models: [],
  };
}

export function createUsageStatsService(
  dependencies: UsageStatsServiceDependencies,
): IUsageStatsService {
  return {
    async getAppUsageSnapshot(request: AppUsageRequest): Promise<AppUsageSnapshot> {
      return dependencies.kayingcodeAgentService.getAppUsageStats({
        range: request.range,
        timeZone: request.timeZone,
      });
    },
    async getSnapshot(request: UsageStatsRequest): Promise<UsageStatsSnapshot> {
      // Coding Plan monitor 链路已移除；本地用量走 getAppUsageSnapshot。
      return emptyUsageStatsSnapshot(request);
    },
  };
}
