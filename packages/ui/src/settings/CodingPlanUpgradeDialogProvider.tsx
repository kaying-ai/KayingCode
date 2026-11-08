import { createContext, useContext, useMemo, type ReactNode } from "react";
import { LOCALRUN_FEATURES } from "@zcode/shared";

/**
 * KayingCode.localrun 的 Coding Plan 升级入口 stub。
 *
 * 产品边界（PRODUCT_BOUNDARY.md §1）：无官方订阅 / Coding Plan，不得接回官方购买链路。
 * 上游 `ProjectSidebar` 等组件仍通过 `useCodingPlanUpgradeDialog` 读取入口，因此这里保留同名
 * 契约，但默认关闭时不提供任何购买面板，只返回 false，不发起网络请求、不打开 webview。
 * 需要重新启用时必须单独立项并更新 PRODUCT_BOUNDARY.md，而不是在这里打开开关。
 */
export interface CodingPlanUpgradeDialogTarget {
  providerId: string;
  funnelContext?: unknown;
}

export interface CodingPlanUpgradeDialogContextValue {
  openCodingPlanUpgrade: (
    target: CodingPlanUpgradeDialogTarget,
    observation?: { signal?: AbortSignal; onResult?: (opened: boolean) => void },
  ) => boolean;
}

const disabledValue: CodingPlanUpgradeDialogContextValue = {
  openCodingPlanUpgrade: () => false,
};

const CodingPlanUpgradeDialogContext = createContext<CodingPlanUpgradeDialogContextValue | null>(
  null,
);

export function CodingPlanUpgradeDialogProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => disabledValue, []);
  // 开关关闭时不渲染任何官方购买组件，仅透传 children，保持 Hook 契约稳定。
  if (!LOCALRUN_FEATURES.codingPlan) return <>{children}</>;
  return (
    <CodingPlanUpgradeDialogContext.Provider value={value}>{children}</CodingPlanUpgradeDialogContext.Provider>
  );
}

export function useCodingPlanUpgradeDialog(): CodingPlanUpgradeDialogContextValue {
  return useContext(CodingPlanUpgradeDialogContext) ?? disabledValue;
}

export function useOptionalCodingPlanUpgradeDialog() {
  return useContext(CodingPlanUpgradeDialogContext);
}
