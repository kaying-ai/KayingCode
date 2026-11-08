import {
  BUILTIN_MODEL_PROVIDER_IDS,
  resolveModelProviderFamilyIdByProviderId,
} from "@zcode/shared";
import type { IntlInstance } from "@/i18n/IntlProvider.js";
import type { ModelSelectGroup } from "@/ModelConfigSelect.js";

interface V4ModelTriggerDisplay {
  fullLabel: string;
  modelLabel: string;
  providerPrefix?: string;
}

export function formatModelChangeLabel(
  providerId: string | undefined,
  providerName: string | undefined,
  modelName: string,
  intl: Pick<IntlInstance, "formatMessage">,
): string {
  let planLabelId: string;
  // 切换记录必须保留当时的套餐身份，不能从当前连接或可用模型目录反推历史套餐。
  switch (providerId) {
    case BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan:
    case BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan:
      planLabelId = "settings.modelProvider.connectionMode.apiKey";
      break;
    case BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan:
    case BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan:
      planLabelId = "settings.modelProvider.connectionMode.apiKey";
      break;
    case BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan:
    case BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan:
      planLabelId = "settings.modelProvider.connectionMode.teamPlan";
      break;
    default:
      return formatProviderModelLabel(providerId, providerName, modelName);
  }
  return `${modelName}(${intl.formatMessage({ id: planLabelId })})`;
}

/**
 * 解析模型文案里的 provider 名。
 *
 * - Z.ai / BigModel 的内置连接名属于产品固定入口，拼进模型文案会重复展示
 *   “Coding Plan”等连接信息；切换提示额外通过 formatModelChangeLabel 标明套餐类型。
 * - 目录未给出 providerName 时回落到模型菜单的分组标签，保证触发器、菜单和
 *   定时任务侧展示同一个名字；分组标签退化成 providerId 时按“没查到”处理。
 */
function resolveModelProviderLabel({
  providerId,
  providerName,
  groupLabel,
}: {
  providerId: string | undefined;
  providerName?: string;
  groupLabel?: string;
}): string | null {
  if (providerId && resolveModelProviderFamilyIdByProviderId(providerId)) {
    return null;
  }

  const resolvedLabel = providerName?.trim() || groupLabel?.trim();
  if (!resolvedLabel) {
    return null;
  }
  if (providerId && resolvedLabel === providerId) {
    return null;
  }

  return resolvedLabel;
}

export function formatProviderModelLabel(
  providerId: string | undefined,
  providerName: string | undefined,
  modelName: string,
  groupLabel?: string,
): string {
  const providerLabel = resolveModelProviderLabel({ providerId, providerName, groupLabel });
  return providerLabel ? `${providerLabel}/${modelName}` : modelName;
}

export function resolveV4ModelTriggerLabel({
  modelGroups,
  normalizedValue,
  fallbackLabel,
  providerId,
  providerName,
}: {
  modelGroups: readonly ModelSelectGroup[];
  normalizedValue: string;
  fallbackLabel: string;
  providerId: string | undefined;
  providerName?: string;
}): string {
  const selectedGroup = modelGroups.find((group) =>
    group.items.some((item) => item.value === normalizedValue),
  );
  const selectedItem = selectedGroup?.items.find((item) => item.value === normalizedValue);
  if (!selectedGroup || !selectedItem) {
    return fallbackLabel;
  }

  return formatProviderModelLabel(providerId, providerName, selectedItem.name, selectedGroup.label);
}

export function resolveV4ModelTriggerDisplay({
  modelGroups,
  normalizedValue,
  fallbackLabel,
  providerId,
  providerName,
}: {
  modelGroups: readonly ModelSelectGroup[];
  normalizedValue: string;
  fallbackLabel: string;
  providerId: string | undefined;
  providerName?: string;
}): V4ModelTriggerDisplay {
  // 把 provider/model 预先拼成单一字符串后，响应式布局只能整段隐藏或依赖
  // 平台 JS 分支裁剪；这里保留结构化前缀，让 composer 容器断点统一决定可见密度。
  const fullLabel = resolveV4ModelTriggerLabel({
    modelGroups,
    normalizedValue,
    fallbackLabel,
    providerId,
    providerName,
  });
  const selectedGroup = modelGroups.find((group) =>
    group.items.some((item) => item.value === normalizedValue),
  );
  const selectedItem = selectedGroup?.items.find((item) => item.value === normalizedValue);
  if (!selectedGroup || !selectedItem) {
    return { fullLabel, modelLabel: fallbackLabel };
  }

  const modelLabel = selectedItem.name;
  const providerLabel = resolveModelProviderLabel({
    providerId,
    providerName,
    groupLabel: selectedGroup.label,
  });
  if (!providerLabel) {
    return { fullLabel, modelLabel };
  }

  return {
    fullLabel,
    providerPrefix: `${providerLabel}/`,
    modelLabel,
  };
}
