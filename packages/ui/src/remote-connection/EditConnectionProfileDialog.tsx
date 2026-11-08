import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ConnectionProfile, RemoteTarget, SourceServerRecord } from "@zcode/shared";
import { DEFAULT_REMOTE_ASSET_INSTALL_MODE, isValidWslUser } from "@zcode/shared";
import type { ISourceServerManagementService } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Input } from "@/components/ui/input.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { useRemoteConnectionForm } from "@/hooks/useRemoteConnectionForm.js";
import { RemoteConnectionFields } from "@/RemoteConnectionFields.js";
import { RemoteConnectionKindTag } from "@/remote-connection/RemoteConnectionTags.js";

type EditConnectionProfileDialogProps = {
  open: boolean;
  profile: ConnectionProfile | null;
  source?: SourceServerRecord;
  management: ISourceServerManagementService;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** 入口语义：只影响表单初始可编辑重点，本地字段组件不再单独聚焦。 */
  focusField?: "host" | "auth";
};

export function EditConnectionProfileDialog(props: EditConnectionProfileDialogProps) {
  return props.open && props.profile ? (
    <EditConnectionProfileForm key={props.profile.profileId} {...props} profile={props.profile} />
  ) : null;
}

function EditConnectionProfileForm({
  open,
  profile,
  source,
  management,
  onOpenChange,
  onSaved,
}: EditConnectionProfileDialogProps & { profile: ConnectionProfile }) {
  const { intl } = useKayingCodeIntl();
  const form = useRemoteConnectionForm({
    open,
    isWindowsDesktop: profile.transport === "wsl",
    preferredKind: profile.transport,
  });
  const { host, port, username, sshAuthMethod, assetInstallMode, password, privateKeyPath } = form;
  const [name, setName] = useState(profile.displayName ?? profile.transport);
  const [deviceName, setDeviceName] = useState(source?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  // 表单只在挂载时初始化一次；提交后由父组件按 profileId 重新挂载。
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (profile.target.kind === "ssh") {
      form.setHost(profile.target.host);
      form.setPort(String(profile.target.port ?? 22));
      form.setUsername(profile.target.username);
      form.setSshAuthMethod(profile.target.privateKeyPath ? "privateKey" : "password");
      form.setPrivateKeyPath(profile.target.privateKeyPath ?? "");
      form.setAssetInstallMode(
        profile.target.assetInstallMode ?? DEFAULT_REMOTE_ASSET_INSTALL_MODE,
      );
      if (profile.target.sshConfigAlias) {
        form.applySshConfigAlias({
          alias: profile.target.sshConfigAlias,
          host: profile.target.host,
          port: profile.target.port ?? 22,
          username: profile.target.username,
          privateKeyPath: profile.target.privateKeyPath,
        });
      }
    } else if (profile.target.kind === "wsl") {
      form.setWslDistro(profile.target.distro ?? "");
      form.setWslUser(profile.target.user ?? "");
    } else {
      form.setManualDockerContainer(profile.target.container);
    }
    // 只在挂载时按原连接回填；用户之后的编辑不能被 effect 覆盖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.profileId]);

  const validate = (): string | null => {
    const normalizedName = name.trim();
    if (!normalizedName) return intl.formatMessage({ id: "settings.source.connectionNameRequired" });
    if (source && !deviceName.trim()) {
      return intl.formatMessage({ id: "settings.source.deviceNameRequired" });
    }
    if (profile.target.kind === "ssh") {
      if (!host.trim() || !username.trim()) {
        return intl.formatMessage({ id: "ssh.validation.required" });
      }
      if (sshAuthMethod === "privateKey" && !privateKeyPath.trim()) {
        return intl.formatMessage({ id: "ssh.validation.privateKeyRequired" });
      }
      return null;
    }
    if (profile.target.kind === "wsl") {
      const wslUser = form.wslUser.trim();
      if (wslUser && !isValidWslUser(wslUser)) {
        return intl.formatMessage({ id: "wsl.validation.invalidUser" });
      }
      return null;
    }
    return (form.manualDockerContainer || form.dockerContainer).trim()
      ? null
      : intl.formatMessage({ id: "docker.validation.required" });
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    let target: Exclude<RemoteTarget, { kind: "server" }>;
    if (profile.target.kind === "ssh") {
      target = {
        kind: "ssh",
        host: host.trim(),
        port: Number(port.trim() || "22"),
        username: username.trim(),
        assetInstallMode,
        ...(form.selectedSshConfigAlias ? { sshConfigAlias: form.selectedSshConfigAlias } : {}),
        ...(profile.target.resourcePackages
          ? { resourcePackages: profile.target.resourcePackages }
          : {}),
        ...(sshAuthMethod === "password" && password.trim() ? { password: password.trim() } : {}),
        ...(sshAuthMethod === "privateKey"
          ? {
              privateKeyPath: privateKeyPath.trim(),
              ...(form.privateKeyPassphrase.trim()
                ? { privateKeyPassphrase: form.privateKeyPassphrase.trim() }
                : {}),
            }
          : {}),
      };
    } else if (profile.target.kind === "wsl") {
      target = {
        kind: "wsl",
        ...(form.wslDistro.trim() ? { distro: form.wslDistro.trim() } : {}),
        ...(form.wslUser.trim() ? { user: form.wslUser.trim() } : {}),
      };
    } else {
      target = {
        kind: "docker",
        container: (form.manualDockerContainer || form.dockerContainer).trim(),
      };
    }

    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await management.updateProfile({
        profileId: profile.profileId,
        profileDisplayName: name.trim(),
        ...(source && deviceName.trim() !== source.displayName
          ? { sourceDisplayName: deviceName.trim() }
          : {}),
        ...(profile.target.kind === "ssh" ? { sshAuthMethod } : {}),
        target,
      });
      onSaved?.();
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!savingRef.current) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg gap-0 overflow-y-auto p-0">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <DialogHeader className="border-b border-border px-5 py-4 pr-14">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-ui-lg font-semibold">
                {intl.formatMessage({ id: "settings.source.editConnectionTitle" })}
              </DialogTitle>
              <RemoteConnectionKindTag kind={profile.transport} />
            </div>
            <DialogDescription className="text-ui-sm">
              {intl.formatMessage({ id: "settings.source.editConnectionDescription" })}
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={saving} className="min-w-0 space-y-4 px-5 py-4">
            <div className="space-y-1.5">
              <label htmlFor="edit-connection-name" className="text-ui-sm font-medium">
                {intl.formatMessage({ id: "settings.source.connectionName" })}
              </label>
              <Input
                id="edit-connection-name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </div>
            {source ? (
              <div className="space-y-1.5">
                <label htmlFor="edit-device-name" className="text-ui-sm font-medium">
                  {intl.formatMessage({ id: "settings.source.deviceName" })}
                </label>
                <Input
                  id="edit-device-name"
                  value={deviceName}
                  onChange={(event) => setDeviceName(event.currentTarget.value)}
                />
              </div>
            ) : null}
            <RemoteConnectionFields
              {...form}
              kind={profile.transport}
              runtimeOptionsLoading={form.currentRuntimeOptionsLoading}
            />
            {error ? (
              <p
                role="alert"
                className="rounded-md bg-destructive-surface px-3 py-2 text-ui-sm text-destructive-surface-foreground"
              >
                {error}
              </p>
            ) : null}
          </fieldset>
          <DialogFooter className="border-t border-border px-5 py-3">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              {intl.formatMessage({ id: "common.cancel" })}
            </Button>
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {intl.formatMessage({ id: saving ? "common.saving" : "common.saveChanges" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
