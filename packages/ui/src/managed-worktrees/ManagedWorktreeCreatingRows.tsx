// "正在创建 worktree"的行（managed-worktrees/CONTRACT.md §2、§5）。
// 行集合只来自 Host 的创建记录；点击后由宿主决定如何展示这条记录。
import { LoaderCircle, TriangleAlertIcon } from "lucide-react";
import { memo, useCallback } from "react";
import { cn } from "@/components/lib/utils.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import type { ManagedWorktreeCreation } from "./contract.js";
import { managedWorktreeTestIds } from "./managedWorktreeTestIds.js";

export const ManagedWorktreeCreatingRows = memo(function ManagedWorktreeCreatingRows({
  creations,
  activeCreationId,
  onOpen,
  className,
}: {
  creations: readonly ManagedWorktreeCreation[];
  /** 当前正在主区查看的创建记录；用于选中态。 */
  activeCreationId?: string | null;
  onOpen(creation: ManagedWorktreeCreation): void;
  className?: string;
}) {
  if (creations.length === 0) return null;
  return (
    <div className={cn("flex flex-col", className)}>
      {creations.map((creation) => (
        <CreatingRow
          key={creation.id}
          creation={creation}
          active={activeCreationId === creation.id}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
});

function CreatingRow({
  creation,
  active,
  onOpen,
}: {
  creation: ManagedWorktreeCreation;
  active: boolean;
  onOpen(creation: ManagedWorktreeCreation): void;
}) {
  const { intl } = useKayingCodeIntl();
  const open = useCallback(() => onOpen(creation), [creation, onOpen]);
  const failed = creation.phase === "failed";
  const title =
    creation.promptText?.trim() ||
    intl.formatMessage({ id: "managedWorktrees.creation.forkTitle" });
  return (
    <div className="py-px">
      <button
        type="button"
        data-testid={managedWorktreeTestIds.creatingRow}
        data-phase={creation.phase}
        onClick={open}
        className={cn(
          "flex h-8 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-ui-base",
          active ? "bg-selected" : "hover:bg-surface-hover",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-foreground">{title}</span>
        <span className="flex shrink-0 items-center gap-1 text-ui-sm text-foreground-subtle">
          {failed ? (
            <TriangleAlertIcon className="size-3.5 text-destructive" />
          ) : (
            <LoaderCircle className="size-3.5 animate-spin" />
          )}
          {intl.formatMessage({
            id: failed
              ? "managedWorktrees.creation.failed"
              : "managedWorktrees.creation.sidebarRow",
          })}
        </span>
      </button>
    </div>
  );
}
