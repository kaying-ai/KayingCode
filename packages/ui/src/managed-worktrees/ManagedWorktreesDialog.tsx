// 项目 worktree 管理弹窗（managed-worktrees/CONTRACT.md §4、§5）。
// 列表由宿主（ManagedWorktreeProvider）从 Host 读取；这里只发出删除/清理命令，成功后重新读取，
// 不在 UI 侧删行或推算结果。
import { useEffect, useState } from "react";
import { FolderGit2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Spinner } from "@/components/ui/spinner.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import type {
  IManagedWorktreeService,
  ManagedWorktreeCreation,
  ManagedWorktreeEntry,
  ManagedWorktreeGroup,
  ManagedWorktreeTaskRef,
} from "./contract.js";
import { describeRemovalFailure, type RemovalFailureDescription } from "./managedWorktreeErrors.js";
import { managedWorktreeTestIds } from "./managedWorktreeTestIds.js";
import { ManagedWorktreeCreatingRows } from "./ManagedWorktreeCreatingRows.js";
import { ManagedWorktreeRow, worktreeName } from "./ManagedWorktreeRow.js";

export interface ManagedWorktreesDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  projectId: string;
  projectName?: string;
  service: IManagedWorktreeService | undefined;
  groups: ManagedWorktreeGroup[] | null;
  loading: boolean;
  loadError: string | null;
  /** 重新读取列表；删除/清理成功后调用。 */
  onReload(): void | Promise<void>;
  creations?: readonly ManagedWorktreeCreation[];
  activeCreationId?: string | null;
  onOpenCreation?(creation: ManagedWorktreeCreation): void;
  onOpenTask?(task: ManagedWorktreeTaskRef): void;
}

export function ManagedWorktreesDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  service,
  groups,
  loading,
  loadError,
  onReload,
  creations = [],
  activeCreationId,
  onOpenCreation,
  onOpenTask,
}: ManagedWorktreesDialogProps) {
  const { intl } = useKayingCodeIntl();
  const msg = (id: string, values?: Record<string, string>) =>
    intl.formatMessage({ id: `managedWorktrees.dialog.${id}` }, values);
  const [confirming, setConfirming] = useState<ManagedWorktreeEntry | null>(null);
  const [removing, setRemoving] = useState(false);
  const [pruningRoot, setPruningRoot] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, RemovalFailureDescription>>({});
  const busy = removing || pruningRoot !== null;
  const visibleGroups = (groups ?? []).filter((group) => group.worktrees.length > 0);

  // 关闭弹窗时清理确认态与行错误，避免下次打开沿用上一次的行。
  useEffect(() => {
    if (!open) {
      setConfirming(null);
      setRowErrors({});
    }
  }, [open]);

  const setRowError = (path: string, value: RemovalFailureDescription | null) =>
    setRowErrors((previous) => {
      const next = { ...previous };
      if (value) next[path] = value;
      else delete next[path];
      return next;
    });

  const confirmRemove = async () => {
    const target = confirming;
    if (!target || removing || !service) return;
    setRemoving(true);
    setRowError(target.path, null);
    try {
      // 只有没有任务使用的残留 worktree 才允许丢弃改动；Host 会再次校验。
      const force = target.dirty === true && target.tasks.length === 0;
      const result = await service.removeWorktree({
        projectId,
        path: target.path,
        ...(force ? { force: true } : {}),
      });
      if (result.ok) {
        logger.info("[managed-worktree] 已删除 worktree", { path: target.path });
        await onReload();
      } else {
        logger.warn("[managed-worktree] 删除 worktree 被拒绝", {
          path: target.path,
          code: result.error.code,
          detail: result.error.detail,
        });
        setRowError(target.path, describeRemovalFailure(intl, result.error));
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      logger.warn("[managed-worktree] 删除 worktree 失败", { path: target.path, error: detail });
      setRowError(target.path, { message: msg("error.generic"), detail });
    } finally {
      setRemoving(false);
      setConfirming(null);
    }
  };

  const prune = async (worktree: ManagedWorktreeEntry) => {
    if (busy || !service) return;
    setPruningRoot(worktree.sourceRoot);
    setRowError(worktree.path, null);
    try {
      await service.pruneWorktrees({ projectId, sourceRoot: worktree.sourceRoot });
      logger.info("[managed-worktree] 已清理缺失 worktree 记录", {
        sourceRoot: worktree.sourceRoot,
      });
      await onReload();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      logger.warn("[managed-worktree] 清理 worktree 记录失败", {
        sourceRoot: worktree.sourceRoot,
        error: detail,
      });
      setRowError(worktree.path, { message: msg("pruneFailed"), detail });
    } finally {
      setPruningRoot(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid={managedWorktreeTestIds.dialog}
        className="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl"
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{msg("title")}</DialogTitle>
          <DialogDescription className="break-words">
            {projectName ? msg("description", { project: projectName }) : msg("title")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {creations.length > 0 ? (
            <section
              data-testid={managedWorktreeTestIds.inProgress}
              className="flex min-w-0 flex-col gap-1.5"
            >
              <h3 className="text-ui-sm font-normal text-foreground-subtle">
                {intl.formatMessage({ id: "managedWorktrees.list.inProgress" })}
              </h3>
              <ManagedWorktreeCreatingRows
                creations={creations}
                activeCreationId={activeCreationId}
                onOpen={(creation) => onOpenCreation?.(creation)}
                className="rounded-xl border border-border bg-surface px-1 py-1"
              />
            </section>
          ) : null}
          {loadError ? (
            <div
              role="alert"
              data-testid={managedWorktreeTestIds.dialogError}
              className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 sm:flex-row sm:items-start"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-ui-base text-destructive">{msg("loadFailed")}</span>
                <span className="break-all font-mono text-ui-sm text-foreground-subtle">
                  {loadError}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 self-start rounded-lg"
                disabled={loading}
                onClick={() => void onReload()}
              >
                {intl.formatMessage({ id: "common.retry" })}
              </Button>
            </div>
          ) : null}
          {groups === null && loading ? (
            <div className="flex items-center gap-2 py-6 text-ui-base text-foreground-subtle">
              <Spinner />
              {intl.formatMessage({ id: "common.loading" })}
            </div>
          ) : null}
          {groups !== null && visibleGroups.length === 0 ? (
            <p
              data-testid={managedWorktreeTestIds.dialogEmpty}
              className="py-6 text-center text-ui-base text-foreground-subtle"
            >
              {msg("empty")}
            </p>
          ) : null}
          {visibleGroups.map((group) => (
            <section
              key={group.sourceRoot}
              data-testid={managedWorktreeTestIds.group}
              className="flex min-w-0 flex-col gap-1.5"
            >
              <h3 className="flex min-w-0 items-center gap-1.5 break-all font-mono text-ui-sm font-normal text-foreground-subtle">
                <FolderGit2 className="size-3.5 shrink-0" aria-hidden="true" />
                {group.sourceRoot}
              </h3>
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                {group.worktrees.map((worktree) => (
                  <ManagedWorktreeRow
                    key={worktree.path}
                    worktree={worktree}
                    error={rowErrors[worktree.path]}
                    pruning={pruningRoot === worktree.sourceRoot}
                    busy={busy}
                    onOpenTask={onOpenTask}
                    onDelete={() => setConfirming(worktree)}
                    onPrune={() => void prune(worktree)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
      <AlertDialog
        open={Boolean(confirming)}
        onOpenChange={(next) => {
          // 删除进行中不允许关闭确认框，避免结果回写到已离开的上下文。
          if (!next && !removing) setConfirming(null);
        }}
      >
        <AlertDialogContent data-testid={managedWorktreeTestIds.deleteConfirm}>
          {confirming ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="break-words">
                  {msg("confirm.title", { name: worktreeName(intl, confirming) })}
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>{msg("confirm.directory")}</li>
                    <li>{msg("confirm.ignored")}</li>
                    {confirming.dirty && confirming.tasks.length === 0 ? (
                      <li className="text-destructive">{msg("confirm.discardChanges")}</li>
                    ) : null}
                    <li>{msg("confirm.tasks")}</li>
                  </ul>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <p className="break-all font-mono text-ui-sm text-foreground-subtle">
                {confirming.path}
              </p>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={removing}>
                  {intl.formatMessage({ id: "common.cancel" })}
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  data-testid={managedWorktreeTestIds.deleteConfirmAction}
                  disabled={removing}
                  onClick={(event) => {
                    // Action 默认点击即关闭；需要等删除结果，由 confirmRemove 结束后关闭。
                    event.preventDefault();
                    void confirmRemove();
                  }}
                >
                  {removing ? <Spinner className="size-3.5" /> : null}
                  {intl.formatMessage({ id: "common.delete" })}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
