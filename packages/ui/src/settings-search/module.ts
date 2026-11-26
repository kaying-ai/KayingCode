/**
 * settings-search 模块清单。
 * 层：ui；产品当前把 packages/ui 作为 legacy 模块整体管理，本清单只描述边界，
 * 尚未登记到 architecture-policy.yaml（需要登记时按 managed 模块补齐 roots / owner）。
 */
export const settingsSearchModule = {
  id: "settings-search",
  requires: ["ui"],
  provides: ["settings-search"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
