// 受管 worktree UI 对服务层与共享类型的唯一入口（packages/ui/src/managed-worktrees/CONTRACT.md）。
// UI 组件与 hook 只能经这里引用服务契约，便于在 services 契约演进时收口改动。
export type {
  IManagedWorktreeService,
  ManagedWorktreeGroup,
  ManagedWorktreeWorkspace,
  StartManagedWorktreeCreationResult,
} from "@zcode/services";
export type {
  ManagedWorktreeCreation,
  ManagedWorktreeCreationKind,
  ManagedWorktreeCreationPhase,
  ManagedWorktreeCreationSettlement,
  ManagedWorktreeEntry,
  ManagedWorktreeError,
  ManagedWorktreeErrorCode,
  ManagedWorktreeStartRefs,
  ManagedWorktreeState,
  ManagedWorktreeTaskRef,
  RemoveManagedWorktreeResult,
} from "@zcode/shared";

/** 删除失败时 UI 展示所需的结构化原因；`code` 保留为 string 以兼容后续新增 code。 */
export interface ManagedWorktreeRemovalFailure {
  code: string;
  detail?: string;
}
