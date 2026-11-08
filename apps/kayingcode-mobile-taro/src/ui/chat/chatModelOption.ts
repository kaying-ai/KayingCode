import type {
  MobileModelCatalog,
  SessionConfigState,
  WorkspaceConfigOption,
} from "@zcode/shared/kayingcode-protocol-v4";

/** 当前模型选择值（provider/model）；provider 缺失时退回 model。 */
export function currentModelValue(config: SessionConfigState | null): string {
  if (!config) return "";
  return config.provider ? `${config.provider}/${config.model}` : config.model;
}

/** 移动只读模型目录优先；缺省时用 workspace model 项。 */
export function buildModelOption(
  catalog: MobileModelCatalog | null,
  workspaceModel: WorkspaceConfigOption | null,
  config: SessionConfigState | null,
): WorkspaceConfigOption | null {
  if (!catalog) return workspaceModel;
  const preferred = catalog.preferredSelection;
  const options = catalog.providers.flatMap((provider) =>
    provider.models.map((model) => ({
      value: `${provider.providerId}/${model.modelId}`,
      name: model.modelId,
      modelProviderId: provider.providerId,
      modelProviderName: provider.providerName,
      modelThoughtLevels: [...model.reasoningLevels],
    })),
  );
  const preferredValue = preferred ? `${preferred.providerId}/${preferred.modelId}` : "";
  const current = currentModelValue(config);
  const currentValue = options.some((option) => option.value === current)
    ? current
    : preferredValue && options.some((option) => option.value === preferredValue)
      ? preferredValue
      : (options[0]?.value ?? "");
  return { id: "model", name: "模型", type: "select", currentValue, options };
}
