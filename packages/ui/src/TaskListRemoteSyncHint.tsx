import { Spinner } from "@/components/ui/spinner.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";

export function TaskListRemoteSyncHint() {
  const { intl } = useKayingCodeIntl();

  return (
    <div className="flex items-center gap-2 px-2.5 py-1 text-ui-base text-foreground-subtlest">
      <Spinner className="size-4 text-foreground-subtlest" />
      <span>{intl.formatMessage({ id: "taskList.syncingRemoteWorkspaces" })}</span>
    </div>
  );
}
