import { AppUsagePanel } from "@/settings/usage-stats/AppUsagePanel.js";

export type UsageStatsSectionTab = "app";

/** KayingCode.localrun：仅本地 App Usage；无 Coding Plan / 套餐用量面板。 */
export function UsageStatsSection(_props: {
  activeTab: UsageStatsSectionTab;
  providerSourcesLoading?: boolean;
  workspaceIdentity?: string;
  workspacePath?: string;
  selectedCodingPlanSource?: null;
}) {
  return <AppUsagePanel />;
}
