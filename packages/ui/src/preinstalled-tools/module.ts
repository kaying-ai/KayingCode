/**
 * ui-preinstalled-tools 模块清单。
 * 层：ui；产品当前把 packages/ui 作为 legacy 模块整体管理（architecture-policy.yaml 中 `ui` 为
 * managed: false），本清单只描述边界，尚未登记为 managed 模块；需要登记时按 managed 模块补齐
 * roots / owner，并让检查器校验 requires 与 policy 一致。
 */
export const uiPreinstalledToolsModule = {
  id: "ui-preinstalled-tools",
  requires: ["ui", "shared", "preinstalled-tools-contract"],
  provides: ["ui-preinstalled-tools"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
