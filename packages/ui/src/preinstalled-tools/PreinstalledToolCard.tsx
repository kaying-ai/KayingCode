import { useState } from "react";
import type { PreinstalledToolState } from "@zcode/shared/preinstalled-tools";
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
import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import { Progress } from "@/components/ui/progress.js";
import { Switch } from "@/components/ui/switch.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { usePreinstalledCommand } from "@/preinstalled-tools/usePreinstalledCommand.js";

// 产品设计 token 没有上游的 *-surface 系列；按现有卡片/提示的写法组合，深浅主题都复用同一组变量。
const statusClasses = {
  "not-installed": "bg-surface text-foreground-subtle",
  preparing: "bg-primary/10 text-primary",
  ready: "bg-success/14 text-success",
  failed: "bg-destructive/10 text-destructive",
};

export function PreinstalledToolCard({
  state,
  autoInstallEnabled,
}: {
  state: PreinstalledToolState;
  autoInstallEnabled: boolean;
}) {
  const { intl, locale } = useKayingCodeIntl();
  const { execute, pending, error } = usePreinstalledCommand();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const text = (key: string) => intl.formatMessage({ id: `preinstalledTools.${key}` });
  const size = (bytes: number, power = 2) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024 ** power);
  const installed = state.installed;
  const deleteNoticeKey = `preinstalledTools.deleteNotice.${state.toolId}`;
  const translatedDeleteNotice = intl.formatMessage({ id: deleteNoticeKey });
  const deleteNotice = translatedDeleteNotice === deleteNoticeKey ? null : translatedDeleteNotice;
  const updateAvailable = Boolean(
    installed && state.target && installed.resourceId !== state.target.resourceId,
  );
  let info: string;
  if (state.status === "failed") {
    info = intl.formatMessage(
      { id: `preinstalledTools.error.${state.error ?? "runtime"}` },
      {
        size: size(
          (state.target?.archiveSizeBytes ?? 0) + (state.target?.installedSizeBytes ?? 0),
          3,
        ),
      },
    );
  } else if (!state.target) {
    info = text("unavailable");
  } else if (state.status === "preparing") {
    info =
      state.phase === "downloading"
        ? intl.formatMessage(
            { id: "preinstalledTools.downloadInfo" },
            {
              loaded: size(state.downloadedBytes ?? 0),
              total: size(state.target.archiveSizeBytes),
            },
          )
        : text(`phase.${state.phase}`);
  } else if (state.status === "ready" && installed) {
    info = intl.formatMessage(
      { id: "preinstalledTools.readyInfo" },
      { version: installed.version, size: size(installed.installedSizeBytes, 3) },
    );
  } else if (updateAvailable && installed) {
    info = intl.formatMessage(
      { id: "preinstalledTools.updateInfo" },
      {
        current: installed.version,
        version: state.target.version,
        download: size(state.target.archiveSizeBytes),
        installed: size(state.target.installedSizeBytes, 3),
      },
    );
  } else {
    info = intl.formatMessage(
      { id: "preinstalledTools.sizeInfo" },
      {
        download: size(state.target.archiveSizeBytes),
        installed: size(state.target.installedSizeBytes, 3),
      },
    );
  }
  if (installed && (!state.target || state.status === "preparing" || state.status === "failed")) {
    info += ` ${intl.formatMessage({ id: "preinstalledTools.currentInfo" }, { current: installed.version })}`;
  }
  const progress =
    state.target && state.phase === "downloading"
      ? ((state.downloadedBytes ?? 0) / state.target.archiveSizeBytes) * 100
      : undefined;
  return (
    <>
      <div
        className="rounded-xl border border-card-border bg-card p-4 space-y-3"
        data-testid="preinstalled-tools-card"
        data-tool-id={state.toolId}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-ui-base font-medium">{state.displayName}</span>
          <Badge
            className={`rounded-md ${statusClasses[state.status]}`}
            data-testid="preinstalled-tools-status"
            data-status={state.status}
            data-phase={state.phase}
          >
            {text(
              state.status === "not-installed" && updateAvailable
                ? "status.update-available"
                : `status.${state.status}`,
            )}
          </Badge>
        </div>
        <p className="text-ui-caption text-foreground-subtle">{text(`purpose.${state.toolId}`)}</p>
        {state.status === "preparing" ? (
          // 产品 Progress 没有 indeterminate：不确定阶段用固定 35% 宽度加脉冲，表达“正在处理”。
          <Progress
            aria-label={info}
            aria-valuenow={progress}
            value={progress ?? 35}
            indicatorClassName={progress === undefined ? "animate-pulse bg-primary" : "bg-primary"}
          />
        ) : null}
        <p className="text-ui-caption text-foreground-subtle" role="status">
          {info}
        </p>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <label
              className="text-ui-base font-medium"
              htmlFor={`preinstalled-agent-${state.toolId}`}
            >
              {text("agentEnabled")}
            </label>
            <p
              id={`preinstalled-agent-description-${state.toolId}`}
              className="text-ui-sm text-foreground-subtle"
            >
              {intl.formatMessage(
                { id: "preinstalledTools.agentEnabledDescription" },
                { name: state.displayName },
              )}
            </p>
          </div>
          <Switch
            id={`preinstalled-agent-${state.toolId}`}
            data-testid="preinstalled-tools-agent-enabled"
            aria-describedby={`preinstalled-agent-description-${state.toolId}`}
            checked={state.agentEnabled}
            disabled={pending}
            onCheckedChange={(enabled) =>
              void execute({ type: "set-agent-enabled", toolId: state.toolId, enabled })
            }
          />
        </div>
        {state.entryOutOfSync ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning/10 p-3 text-ui-sm text-warning"
            role="alert"
            data-testid="preinstalled-tools-entry-out-of-sync"
          >
            <span>{text("entryOutOfSync")}</span>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              data-testid="preinstalled-tools-sync-entries"
              onClick={() => void execute({ type: "sync-entries", toolId: state.toolId })}
            >
              {text("retry")}
            </Button>
          </div>
        ) : null}
        {state.deletionBlocked ? (
          <p
            className="rounded-lg bg-warning/10 p-3 text-ui-sm text-warning"
            role="alert"
            data-testid="preinstalled-tools-delete-blocked"
          >
            {intl.formatMessage(
              { id: "preinstalledTools.deletionBlocked" },
              { name: state.displayName },
            )}
          </p>
        ) : null}
        {state.target || installed ? (
          <div className="flex justify-end gap-2">
            {state.status === "preparing" ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                data-testid="preinstalled-tools-cancel"
                onClick={() => void execute({ type: "cancel", toolId: state.toolId })}
              >
                {text("cancel")}
              </Button>
            ) : (
              <>
                {installed ? (
                  <Button
                    variant="outline"
                    disabled={pending}
                    data-testid="preinstalled-tools-delete"
                    onClick={() => setDeleteOpen(true)}
                  >
                    {text("delete")}
                  </Button>
                ) : null}
                {state.target && state.status !== "ready" ? (
                  <Button
                    type="button"
                    disabled={pending}
                    data-testid={
                      state.status === "failed"
                        ? "preinstalled-tools-retry"
                        : updateAvailable
                          ? "preinstalled-tools-update"
                          : "preinstalled-tools-download"
                    }
                    onClick={() => void execute({ type: "prepare", toolId: state.toolId })}
                  >
                    {text(
                      state.status === "failed" ? "retry" : updateAvailable ? "update" : "download",
                    )}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
        {error ? (
          <p
            role="alert"
            data-testid="preinstalled-tools-command-error"
            className="text-ui-sm text-destructive"
          >
            {text("commandFailed")}
          </p>
        ) : null}
      </div>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent data-testid="preinstalled-tools-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {intl.formatMessage(
                { id: "preinstalledTools.deleteTitle" },
                { name: state.displayName },
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {intl.formatMessage(
                { id: "preinstalledTools.deleteDescription" },
                { size: size(installed?.installedSizeBytes ?? 0, 3) },
              )}
              {autoInstallEnabled ? ` ${text("deleteAutoNotice")}` : null}
              {deleteNotice ? ` ${deleteNotice}` : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="preinstalled-tools-delete-confirm-cancel">
              {text("deleteCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              data-testid="preinstalled-tools-delete-confirm-accept"
              onClick={() => {
                setDeleteOpen(false);
                void execute({ type: "delete", toolId: state.toolId });
              }}
            >
              {text("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
