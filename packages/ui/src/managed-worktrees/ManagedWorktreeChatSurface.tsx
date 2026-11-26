// Shell 主区内的 worktree 创建展示（managed-worktrees/CONTRACT.md §5）。
// 创建记录来自 Provider 的只读快照；查看哪一条是纯 UI 状态，不写 worktree 状态。
import { useMemo, type ReactNode } from "react";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { ManagedWorktreeCreationView } from "./ManagedWorktreeCreationView.js";
import { ManagedWorktreeCreatingRows } from "./ManagedWorktreeCreatingRows.js";
import { useOptionalManagedWorktreeContext } from "./ManagedWorktreeProvider.js";
import { managedWorktreeTestIds } from "./managedWorktreeTestIds.js";

export function ManagedWorktreeChatSurface({ children }: { children: ReactNode }) {
  const { intl } = useKayingCodeIntl();
  const context = useOptionalManagedWorktreeContext();
  const workspacePath = context?.workspacePath;
  // 主区只展示当前 workspace（项目主目录）的创建记录；同项目其他 root 的记录留在管理弹窗。
  const creations = useMemo(
    () => (context?.creations ?? []).filter((item) => item.workspacePath === workspacePath),
    [context?.creations, workspacePath],
  );
  const viewedCreation = context?.viewedCreation ?? null;
  return (
    <>
      {creations.length > 0 ? (
        <div
          data-testid={managedWorktreeTestIds.inProgress}
          className="flex shrink-0 flex-col border-b border-border bg-background px-3 py-1.5"
        >
          <span className="px-2 text-ui-sm text-foreground-subtle">
            {intl.formatMessage({ id: "managedWorktrees.list.inProgress" })}
          </span>
          <ManagedWorktreeCreatingRows
            creations={creations}
            activeCreationId={context?.viewedCreationId ?? null}
            onOpen={(creation) => context?.viewCreation(creation.id)}
          />
        </div>
      ) : null}
      {viewedCreation ? (
        <div className="absolute inset-0 z-10 flex flex-col bg-background">
          <ManagedWorktreeCreationView
            creation={viewedCreation}
            {...(context?.service ? { service: context.service } : {})}
          />
        </div>
      ) : (
        children
      )}
    </>
  );
}
