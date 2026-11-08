import { useCallback } from "react";
import {
  normalizeProviderFamilyDomain,
  resolvePlanIdentitySnapshot,
  type PlanIdentitySnapshot,
  type ProviderFamilyConnectionSelection,
  type ProviderFamilyDomain,
} from "@zcode/shared";
import type { IUsageStatsService } from "@zcode/services";

/**
 * KayingCode.localrun 没有订阅 / Coding Plan / Start Plan。
 * plan identity 恒为 unknown/no_plan，不再查询任何套餐权益。
 */
export function usePlanIdentitySnapshot(
  providerFamilyDomain: ProviderFamilyDomain | null | undefined,
  _connectionSelection: ProviderFamilyConnectionSelection | null | undefined,
  _usageStatsService?: IUsageStatsService,
): () => PlanIdentitySnapshot {
  const normalizedDomain = normalizeProviderFamilyDomain(providerFamilyDomain);

  return useCallback(
    () =>
      resolvePlanIdentitySnapshot({
        providerFamilyDomain: normalizedDomain,
        codingPlanEntitlement: null,
        startPlanEntitlement: null,
        now: Date.now(),
        entitlementCacheTtlMs: 60_000,
      }),
    [normalizedDomain],
  );
}
