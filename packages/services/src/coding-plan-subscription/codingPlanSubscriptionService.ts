import type {
  KayingCodeModelContextBudgetStrategy,
  ForceUpdateConfig,
  DynamicWorkflowClientConfig,
} from "@zcode/shared";
import type { ICodingPlanSubscriptionService } from "./codingPlanSubscription.js";

/**
 * KayingCode.localrun：无订阅/支付/套餐。
 * 只保留灰度与本地开关，不访问官方计费 API。
 */
export function createCodingPlanSubscriptionService(
  dependencies: Record<string, unknown> = {},
): ICodingPlanSubscriptionService {
  void dependencies;
  return {
    // 闲时任务灰度：本地默认关闭。
    getOffPeakClientConfig: async () =>
      ({ enabled: false, modelSelectionView: {} as never }) as never,
    getDynamicWorkflowClientConfig: async () =>
      ({ mode: "disabled" }) as unknown as DynamicWorkflowClientConfig,
    getModelContextBudgetStrategy: async () =>
      "preflight-v1" as unknown as KayingCodeModelContextBudgetStrategy,
    getForceUpdateConfig: async () => null as ForceUpdateConfig | null,
  };
}
