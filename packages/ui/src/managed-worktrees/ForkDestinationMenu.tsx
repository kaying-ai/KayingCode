// assistant 行“分叉”目的地菜单（managed-worktrees/CONTRACT.md §8）。
// 上游把菜单直接挂在行组件内；产品行组件只有单一 fork 动作，因此由 SessionPane 在点击时
// 用指针位置/按钮矩形作为锚点渲染同一组目的地语义：原地分叉 / 在新 worktree 中分叉。
import { FolderGit2Icon, TrendingUpDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { managedWorktreeTestIds } from "./managedWorktreeTestIds.js";

export interface ForkMenuAnchor {
  x: number;
  y: number;
}

export function ForkDestinationMenu({
  open,
  onOpenChange,
  anchor,
  worktreeAvailable,
  inWorktree,
  onForkHere,
  onForkToWorktree,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** 行内 fork 按钮的位置；菜单只在这一帧存在，关闭后由宿主清理。 */
  anchor: ForkMenuAnchor | null;
  /** Agent 是否声明支持 worktree cwd；false 时第二项可见但禁用。 */
  worktreeAvailable: boolean;
  /** 父任务本身在受管 worktree 中：第一项是“在当前 worktree 中分叉”。 */
  inWorktree: boolean;
  onForkHere(): void;
  onForkToWorktree(): void;
}) {
  const { intl } = useKayingCodeIntl();
  // 既有通用 key：没有单独的“在这里/在 worktree 分叉”文案键，先复用同一动作名。
  const forkHereLabel = intl.formatMessage({ id: "chat.message.fork" });
  const forkToWorktreeLabel = intl.formatMessage({
    id: "managedWorktrees.creation.forkTitle",
  });
  const unsupportedLabel = intl.formatMessage({ id: "managedWorktrees.entry.unsupported" });
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {anchor ? (
        <PopoverAnchor asChild>
          <span
            aria-hidden="true"
            data-testid={managedWorktreeTestIds.forkMenu}
            style={{
              position: "fixed",
              left: anchor.x,
              top: anchor.y,
              width: 1,
              height: 1,
              pointerEvents: "none",
            }}
          />
        </PopoverAnchor>
      ) : null}
      <PopoverContent
        side="bottom"
        align="start"
        aria-label={forkHereLabel}
        className="w-60 gap-0.5 p-1"
      >
        <Button
          type="button"
          variant="ghost"
          size="default"
          role="menuitem"
          data-testid={managedWorktreeTestIds.forkHere}
          className="h-auto w-full justify-start gap-2 px-2 py-1 text-left font-normal"
          onClick={onForkHere}
        >
          <TrendingUpDownIcon className="size-4 shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{forkHereLabel}</span>
            {inWorktree ? (
              // 上游此处是“在当前 worktree 中分叉”；产品没有独立文案键，先复用任务标签说明位置。
              <span className="text-ui-sm text-foreground-subtle">
                {intl.formatMessage({ id: "managedWorktrees.taskLabel" })}
              </span>
            ) : null}
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="default"
          role="menuitem"
          disabled={!worktreeAvailable}
          title={worktreeAvailable ? undefined : unsupportedLabel}
          data-testid={managedWorktreeTestIds.forkToWorktree}
          className="h-auto w-full justify-start gap-2 px-2 py-1 text-left font-normal"
          onClick={onForkToWorktree}
        >
          <FolderGit2Icon className="size-4 shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{forkToWorktreeLabel}</span>
            <span className="text-ui-sm text-foreground-subtle">
              {worktreeAvailable
                ? intl.formatMessage({ id: "managedWorktrees.entry.tooltip" })
                : unsupportedLabel}
            </span>
          </span>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
