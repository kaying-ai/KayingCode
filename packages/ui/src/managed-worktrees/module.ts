/**
 * ui-managed-worktrees 模块清单。
 * 层：ui；`packages/ui` 在 architecture-policy.yaml 中整体为 managed: false，本清单只描述边界，
 * 尚未登记为 managed 模块。模块只读 services 的 worktree 契约，不写 worktree 状态。
 */
export const uiManagedWorktreesModule = {
  id: "ui-managed-worktrees",
  requires: ["ui", "shared", "services"],
  provides: ["ui-managed-worktrees"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
