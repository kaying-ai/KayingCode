/**
 * selection-comment 模块清单（architecture-governance managed 模块）。
 * 层：ui。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）；
 * 本仓 `packages/ui/src` 目前在策略里为 unmanaged，清单先与代码边界保持一致。
 */
export const selectionCommentModule = {
  id: "selection-comment",
  requires: ["ui"],
  provides: ["selection-comment"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
