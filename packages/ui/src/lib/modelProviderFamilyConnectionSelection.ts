import type {
  ProviderFamilyConnectionSelection,
  ProviderFamilyDomain,
} from "@zcode/shared";
import { getModelProviderFamilySpec } from "@zcode/shared";

interface TeamPlanPricingProductLike {
  subscribed?: boolean;
  productId?: string;
  organizationId?: string | null;
  projectId?: string | null;
  apiKeyStatus?: string;
  teamProjects?: Array<{
    organizationId?: string | null;
    projectId?: string | null;
    apiKeyStatus?: string;
  }>;
}

export type ModelProviderFamilyConnectionSelection = ProviderFamilyConnectionSelection;

/** 把当前 Family 连接意图映射为对应的 Built-in Account Provider 身份。 */
export function resolveModelProviderFamilyConnectionProviderId(params: {
  providerFamilyDomain: ProviderFamilyDomain;
  selection: ProviderFamilyConnectionSelection;
}): string {
  const familySpec = getModelProviderFamilySpec(params.providerFamilyDomain);
  switch (params.selection.kind) {
    case "start-plan":
      return familySpec.startPlanProviderId;
    case "individual-coding-plan":
      return familySpec.individualCodingPlanProviderId;
    case "team-coding-plan":
      return familySpec.teamCodingPlanProviderId;
  }
}

export function resolveFirstSubscribedTeamPlanConnectionWithContext(params: {
  teamProducts: readonly TeamPlanPricingProductLike[];
}): Extract<ProviderFamilyConnectionSelection, { kind: "team-coding-plan" }> | null {
  for (const product of params.teamProducts) {
    if (product.subscribed !== true) continue;
    const projectContexts =
      product.teamProjects && product.teamProjects.length > 0
        ? product.teamProjects
        : [
            {
              organizationId: product.organizationId ?? "",
              projectId: product.projectId ?? "",
              apiKeyStatus: product.apiKeyStatus,
            },
          ];
    for (const projectContext of projectContexts) {
      if (projectContext.apiKeyStatus === "unavailable") continue;
      const organizationId = projectContext.organizationId?.trim() ?? "";
      const projectId = projectContext.projectId?.trim() ?? "";
      if (!organizationId || !projectId) continue;
      return {
        kind: "team-coding-plan",
        productId: product.productId ?? "current",
        organizationId,
        projectId,
      };
    }
  }
  return null;
}

/**
 * KayingCode.localrun 没有套餐权益，不存在可自动选择的连接方式。
 * 保留签名以兼容 OAuth 登录后的连接刷新调用。
 */
export function resolveAutomaticModelProviderFamilyConnectionSelection(_params: {
  providerFamilyDomain: ProviderFamilyDomain;
  codingPlanEntitlement: unknown;
  startPlanEntitlement: unknown;
  teamProducts?: readonly TeamPlanPricingProductLike[];
  /** 首次登录可落到购买入口；修复已有连接时只能选确认可用的套餐。 */
  allowPurchaseEntry?: boolean;
  /** 当前 Account View 的统一判定优先于旧余额快照，尤其区分待生效与可用。 */
  codingPlanAvailable?: boolean;
  startPlanAvailable?: boolean;
}): ModelProviderFamilyConnectionSelection | null {
  return null;
}
