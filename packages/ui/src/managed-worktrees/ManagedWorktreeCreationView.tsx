// 发送后、会话创建前的展示（managed-worktrees/CONTRACT.md §5）：用户消息 + 进度卡片 + 失败操作。
// 数据全部来自 Host 的创建记录；renderer 只发出操作，不推算阶段。
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { toast } from "@/components/ui/toast.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import type { IManagedWorktreeService, ManagedWorktreeCreation } from "./contract.js";
import { formatManagedWorktreeError } from "./managedWorktreeErrors.js";
import { managedWorktreeTestIds } from "./managedWorktreeTestIds.js";
import { useBaseManagedWorktreeService } from "./useManagedWorktreeCreations.js";
import { WorktreeOutputBlock } from "./WorktreeOutputBlock.js";

type CreationAction = "retryCreation" | "continueWithoutWorktree" | "dismissCreation";

export function ManagedWorktreeCreationView({
  creation,
  service: serviceProp,
}: {
  creation: ManagedWorktreeCreation;
  /** 测试或宿主显式注入；缺省读取本机 base services。 */
  service?: IManagedWorktreeService;
}) {
  const { intl } = useKayingCodeIntl();
  const contextService = useBaseManagedWorktreeService();
  const managedWorktreeService = serviceProp ?? contextService;
  const [pendingAction, setPendingAction] = useState<CreationAction | null>(null);

  const runAction = useCallback(
    (action: CreationAction) => {
      if (!managedWorktreeService) return;
      setPendingAction(action);
      void managedWorktreeService[action]({ creationId: creation.id })
        .catch((error: unknown) => {
          logger.warn("[worktree] 创建记录操作失败", { action, error });
          toast(formatManagedWorktreeError(intl, error));
        })
        .finally(() => setPendingAction(null));
    },
    [creation.id, intl, managedWorktreeService],
  );

  const failed = creation.phase === "failed";
  const title = failed
    ? intl.formatMessage({ id: "managedWorktrees.creation.failed" })
    : intl.formatMessage({
        id:
          creation.phase === "starting-session"
            ? "managedWorktrees.creation.startingSession"
            : creation.kind === "fork"
              ? "managedWorktrees.creation.forkTitle"
              : "managedWorktrees.creation.creating",
      });
  const busy = pendingAction !== null;

  return (
    <div className="@container/conversation flex h-full min-h-0 w-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        {creation.promptText?.trim() ? (
          <div className="flex justify-end">
            <div
              data-testid="managed-worktree-creation-prompt"
              className="max-w-[85%] rounded-2xl bg-surface px-3 py-2 text-ui-base text-foreground whitespace-pre-wrap break-words"
            >
              {creation.promptText}
            </div>
          </div>
        ) : null}
        <WorktreeOutputBlock
          testId={managedWorktreeTestIds.creationCard}
          phase={creation.phase}
          title={title}
          status={failed ? "failed" : "running"}
          output={creation.output}
          defaultExpanded={failed}
        >
          {failed ? (
            <div className="flex flex-col gap-3">
              {creation.error ? (
                <p className="text-ui-base text-foreground">
                  {formatManagedWorktreeError(intl, creation.error.code)}
                  {creation.error.detail ? (
                    <span className="block font-mono text-ui-sm text-foreground-subtle break-all">
                      {creation.error.detail}
                    </span>
                  ) : null}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  data-testid={managedWorktreeTestIds.creationRetry}
                  onClick={() => runAction("retryCreation")}
                >
                  {intl.formatMessage({ id: "managedWorktrees.creation.retry" })}
                </Button>
                {creation.kind === "new-task" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    data-testid={managedWorktreeTestIds.creationContinueLocal}
                    onClick={() => runAction("continueWithoutWorktree")}
                  >
                    {intl.formatMessage({ id: "managedWorktrees.creation.continueLocal" })}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  data-testid={managedWorktreeTestIds.creationDismiss}
                  onClick={() => runAction("dismissCreation")}
                >
                  {intl.formatMessage({ id: "managedWorktrees.creation.dismiss" })}
                </Button>
              </div>
            </div>
          ) : null}
        </WorktreeOutputBlock>
      </div>
    </div>
  );
}
