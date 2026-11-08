import type { ProjectTree } from "@zcode/services";
import {
  buildRemoteHostWorkspaceIdentity,
  parseRemoteWorkspaceIdentity,
  remoteHostIdFromWorkspaceIdentity,
} from "@zcode/shared";

function normalizeLocalPath(path: string): string {
  return /^[a-z]:[\\/]/i.test(path) ? path.replaceAll("\\", "/") : path;
}

export function selectMobileProjectTaskScope(tree: ProjectTree, workspaceKey: string) {
  const remoteHostId = remoteHostIdFromWorkspaceIdentity(workspaceKey);
  const hostId = remoteHostId ?? "local";
  const path = parseRemoteWorkspaceIdentity(workspaceKey)?.workspacePath ?? workspaceKey;
  const projects = tree.projects.filter((project) => project.hostId === hostId && !project.deleted);
  // Windows 存量项目可因斜杠不同拥有各自的项目 ID。先用 Host 核验过的原始键匹配，
  // 只有找不到精确记录时才兼容分隔符，避免把两个项目判成冲突或串读会话。
  const exact = projects.filter((project) =>
    project.roots.some(({ rootPath }) =>
      remoteHostId
        ? buildRemoteHostWorkspaceIdentity(remoteHostId, rootPath) === workspaceKey
        : rootPath === path,
    ),
  );
  const matches =
    !remoteHostId && exact.length === 0
      ? projects.filter((project) =>
          project.roots.some(
            ({ rootPath }) => normalizeLocalPath(rootPath) === normalizeLocalPath(path),
          ),
        )
      : exact;
  if (matches.length > 1) return null;
  const project = matches[0];
  const tasks = tree.tasks.filter(
    (task) =>
      task.hostId === hostId &&
      (project
        ? task.projectId === project.id
        : task.projectId == null &&
          (task.workspaceIdentity?.trim() || task.workspacePath) === workspaceKey),
  );
  const name = project?.name ?? path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
  return { hostId, name, project, tasks };
}
