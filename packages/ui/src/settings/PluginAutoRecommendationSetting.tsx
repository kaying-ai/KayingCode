import { useState } from "react";
import { Switch } from "@/components/ui/switch.js";
import { toast } from "@/components/ui/toast.js";
import { useSettings } from "@/hooks/useSettingService.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import { SettingsRow } from "@/settings/SettingsPageParts.js";

/**
 * 插件自动推荐开关：默认关闭。开启只授权 Host 为下一条输入注入插件发现工具面，
 * 安装动作仍由对话内 pluginInstall 确认卡片决定。
 */
export function PluginAutoRecommendationSetting() {
  const { intl } = useKayingCodeIntl();
  const { settings, loading, update } = useSettings();
  const [saving, setSaving] = useState(false);
  const label = intl.formatMessage({ id: "settings.pluginAutoRecommendation" });
  const save = async (enabled: boolean) => {
    setSaving(true);
    try {
      await update({ pluginAutoRecommendationEnabled: enabled });
    } catch (error) {
      logger.warn("[settings] 保存插件自动推荐失败", { error: String(error) });
      toast(intl.formatMessage({ id: "settings.pluginAutoRecommendationSaveError" }));
    } finally {
      setSaving(false);
    }
  };
  return (
    <SettingsRow
      controlLayout="wide"
      label={label}
      description={intl.formatMessage({ id: "settings.pluginAutoRecommendationDescription" })}
      control={
        <Switch
          data-testid="settings-plugin-auto-recommendation"
          aria-label={label}
          checked={settings?.pluginAutoRecommendationEnabled === true}
          disabled={loading || saving || !settings}
          onCheckedChange={(enabled) => void save(enabled)}
        />
      }
    />
  );
}
