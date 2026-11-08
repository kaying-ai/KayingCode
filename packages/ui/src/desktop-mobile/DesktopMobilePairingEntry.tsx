import { useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { WebRemoteControlDialog } from "@/web-remote-control/WebRemoteControlDialog.js";
export function DesktopMobilePairingEntry({
  workspacePath,
  workspaceIdentity,
  remoteSessionId,
  initialTaskId,
  onChooseWorkspace,
}: {
  workspacePath?: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  initialTaskId?: string;
  onChooseWorkspace?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { intl } = useKayingCodeIntl();
  const label = intl.formatMessage({ id: "desktopMobile.title" });
  return (
    <>
      <ControlHintTooltip title={label}>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={label}
          data-testid="desktop-mobile-pairing-button"
          onClick={() => (workspacePath ? setOpen(true) : onChooseWorkspace?.())}
        >
          <Smartphone className="size-4" />
        </Button>
      </ControlHintTooltip>
      {workspacePath ? (
        <WebRemoteControlDialog
          open={open}
          onOpenChange={setOpen}
          workspacePath={workspacePath}
          workspaceIdentity={workspaceIdentity}
          remoteSessionId={remoteSessionId}
          initialTaskId={initialTaskId}
        />
      ) : null}
    </>
  );
}
