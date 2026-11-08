import { useMemo } from "react";

/**
 * KayingCode.localrun：无账号权益。保留 hook 形状，恒返回空 entitlement。
 */
export interface UsageEntitlementRefreshOptions {
  silent?: boolean;
  force?: boolean;
  reason?: string;
}

export interface UsageEntitlementState {
  snapshot: null;
  loading: boolean;
  error: null;
}

export function useUsageEntitlement(_options?: Record<string, unknown>): UsageEntitlementState & {
  refresh: (options?: UsageEntitlementRefreshOptions) => Promise<void>;
} {
  const state = useMemo(
    () => ({ snapshot: null, loading: false, error: null }),
    [],
  );
  return {
    ...state,
    refresh: async () => {},
  };
}
