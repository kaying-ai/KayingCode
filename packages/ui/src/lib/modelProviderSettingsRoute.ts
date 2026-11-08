import type { RemoteAgentTarget } from "@zcode/shared";

interface ModelProviderSettingsWorkspaceTab {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  remoteTarget?: unknown;
  remoteAgentTarget?: RemoteAgentTarget;
}

export interface ModelProviderSettingsRoute {
  authority: "local-host" | "workspace";
  workspacePath: string;
  connectivityWorkspacePath?: string;
  connectivityWorkspaceRequired: boolean;
}

/**
 * Provider Settings 的写入权威只由 workspace target 决定。Remote Agent
 * 自己拥有 ProviderConfigRuntime；受管远端仍保留 Local Host + provisioning 语义。
 */
export function resolveModelProviderSettingsRoute(params: {
  activeWorkspacePath?: string | null;
  captionWorkspacePath?: string | null;
  localConnectivityWorkspacePath?: string;
  activeWorkspaceTab?: ModelProviderSettingsWorkspaceTab | null;
}): ModelProviderSettingsRoute {
  const workspacePath =
    params.activeWorkspaceTab?.workspacePath ??
    params.activeWorkspacePath ??
    params.captionWorkspacePath ??
    "";
  const isRemoteAgent = Boolean(params.activeWorkspaceTab?.remoteAgentTarget);

  if (isRemoteAgent) {
    return {
      authority: "workspace",
      workspacePath,
      connectivityWorkspacePath: workspacePath || undefined,
      connectivityWorkspaceRequired: false,
    };
  }

  const isManagedRemoteWorkspace = Boolean(
    params.activeWorkspaceTab?.workspaceIdentity?.trim() ||
    params.activeWorkspaceTab?.remoteSessionId?.trim() ||
    params.activeWorkspaceTab?.remoteTarget,
  );

  return {
    authority: "local-host",
    workspacePath,
    connectivityWorkspacePath: params.localConnectivityWorkspacePath,
    connectivityWorkspaceRequired: isManagedRemoteWorkspace,
  };
}
