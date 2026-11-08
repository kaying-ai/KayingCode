/** KayingCode.localrun：无账号套餐，plan identity 恒为 unknown。 */
export type PlanIdentityStatus = "coding_plan" | "start_plan" | "no_plan" | "unknown";

export interface PlanIdentitySnapshot {
  generatedAt: number;
  planStatus: PlanIdentityStatus;
  planProductId: string;
}

export function resolvePlanIdentitySnapshot(input: {
  providerFamilyDomain?: unknown;
  codingPlanEntitlement?: unknown;
  startPlanEntitlement?: unknown;
  now: number;
  entitlementCacheTtlMs?: number;
}): PlanIdentitySnapshot {
  void input.providerFamilyDomain;
  void input.codingPlanEntitlement;
  void input.startPlanEntitlement;
  void input.entitlementCacheTtlMs;
  return {
    generatedAt: input.now,
    planStatus: "unknown",
    planProductId: "",
  };
}
