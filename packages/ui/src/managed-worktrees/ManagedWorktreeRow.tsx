// worktree 管理弹窗中的单行与行内操作（managed-worktrees/CONTRACT.md §4）。
// 行只展示 Host 的 listWorktrees 事实；删除/清理由弹窗发出命令后重新读取。
import { ChevronDown, GitBranch, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import { Spinner } from "@/components/ui/spinner.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { cn } from "@/components/lib/utils.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import type { ManagedWorktreeEntry, ManagedWorktreeTaskRef } from "./contract.js";
import type { RemovalFailureDescription } from "./managedWorktreeErrors.js";
import { managedWorktreeTestIds } from "./managedWorktreeTestIds.js";
import { formatWorktreeLabel, worktreeDirectoryName } from "./worktreeLabel.js";

/** 名称格式固定为 `<仓库名> · <bucket>`；仓库名取源仓库目录名，兼容 Windows 分隔符。 */
export function worktreeName(
  intl: ReturnType<typeof useKayingCodeIntl>["intl"],
  worktree: ManagedWorktreeEntry,
): string {
  return (
    formatWorktreeLabel(intl, worktree.path) ??
    `${worktreeDirectoryName(worktree.sourceRoot)} · ${worktree.bucket}`
  );
}

/** 图标按钮 + 提示。禁用原因用 aria-disabled 表达，保留键盘焦点。 */
function IconAction({
  label,
  disabledReason,
  onClick,
  className,
  children,
  testId,
}: {
  label: string;
  disabledReason?: string;
  onClick(): void;
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  const disabled = Boolean(disabledReason);
  return (
    <ControlHintTooltip title={disabledReason ?? label}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-disabled={disabled || undefined}
        data-testid={testId}
        className={cn(
          "rounded-lg text-foreground-subtle hover:text-foreground",
          className,
          disabled &&
            "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-foreground-subtle",
        )}
        onClick={() => {
          if (!disabled) onClick();
        }}
      >
        {children}
      </Button>
    </ControlHintTooltip>
  );
}

function TaskActions({
  tasks,
  onOpenTask,
}: {
  tasks: readonly ManagedWorktreeTaskRef[];
  onOpenTask?(task: ManagedWorktreeTaskRef): void;
}) {
  const { intl } = useKayingCodeIntl();
  const msg = (id: string) => intl.formatMessage({ id: `managedWorktrees.dialog.${id}` });
  const buttonProps = {
    type: "button" as const,
    variant: "outline" as const,
    size: "sm" as const,
    className: "rounded-lg",
  };
  const [task] = tasks;
  if (!task || !onOpenTask) return null;
  if (tasks.length === 1) {
    return (
      <ControlHintTooltip title={task.title || msg("untitledTask")}>
        <Button
          {...buttonProps}
          data-testid={managedWorktreeTestIds.openTask}
          onClick={() => onOpenTask(task)}
        >
          {msg("openTask")}
        </Button>
      </ControlHintTooltip>
    );
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button {...buttonProps} data-testid={managedWorktreeTestIds.openTask}>
          {msg("openTask")}
          <ChevronDown data-icon="inline-end" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-80">
        {tasks.map((item) => (
          <DropdownMenuItem
            key={`${item.workspaceIdentity ?? ""}:${item.workspacePath}:${item.taskId}`}
            data-testid={managedWorktreeTestIds.taskItem}
            onSelect={() => onOpenTask(item)}
          >
            <span className="min-w-0 flex-1 break-words">{item.title || msg("untitledTask")}</span>
            {item.archived ? (
              <span className="shrink-0 text-ui-sm text-foreground-subtlest">
                {msg("archived")}
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ManagedWorktreeRow({
  worktree,
  error,
  pruning,
  busy,
  onOpenTask,
  onDelete,
  onPrune,
}: {
  worktree: ManagedWorktreeEntry;
  error?: RemovalFailureDescription;
  pruning: boolean;
  busy: boolean;
  onOpenTask?(task: ManagedWorktreeTaskRef): void;
  onDelete(): void;
  onPrune(): void;
}) {
  const { intl } = useKayingCodeIntl();
  const msg = (id: string, values?: Record<string, string>) =>
    intl.formatMessage({ id: `managedWorktrees.dialog.${id}` }, values);
  const missing = worktree.state === "missing";
  const branch = worktree.branchName
    ? worktree.branchName
    : worktree.head
      ? msg("detached", { sha: worktree.head.slice(0, 7) })
      : null;
  return (
    <li
      data-testid={managedWorktreeTestIds.row}
      data-path={worktree.path}
      data-state={worktree.state}
      data-dirty={worktree.dirty === true ? "true" : worktree.dirty === false ? "false" : "unknown"}
      className="flex min-w-0 flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-all text-ui-base font-medium text-foreground">
            {worktreeName(intl, worktree)}
          </span>
          {missing ? (
            <Badge className="h-5 rounded-lg bg-tag px-2 text-ui-xs font-medium text-foreground-subtle">
              {msg("missing")}
            </Badge>
          ) : null}
          {worktree.dirty ? (
            <Badge className="h-5 rounded-lg bg-warning-surface px-2 text-ui-xs font-medium text-warning-surface-foreground">
              {msg("dirty")}
            </Badge>
          ) : null}
        </div>
        {branch ? (
          <div className="flex min-w-0 items-center gap-1.5 text-ui-sm text-foreground-subtle">
            <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate font-mono">{branch}</span>
          </div>
        ) : null}
        <ControlHintTooltip title={worktree.path} triggerClassName="min-w-0 max-w-full">
          <span className="block truncate font-mono text-ui-sm text-foreground-subtlest">
            {worktree.path}
          </span>
        </ControlHintTooltip>
        {worktree.tasks.length === 0 ? (
          <span className="text-ui-sm text-foreground-subtlest">{msg("noTasks")}</span>
        ) : null}
        {error ? (
          <p
            role="alert"
            data-testid={managedWorktreeTestIds.rowError}
            className="break-words text-ui-sm text-destructive"
          >
            {error.message}
            {error.detail ? (
              <span className="mt-0.5 block break-all font-mono text-foreground-subtle">
                {error.detail}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <TaskActions tasks={worktree.tasks} onOpenTask={onOpenTask} />
        {missing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            data-testid={managedWorktreeTestIds.prune}
            disabled={busy}
            onClick={onPrune}
          >
            {pruning ? <Spinner className="size-3.5" /> : null}
            {msg("prune")}
          </Button>
        ) : worktree.creating ? null : (
          // 创建中的 worktree 由创建记录的"放弃"处理，不显示删除。
          // 有任务使用且有改动时禁用；没有任务时允许强制删除，确认框写明会丢弃改动。
          <IconAction
            label={msg("delete")}
            testId={managedWorktreeTestIds.delete}
            disabledReason={
              worktree.dirty && worktree.tasks.length > 0 ? msg("error.dirty") : undefined
            }
            className="hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </IconAction>
        )}
      </div>
    </li>
  );
}
