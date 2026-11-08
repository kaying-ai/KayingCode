/* eslint-disable max-lines -- 远程连接向导的多个步骤暂集中在同一文件，避免拆分时扩大 SSH/Docker/WSL 回归面。 */
import { useCallback, useState } from "react";
import type {
  AppSettings,
  DockerContainerInfo,
  RemoteAssetInstallMode,
  RemoteTarget,
  RemoteWorkspaceSessionEntry,
  ServerRemoteWorkspaceInfo,
  SSHConfigAliasOption,
  WSLDistro,
} from "@zcode/shared";
import { TID_REMOTE_KIND_DOCKER, TID_REMOTE_KIND_SSH, TID_REMOTE_KIND_WSL } from "@zcode/shared";
import type {
  IMcpSyncService,
  IPluginSyncService,
  IServiceAccessor,
  ISkillSyncService,
  IKayingCodeAgentService,
} from "@zcode/services";
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  LoaderIcon,
  MonitorCogIcon,
  ServerIcon,
  TerminalIcon,
  BotIcon,
} from "lucide-react";
import { DirectoryBrowser } from "@/DirectoryBrowser.js";
import { RemoteConnectionFields } from "@/RemoteConnectionFields.js";
import type { RemoteConnectionKind, SSHAuthMethod } from "@/hooks/useRemoteConnectionForm.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { cn } from "@/components/lib/utils.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { useOptionalBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useConfirmDialogStore } from "@/store/confirmDialogStore.js";
import { ensureSourceServerBoundaryAcknowledged } from "@/lib/sourceServerBoundaryOnboarding.js";
import { logger } from "@/logger.js";
import {
  RemoteSyncDialogs,
  RemoteSyncDropdownButton,
  shouldShowRemoteSyncActions,
} from "@/settings/RemoteSyncActions.js";
export { RemoteConnectionConnectingStep } from "@/remote-connection/RemoteConnectionConnectingStep.js";

/**
 * 首次主动使用远程设备前的能力边界说明：设置归 settingService，读取/保存失败保持未读。
 * 本地确认框没有上游 `requiredAcknowledgement` 分类，用户必须点击确认才会写入版本。
 */
export function useRemoteBoundaryAcknowledgement() {
  const settingService = useOptionalBaseWorkspaceServices()?.settingService;
  const syncAppSettings = useOptionalPlatform()?.syncAppSettings;
  const confirm = useConfirmDialog();
  const { intl } = useKayingCodeIntl();
  return useCallback(
    async (isCurrent: () => boolean, onBlocked?: () => void): Promise<boolean> => {
      if (!settingService) return isCurrent();
      try {
        const settings = await settingService.get();
        if (!isCurrent()) return false;
        if (settings.remoteBoundaryIntroAcknowledgedVersion === 1) return true;
        // 全局确认框拒绝并发请求；完成动作由调用方保留，不能把占用误当用户取消。
        if (useConfirmDialogStore.getState().pendingRequest) {
          onBlocked?.();
          return false;
        }
        return await ensureSourceServerBoundaryAcknowledged({
          currentVersion: settings.remoteBoundaryIntroAcknowledgedVersion,
          targetVersion: 1 as const,
          isCurrent,
          requestAcknowledgement: () =>
            confirm({
              title: intl.formatMessage({ id: "remote.sourceServerBoundaryTitle" }),
              description: intl.formatMessage({ id: "remote.sourceServerBoundaryDescription" }),
              confirmLabel: intl.formatMessage({ id: "common.gotIt" }),
              showKeyboardHints: false,
            }),
          persistVersion: async (version) => {
            const patch = {
              remoteBoundaryIntroAcknowledgedVersion: version,
            } satisfies Partial<AppSettings>;
            await settingService.update(patch);
            syncAppSettings?.(patch);
          },
        });
      } catch (cause) {
        logger.warn("[RemoteBoundaryAcknowledgement] 读取或保存远程介绍状态失败", cause);
        return isCurrent();
      }
    },
    [settingService, syncAppSettings, confirm, intl],
  );
}

function getKindIcon(kind: RemoteConnectionKind) {
  switch (kind) {
    case "ssh":
      return ServerIcon;
    case "docker":
      return MonitorCogIcon;
    case "wsl":
      return TerminalIcon;
    case "server":
      return BotIcon;
  }
}

export function RemoteConnectionKindStep({
  kind,
  availableKinds,
  onKindChange,
  onCancel,
  onNext,
}: {
  kind: RemoteConnectionKind;
  availableKinds: RemoteConnectionKind[];
  onKindChange: (value: RemoteConnectionKind) => void;
  onCancel: () => void;
  onNext: () => void;
}) {
  const { intl } = useKayingCodeIntl();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 h-full">
      <div className="flex-1 min-h-0 grid content-start gap-3 md:grid-cols-2">
        {availableKinds.map((value) => {
          const Icon = getKindIcon(value);
          const selected = kind === value;

          return (
            <button
              key={value}
              type="button"
              onClick={() => onKindChange(value)}
              data-testid={
                value === "ssh"
                  ? TID_REMOTE_KIND_SSH
                  : value === "wsl"
                    ? TID_REMOTE_KIND_WSL
                    : value === "docker"
                      ? TID_REMOTE_KIND_DOCKER
                      : "remote-kind-server"
              }
              className={cn(
                "flex min-h-32 flex-col items-start gap-4 rounded-2xl border p-4 text-left transition-colors",
                selected
                  ? "border-border-hover bg-selected"
                  : "border-border bg-card hover:border-border-hover hover:bg-surface",
              )}
            >
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-xl border",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background-alt text-foreground-subtle",
                )}
              >
                <Icon className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-ui-lg font-medium text-foreground">
                  {intl.formatMessage({ id: `remote.kind.${value}` })}
                </p>
                <p className="text-ui-base leading-5 text-foreground-subtle">
                  {intl.formatMessage({
                    id: `remote.kind.${value}.wizardDescription`,
                  })}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="h-10 min-w-0 px-5"
          onClick={onCancel}
        >
          {intl.formatMessage({ id: "common.cancel" })}
        </Button>
        <Button type="button" size="lg" className="h-10 min-w-0 px-5" onClick={onNext}>
          {intl.formatMessage({ id: "common.next" })}
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function RemoteConnectionSettingsStep({
  kind,
  host,
  port,
  serverPort,
  username,
  sshAuthMethod,
  assetInstallMode,
  password,
  privateKeyPath,
  privateKeyPassphrase,
  wslDistro,
  wslUser = "",
  wslDistros,
  dockerContainer,
  manualDockerContainer,
  dockerContainers,
  dockerAvailable,
  sshConfigAliases,
  sshConfigAliasesLoading,
  sshConfigAliasesError,
  selectedSshConfigAlias,
  currentRuntimeOptionsLoading,
  currentRuntimeOptionsError,
  remoteWorkspaceSessions = [],
  validationMessage,
  loading,
  onBack,
  onHostChange,
  onPortChange,
  onServerPortChange,
  onUsernameChange,
  onSshAuthMethodChange,
  onAssetInstallModeChange,
  onPasswordChange,
  onPrivateKeyPathChange,
  onPrivateKeyPassphraseChange,
  onWslDistroChange,
  onWslUserChange,
  onDockerContainerChange,
  onManualDockerContainerChange,
  onDockerContainersRefresh,
  onApplySshConfigAlias,
  onClearSelectedSshConfigAlias,
  onConnect,
}: {
  kind: RemoteConnectionKind;
  host: string;
  port: string;
  serverPort: string;
  username: string;
  sshAuthMethod: SSHAuthMethod;
  assetInstallMode: RemoteAssetInstallMode;
  password: string;
  privateKeyPath: string;
  privateKeyPassphrase: string;
  wslDistro: string;
  wslUser?: string;
  wslDistros: WSLDistro[];
  dockerContainer: string;
  manualDockerContainer: string;
  dockerContainers: DockerContainerInfo[];
  dockerAvailable: boolean | null;
  sshConfigAliases: SSHConfigAliasOption[];
  sshConfigAliasesLoading: boolean;
  sshConfigAliasesError: string;
  selectedSshConfigAlias: string | null;
  currentRuntimeOptionsLoading: boolean;
  currentRuntimeOptionsError: string;
  remoteWorkspaceSessions?: RemoteWorkspaceSessionEntry[];
  validationMessage: string;
  loading: boolean;
  onBack: () => void;
  onHostChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onServerPortChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onSshAuthMethodChange: (value: SSHAuthMethod) => void;
  onAssetInstallModeChange: (value: RemoteAssetInstallMode) => void;
  onPasswordChange: (value: string) => void;
  onPrivateKeyPathChange: (value: string) => void;
  onPrivateKeyPassphraseChange: (value: string) => void;
  onWslDistroChange: (value: string) => void;
  onWslUserChange?: (value: string) => void;
  onDockerContainerChange: (value: string) => void;
  onManualDockerContainerChange: (value: string) => void;
  onDockerContainersRefresh?: () => void;
  onApplySshConfigAlias: (value: SSHConfigAliasOption) => void;
  onClearSelectedSshConfigAlias: () => void;
  onConnect: () => void;
}) {
  const { intl } = useKayingCodeIntl();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 h-full">
      <div
        data-testid="remote-connection-settings-scroll"
        // SSH 配置项增多时，表单内容以前没有自己的滚动边界，会继续绘制到下方按钮区域。
        // 这里把中间内容区限定为可滚动区域，让 footer 始终占据独立空间，不遮挡最后几项配置。
        className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-1"
      >
        {kind === "server" ? (
          <div className="rounded-xl border border-border bg-surface p-3 text-ui-base text-foreground-subtle">
            {intl.formatMessage({ id: "remote.agent.sshTunnelDescription" })}
          </div>
        ) : null}
        {currentRuntimeOptionsError ? (
          <div className="flex items-start gap-3 rounded-2xl border border-warning bg-warning px-4 py-3 text-ui-base text-warning-foreground">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <span>{intl.formatMessage({ id: "remote.optionsLoadFailed" })}</span>
          </div>
        ) : null}

        <RemoteConnectionFields
          kind={kind === "server" ? "ssh" : kind}
          host={host}
          port={port}
          username={username}
          sshAuthMethod={sshAuthMethod}
          assetInstallMode={assetInstallMode}
          password={password}
          privateKeyPath={privateKeyPath}
          privateKeyPassphrase={privateKeyPassphrase}
          wslDistro={wslDistro}
          wslUser={wslUser}
          wslDistros={wslDistros}
          dockerContainer={dockerContainer}
          manualDockerContainer={manualDockerContainer}
          dockerContainers={dockerContainers}
          dockerAvailable={dockerAvailable}
          sshConfigAliases={sshConfigAliases}
          sshConfigAliasesLoading={sshConfigAliasesLoading}
          sshConfigAliasesError={sshConfigAliasesError}
          selectedSshConfigAlias={selectedSshConfigAlias}
          runtimeOptionsLoading={currentRuntimeOptionsLoading}
          showAssetInstallMode={kind !== "server"}
          remoteWorkspaceSessions={remoteWorkspaceSessions}
          applySshConfigAlias={onApplySshConfigAlias}
          clearSelectedSshConfigAlias={onClearSelectedSshConfigAlias}
          setHost={onHostChange}
          setPort={onPortChange}
          setUsername={onUsernameChange}
          setSshAuthMethod={onSshAuthMethodChange}
          setAssetInstallMode={onAssetInstallModeChange}
          setPassword={onPasswordChange}
          setPrivateKeyPath={onPrivateKeyPathChange}
          setPrivateKeyPassphrase={onPrivateKeyPassphraseChange}
          setWslDistro={onWslDistroChange}
          setWslUser={onWslUserChange}
          setDockerContainer={onDockerContainerChange}
          setManualDockerContainer={onManualDockerContainerChange}
          refreshDockerContainers={onDockerContainersRefresh}
        />
        {kind === "server" ? (
          <div className="max-w-48">
            <label className="mb-1 block text-ui-base text-foreground-subtle">
              {intl.formatMessage({ id: "remote.agent.serverPort" })}
            </label>
            <Input
              value={serverPort}
              onChange={(event) => onServerPortChange(event.target.value)}
              inputMode="numeric"
              placeholder={intl.formatMessage({ id: "remote.agent.serverPortAuto" })}
              className="h-9 text-ui-base"
            />
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-3">
        {validationMessage ? (
          <div className="flex flex-1 min-w-0 items-center gap-2">
            <AlertTriangleIcon className="size-4 shrink-0 text-warning" />
            <span className="text-warning">{validationMessage}</span>
          </div>
        ) : null}
        <div className="flex shrink-0 justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="h-10 min-w-0 px-5"
            onClick={onBack}
            disabled={loading}
          >
            {intl.formatMessage({ id: "common.back" })}
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-10 min-w-0 px-5"
            onClick={onConnect}
            disabled={loading}
          >
            {loading ? (
              <>
                <LoaderIcon className="size-4 animate-spin" />
                {intl.formatMessage({ id: "remote.connecting" })}
              </>
            ) : (
              intl.formatMessage({ id: "remote.startConnection" })
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RemoteAgentWorkspaceStep({
  workspaces,
  selecting = false,
  onSelect,
  onBack,
  onCancel,
}: {
  workspaces: ServerRemoteWorkspaceInfo[];
  selecting?: boolean;
  onSelect: (workspace: ServerRemoteWorkspaceInfo) => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const { intl } = useKayingCodeIntl();
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {workspaces.map((workspace) => (
          <button
            key={workspace.workspaceIdentity}
            type="button"
            disabled={selecting || workspace.access === "read-only"}
            onClick={() => onSelect(workspace)}
            className="flex w-full items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left hover:border-border-hover hover:bg-surface disabled:opacity-60"
          >
            <span className="min-w-0">
              <span className="block truncate text-ui-base font-medium text-foreground">
                {workspace.label}
              </span>
              <span className="block truncate text-ui-base text-foreground-subtle">
                {workspace.path}
              </span>
            </span>
            <span className="shrink-0 text-ui-base text-foreground-subtle">
              {intl.formatMessage({ id: `remote.agent.access.${workspace.access}` })}
            </span>
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" size="lg" onClick={onBack} disabled={selecting}>
          {intl.formatMessage({ id: "common.back" })}
        </Button>
        <Button type="button" variant="secondary" size="lg" onClick={onCancel} disabled={selecting}>
          {intl.formatMessage({ id: "common.cancel" })}
        </Button>
      </div>
    </div>
  );
}

export function RemoteConnectionDirectoryStep({
  services,
  remoteTarget,
  localSkillSyncService,
  remoteSkillSyncService,
  localMcpSyncService,
  remoteMcpSyncService,
  localPluginSyncService,
  remotePluginSyncService,
  localKayingCodeAgentService,
  remoteKayingCodeAgentService,
  localWorkspacePath,
  selecting = false,
  onSelect,
  onBack,
  onCancel,
  onSkillsSynced,
  onMcpSynced,
  onPluginsSynced,
}: {
  services: IServiceAccessor | null;
  remoteTarget?: RemoteTarget | null;
  localSkillSyncService?: ISkillSyncService;
  remoteSkillSyncService?: ISkillSyncService | null;
  localMcpSyncService?: IMcpSyncService;
  remoteMcpSyncService?: IMcpSyncService | null;
  localPluginSyncService?: IPluginSyncService;
  remotePluginSyncService?: IPluginSyncService | null;
  localKayingCodeAgentService?: IKayingCodeAgentService;
  remoteKayingCodeAgentService?: IKayingCodeAgentService | null;
  localWorkspacePath?: string;
  selecting?: boolean;
  onSelect: (path: string) => void;
  onBack: () => void;
  onCancel: () => void;
  onSkillsSynced?: () => Promise<void> | void;
  onMcpSynced?: () => Promise<void> | void;
  onPluginsSynced?: () => Promise<void> | void;
}) {
  const { intl } = useKayingCodeIntl();
  const [selectedPath, setSelectedPath] = useState("");
  const [remoteSkillSyncOpen, setRemoteSkillSyncOpen] = useState(false);
  const [remoteMcpSyncOpen, setRemoteMcpSyncOpen] = useState(false);
  const [remotePluginSyncOpen, setRemotePluginSyncOpen] = useState(false);
  const canShowRemoteSyncActions = shouldShowRemoteSyncActions({
    remoteSessionId: remoteTarget ? "directory-step" : null,
    remoteTarget,
    clientMode: "desktop-continuous",
    hasLocalSourceService: Boolean(
      localSkillSyncService || localMcpSyncService || localPluginSyncService,
    ),
  });
  const canSyncRemoteSkills = Boolean(
    canShowRemoteSyncActions && localSkillSyncService && remoteSkillSyncService,
  );
  const canSyncRemoteMcp = Boolean(
    canShowRemoteSyncActions && localMcpSyncService && remoteMcpSyncService,
  );
  const canSyncRemotePlugins = Boolean(
    canShowRemoteSyncActions && localPluginSyncService && remotePluginSyncService,
  );

  if (!services) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6 h-full">
        <div className="flex min-h-[22rem] flex-1 items-center justify-center rounded-2xl border border-border bg-card text-ui-base text-foreground-subtle">
          <LoaderIcon className="mr-2 size-4 animate-spin" />
          {intl.formatMessage({ id: "common.loading" })}
        </div>
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="h-10 min-w-0 w-32"
            onClick={onBack}
          >
            {intl.formatMessage({ id: "common.back" })}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 h-full" aria-busy={selecting}>
      <div className="flex flex-col flex-1 min-h-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success bg-success px-4 py-3 text-ui-base text-success-foreground">
          <span>{intl.formatMessage({ id: "remote.success" })}</span>
          <RemoteSyncDropdownButton
            canSyncSkills={canSyncRemoteSkills}
            canSyncMcp={canSyncRemoteMcp}
            canSyncPlugins={canSyncRemotePlugins}
            mcpDisabled={!selectedPath.trim()}
            onOpenSkillSync={() => setRemoteSkillSyncOpen(true)}
            onOpenMcpSync={() => setRemoteMcpSyncOpen(true)}
            onOpenPluginSync={() => setRemotePluginSyncOpen(true)}
          />
        </div>
        {/* 该容器之前不是 flex，导致子级 DirectoryBrowser 的 flex-1 无法拿到有效高度，
            目录项变多时 overflow-y-auto 不生效，列表不能垂直滚动。 */}
        <div
          className={cn(
            "min-h-0 flex flex-1 overflow-hidden",
            selecting ? "pointer-events-none opacity-70" : "",
          )}
        >
          <DirectoryBrowser
            services={services}
            embedded
            onSelect={onSelect}
            onCancel={onCancel}
            onPathChange={setSelectedPath}
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="h-10 min-w-0 px-5"
          onClick={onBack}
          disabled={selecting}
        >
          {intl.formatMessage({ id: "common.back" })}
        </Button>
        <Button
          type="button"
          size="lg"
          className="h-10 min-w-0 px-5"
          onClick={() => selectedPath && !selecting && onSelect(selectedPath)}
          disabled={!selectedPath || selecting}
        >
          {selecting ? (
            <>
              <LoaderIcon className="size-4 animate-spin" />
              {intl.formatMessage({ id: "common.loading" })}
            </>
          ) : (
            intl.formatMessage({ id: "directoryBrowser.selectDir" })
          )}
        </Button>
      </div>
      <RemoteSyncDialogs
        canSyncSkills={canSyncRemoteSkills}
        canSyncMcp={canSyncRemoteMcp}
        canSyncPlugins={canSyncRemotePlugins}
        skillOpen={remoteSkillSyncOpen}
        mcpOpen={remoteMcpSyncOpen}
        pluginOpen={remotePluginSyncOpen}
        onSkillOpenChange={setRemoteSkillSyncOpen}
        onMcpOpenChange={setRemoteMcpSyncOpen}
        onPluginOpenChange={setRemotePluginSyncOpen}
        localSkillSyncService={localSkillSyncService}
        remoteSkillSyncService={remoteSkillSyncService}
        localMcpSyncService={localMcpSyncService}
        remoteMcpSyncService={remoteMcpSyncService}
        localPluginSyncService={localPluginSyncService}
        remotePluginSyncService={remotePluginSyncService}
        localKayingCodeAgentService={localKayingCodeAgentService}
        remoteKayingCodeAgentService={remoteKayingCodeAgentService}
        remoteTarget={remoteTarget}
        skillWorkspacePath=""
        mcpWorkspacePath={selectedPath.trim()}
        pluginWorkspacePath={selectedPath.trim()}
        pluginLocalWorkspacePath={localWorkspacePath}
        mcpLocalWorkspacePath={localWorkspacePath}
        onSkillsSynced={async () => {
          await onSkillsSynced?.();
        }}
        onMcpSynced={async () => {
          await onMcpSynced?.();
        }}
        onPluginsSynced={async () => {
          await onPluginsSynced?.();
        }}
      />
    </div>
  );
}
