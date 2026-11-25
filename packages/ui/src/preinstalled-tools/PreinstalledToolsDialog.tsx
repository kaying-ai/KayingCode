import { isRemoteWorkspaceIdentity } from "@zcode/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Separator } from "@/components/ui/separator.js";
import { Switch } from "@/components/ui/switch.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import type { PreinstalledToolsDialogProps } from "@/preinstalled-tools/contract.js";
import { PreinstalledToolCard } from "@/preinstalled-tools/PreinstalledToolCard.js";
import { usePreinstalledCommand } from "@/preinstalled-tools/usePreinstalledCommand.js";
import { usePreinstalledToolsState } from "@/preinstalled-tools/usePreinstalledToolsState.js";
import { useOptionalTabStore } from "@/store/TabStoreProvider.js";

export function PreinstalledToolsDialog({ open, onOpenChange }: PreinstalledToolsDialogProps) {
  const { intl } = useKayingCodeIntl();
  const { state, loadFailed } = usePreinstalledToolsState(open);
  const { execute, pending, error } = usePreinstalledCommand();
  const remoteWorkspace = useOptionalTabStore((store) =>
    store.tabs.some(
      (tab) =>
        tab.kind === "workspace" &&
        tab.workspacePath === store.activeWorkspacePath &&
        (tab.workspaceIdentity ?? null) === store.activeWorkspaceIdentity &&
        Boolean(
          tab.remoteSessionId ||
          tab.remoteTarget ||
          isRemoteWorkspaceIdentity(tab.workspaceIdentity ?? ""),
        ),
    ),
  );
  const text = (key: string) => intl.formatMessage({ id: `preinstalledTools.${key}` });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto"
        data-testid="preinstalled-tools-dialog"
      >
        <DialogHeader>
          <DialogTitle>{text("title")}</DialogTitle>
          <DialogDescription>{text("description")}</DialogDescription>
        </DialogHeader>
        {remoteWorkspace ? (
          <p
            className="rounded-xl bg-warning/10 p-3 text-ui-sm text-warning"
            data-testid="preinstalled-tools-remote-notice"
          >
            {text("remoteNotice")}
          </p>
        ) : null}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <label className="text-ui-base font-medium" htmlFor="preinstalled-tools-auto-install">
              {text("autoInstall")}
            </label>
            <p
              id="preinstalled-tools-auto-description"
              className="text-ui-sm text-foreground-subtle"
            >
              {text("autoInstallDescription")}
            </p>
          </div>
          <Switch
            id="preinstalled-tools-auto-install"
            data-testid="preinstalled-tools-auto-install"
            aria-describedby="preinstalled-tools-auto-description"
            checked={state?.autoInstallEnabled ?? false}
            disabled={!state || pending}
            onCheckedChange={(enabled) => void execute({ type: "set-auto-install", enabled })}
          />
        </div>
        {error ? (
          <p role="alert" className="text-ui-sm text-destructive">
            {text("commandFailed")}
          </p>
        ) : null}
        <Separator />
        {state ? (
          state.tools.map((tool) => (
            <PreinstalledToolCard
              key={tool.toolId}
              state={tool}
              autoInstallEnabled={state.autoInstallEnabled}
            />
          ))
        ) : loadFailed ? (
          <p
            role="alert"
            className="text-ui-sm text-destructive"
            data-testid="preinstalled-tools-load-failed"
          >
            {text("loadFailed")}
          </p>
        ) : (
          <p className="text-ui-sm text-foreground-subtle">{text("loading")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
