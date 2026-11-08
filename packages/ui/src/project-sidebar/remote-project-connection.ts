import type { RemoteConnectionOpenPreference } from "@/app-shell/types.js";
import type { IRemoteProjectService, RemoteProjectDirectory } from "@/project-sidebar/contract.js";
import {
  buildRemoteHostWorkspaceIdentity,
  buildServerRemoteWorkspaceIdentity,
} from "@/project-sidebar/contract.js";

function findEntryPath(directory: RemoteProjectDirectory, workspaceKey: string) {
  for (const entry of directory.entries) {
    const root = entry.roots.find(
      (candidate) =>
        buildRemoteHostWorkspaceIdentity(entry.hostId, candidate.rootPath) === workspaceKey,
    );
    if (root) return { entry, path: root.rootPath };
    if (
      entry.legacyWorkspace &&
      buildRemoteHostWorkspaceIdentity(entry.hostId, entry.legacyWorkspace.workspacePath) ===
        workspaceKey
    ) {
      return { entry, path: entry.legacyWorkspace.workspacePath };
    }
  }
  return null;
}

/** 最近目录不是新建请求；连接前固定已有入口，避免连接完成后误入创建器。 */
export function resolveRecentRemoteProjectPreference(
  directory: RemoteProjectDirectory,
  input: { sourceServerId: string; path: string; profileId?: string },
): RemoteConnectionOpenPreference | null {
  const identity = buildServerRemoteWorkspaceIdentity({
    serverId: input.sourceServerId,
    workspacePath: input.path,
  });
  const candidates = directory.entries.filter(
    (entry) =>
      directory.hosts.some((host) => host.id === entry.hostId) &&
      [...entry.roots.map((root) => root.rootPath), entry.legacyWorkspace?.workspacePath].some(
        (path) => path && buildRemoteHostWorkspaceIdentity(entry.hostId, path) === identity,
      ),
  );
  if (candidates.length !== 1) return null;
  return {
    ...(input.profileId
      ? { preferredProfileId: input.profileId }
      : { preferredSourceServerId: input.sourceServerId }),
    preferredDirectoryPath: input.path,
  };
}

/**
 * 项目成员不等于已打开 tab；重连仍交给 Host 的既有连接入口。
 * 只有 Host 成员快照里仍存在的入口才允许发起，避免移除后迟到的点击复活项目。
 */
export async function requestRetainedRemoteProjectConnection(input: {
  workspaceKey: string;
  service: IRemoteProjectService;
  reconnect(workspaceKey: string): Promise<void>;
  connectHost?(hostId: string): Promise<unknown>;
}): Promise<void> {
  const directory = await input.service.readDirectory();
  const located = findEntryPath(directory, input.workspaceKey);
  if (!located) throw new Error("remote-project.entry-not-found");
  const host = directory.hosts.find((candidate) => candidate.id === located.entry.hostId);
  if (!host) throw new Error("remote-project.entry-not-found");
  // Direct Server 不属于 Source Profile 管理域，保留其原有连接与错误出口。
  if (host.kind === "server") {
    await (input.connectHost ?? ((id: string) => input.service.connectHost(id)))(host.id);
    return;
  }
  const stillRetained = async () => {
    const current = await input.service.readDirectory();
    if (
      !current.hosts.some(
        (candidate) => candidate.id === host.id && candidate.membershipId === host.membershipId,
      )
    )
      return false;
    return Boolean(findEntryPath(current, input.workspaceKey));
  };
  // 连接可能等待较久；成员移除后不再提交导航/激活。
  await input.reconnect(input.workspaceKey);
  if (!(await stillRetained())) throw new Error("remote-project.host-removed");
}
