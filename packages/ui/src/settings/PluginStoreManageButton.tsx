import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";

/** 插件市场页头的唯一已安装管理入口；列表卡片继续原位表达安装与启停状态。 */
export function PluginStoreManageButton({ onClick }: { onClick: () => void }) {
  const { intl } = useKayingCodeIntl();
  return (
    <Button
      type="button"
      data-testid="plugin-store-manage-open"
      variant="default"
      onClick={onClick}
    >
      <Settings2 className="size-3.5" aria-hidden="true" />
      {intl.formatMessage({ id: "settings.plugins.store.manageInstalled" })}
    </Button>
  );
}
