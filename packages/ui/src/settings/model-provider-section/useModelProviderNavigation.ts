import { useEffect, useMemo } from "react";
import type { ProviderSettingsFormProvider } from "@/lib/providerSettingsFormTypes.js";
import { getProviderFormLabel } from "@/lib/providerSettingsFormTypes.js";
import type {
  ProviderFamilyConnectionSelection,
  ProviderFamilyDomain,
} from "@zcode/shared";
import { resolveModelProviderFamilySpecByProviderId } from "@zcode/shared";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import {
  type ModelProviderNavGroup,
  type PresetProviderSpec,
} from "@/settings/model-provider-section/constants.js";
import {
  createCustomProviderNodeKey,
  createPresetProviderNodeKey,
} from "@/settings/model-provider-section/utils.js";
import {
  sortModelProvidersForDisplay,
  type ProviderOrderView,
} from "@/lib/modelProviderOrdering.js";

interface PresetProviderWithConfig extends PresetProviderSpec {
  provider: ProviderSettingsFormProvider | null;
}

interface UseModelProviderNavigationOptions {
  presetProviders: PresetProviderWithConfig[];
  modelProviders: ProviderSettingsFormProvider[];
  displayOrder?: ProviderOrderView;
  familyConnectionSettingsFailed?: boolean;
  selectedNodeKey: string | null;
  setSelectedNodeKey: (key: string | null) => void;
  intl: ReturnType<typeof useKayingCodeIntl>["intl"];
}

/**
 * KayingCode.localrun 没有 Coding Plan / Start Plan / 企业套餐导航节点。
 * 仅保留预置与自定义 Provider 导航。
 */
export function useModelProviderNavigation({
  presetProviders,
  modelProviders,
  displayOrder,
  familyConnectionSettingsFailed = false,
  selectedNodeKey,
  setSelectedNodeKey,
  intl,
}: UseModelProviderNavigationOptions) {
  const customProviders = useMemo(() => {
    const allCustomProviders = modelProviders.filter(
      (provider) => provider.config.group === "standard-personal",
    );
    // 这里复用模型菜单的展示排序，确保设置页和聊天框供应商顺序一致。
    return sortModelProvidersForDisplay(allCustomProviders, displayOrder);
  }, [displayOrder, modelProviders]);

  const navigationGroups = useMemo<ModelProviderNavGroup[]>(() => {
    return [
      {
        id: "preset",
        title: intl.formatMessage({ id: "settings.modelProvider.presetTitle" }),
        items: presetProviders.map(({ id, displayName, provider }) => ({
          key: createPresetProviderNodeKey(id),
          type: "preset" as const,
          presetId: id,
          label: displayName,
          logo: modelProviders.find(
            (candidate) =>
              candidate.providerId ===
              resolveModelProviderFamilySpecByProviderId(id)?.individualCodingPlanProviderId,
          )?.config.logo,
          provider,
          displayName,
          statusProvider: provider,
          statusActive: provider?.executable === true,
        })),
      },
      {
        id: "custom",
        title: intl.formatMessage({ id: "settings.modelProvider.customTitle" }),
        items: customProviders.map((provider) => ({
          key: createCustomProviderNodeKey(provider.providerId),
          type: "custom" as const,
          label: getProviderFormLabel(provider),
          provider,
          statusActive: provider.executable === true,
        })),
      },
    ];
  }, [customProviders, intl, presetProviders, modelProviders]);

  const navigationItems = useMemo(
    () => navigationGroups.flatMap((group) => group.items),
    [navigationGroups],
  );

  const navigationItemByKey = useMemo(
    () => new Map(navigationItems.map((item) => [item.key, item])),
    [navigationItems],
  );

  const selectedNavItem = selectedNodeKey
    ? (navigationItemByKey.get(selectedNodeKey) ?? null)
    : null;

  // localrun 无套餐导航节点，历史套餐选择不再视为连接丢失；仅在设置读写失败时提示。
  const navigationUnavailable = familyConnectionSettingsFailed;

  const fallbackNodeKey = navigationItems[0]?.key ?? null;
  useEffect(() => {
    const hasSelectedNode = selectedNodeKey ? navigationItemByKey.has(selectedNodeKey) : false;
    if (hasSelectedNode) {
      return;
    }

    if (selectedNodeKey !== fallbackNodeKey) {
      setSelectedNodeKey(fallbackNodeKey);
    }
  }, [fallbackNodeKey, navigationItemByKey, selectedNodeKey, setSelectedNodeKey]);

  return {
    navigationGroups,
    navigationItems,
    selectedNavItem,
    navigationUnavailable,
  };
}

/**
 * 连接方式选择与导航项的匹配规则。
 * localrun 无 Coding Plan / Start Plan / Team Plan 导航节点，任何套餐选择均不命中。
 */
export function connectionSelectionMatchesNavigationItem(
  _family: ProviderFamilyDomain,
  _selection: ProviderFamilyConnectionSelection,
  _item: ModelProviderNavGroup["items"][number],
): boolean {
  return false;
}
