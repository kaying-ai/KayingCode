import type {
} from "@zcode/shared";
import {
  type CodingPlanEntitlementState,
  type CodingPlanStatus,
  type ModelProviderNavGroup,
} from "@/settings/model-provider-section/constants.js";

interface ResolvedCodingPlanEntitlementState {
  statusLabelId?: string;
  status: CodingPlanStatus;
  planLevel: string | null;
  currentProductId: string | null;
  subscriptionBillingCycle: string | null;
  subscriptionRenewTime: string | null;
  subscriptionExpireTime: string | null;
  subscriptionDetails?: unknown[];
  quotaLimits: unknown[];
  /**
   * 官方 Server MCP 额度（服务端下发的总额度）。它不在 quota.limits[] 里，
   * localrun 无套餐权益，恒为空。
   */
  mcpQuotaLimit?: unknown | null;
}

/**
 * KayingCode.localrun 没有 Coding Plan / Start Plan / 企业套餐权益。
 * 权益状态恒为未连接；自定义/预置 Provider 连接项始终可见，不再按套餐过滤。
 */
export function resolveCodingPlanEntitlementState(_input: {
  providerId: string;
  /** 当前账号是否明确拥有该 Provider 对应的产品权益。 */
  accountEntitled: boolean;
  accountAvailability?: import("@zcode/provider").AccountProviderState["availability"];
  accountUnavailableReason?: import("@zcode/provider").AccountProviderState["unavailableReason"];
  entitlement?: CodingPlanEntitlementState;
  modelProvidersLoading: boolean;
}): ResolvedCodingPlanEntitlementState {
  return {
    status: "disconnected",
    planLevel: null,
    currentProductId: null,
    subscriptionBillingCycle: null,
    subscriptionRenewTime: null,
    subscriptionExpireTime: null,
    quotaLimits: [],
  };
}

/**
 * 自定义/预置连接项始终可见；不再按 Coding Plan 权益或企业订阅过滤。
 */
export function buildVisibleFamilyConnectionItems({
  items,
}: {
  items: Array<Extract<ModelProviderNavGroup["items"][number], { type: "codingPlan" }>>;
  codingPlanEntitlements?: Partial<Record<string, CodingPlanEntitlementState>>;
  subscribedTeamProducts?: unknown[];
  showPurchasedTeamPlanFallback?: boolean;
  connectionSelections?: unknown;
  teamPlanSelections?: unknown;
}): ModelProviderNavGroup["items"] {
  return items;
}
