/**
 * KayingCode.localrun：无账号 Coding Plan 可用性探测。
 * 类型形状与调用方保持一致；校验恒为「未连接」。
 */
export type CodingPlanUnavailableReason =
  | "coding_plan_not_authenticated"
  | "coding_plan_not_connected"
  | "coding_plan_auth_failed"
  | "coding_plan_not_entitled";

export type CodingPlanAvailabilityResult =
  | { kind: "available"; models?: unknown; effectiveAt?: number }
  | { kind: "unavailable"; reason: CodingPlanUnavailableReason; models?: unknown; effectiveAt?: number }
  | { kind: "unknown"; models?: unknown; effectiveAt?: number };

export interface CodingPlanAvailabilityProvider {
  readonly providerId: string;
  readonly family: "bigmodel" | "zai";
  readonly planKind?: string;
  readonly apiKey?: string | null;
}

export interface CodingPlanAvailabilityContext {
  readonly apiClient?: unknown;
  readonly credentialService?: unknown;
  readonly providerFamilyConnectionSelections?: unknown;
}

function toUnavailableMap(
  providers: readonly CodingPlanAvailabilityProvider[],
): Partial<Record<string, CodingPlanAvailabilityResult>> {
  const result: Partial<Record<string, CodingPlanAvailabilityResult>> = {};
  for (const provider of providers) {
    result[provider.providerId] = {
      kind: "unavailable",
      reason: "coding_plan_not_connected",
    };
  }
  return result;
}

export async function validateBigModelAccountProviderAvailability(
  providers: readonly CodingPlanAvailabilityProvider[],
  context?: CodingPlanAvailabilityContext,
): Promise<Partial<Record<string, CodingPlanAvailabilityResult>>> {
  void context;
  return toUnavailableMap(providers);
}

export async function validateZaiAccountProviderAvailability(
  providers: readonly CodingPlanAvailabilityProvider[],
  context?: CodingPlanAvailabilityContext,
): Promise<Partial<Record<string, CodingPlanAvailabilityResult>>> {
  void context;
  return toUnavailableMap(providers);
}
