export interface RecentProject {
  accountId: string;
  workspacePath: string;
  workspaceIdentity?: string;
  deviceSid?: string;
  lastUsedAt: number;
}
export function projectKey(
  p: Pick<RecentProject, "accountId" | "workspacePath" | "workspaceIdentity" | "deviceSid">,
): string {
  return JSON.stringify([
    p.accountId,
    p.deviceSid ?? "",
    p.workspaceIdentity?.trim() || p.workspacePath,
  ]);
}

export function groupRecentProjects(
  projects: readonly RecentProject[],
): Map<string, RecentProject[]> {
  const groups = new Map<string, RecentProject[]>();
  const seen = new Set<string>();
  for (const project of [...projects].sort((a, b) => b.lastUsedAt - a.lastUsedAt)) {
    // 同一个 Windows 目录可能由网页分别上报正反斜杠。列表只折叠显示，导航仍使用原始键。
    if (!project.workspaceIdentity?.trim() && /^[a-z]:[\\/]/i.test(project.workspacePath)) {
      const workspacePath = project.workspacePath.replace(/\\/g, "/");
      const displayKey = projectKey({ ...project, workspacePath });
      if (seen.has(displayKey)) continue;
      seen.add(displayKey);
    }
    const group = groups.get(project.accountId);
    if (group) group.push(project);
    else groups.set(project.accountId, [project]);
  }
  return groups;
}
export function parseProjectMessage(
  value: unknown,
): Pick<RecentProject, "workspacePath" | "workspaceIdentity" | "deviceSid"> | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (
    p.type !== "kayingcode.project-opened.v1" ||
    typeof p.workspacePath !== "string" ||
    !p.workspacePath.trim() ||
    p.workspacePath.length > 8192
  )
    return null;
  if (
    p.workspaceIdentity !== undefined &&
    (typeof p.workspaceIdentity !== "string" || p.workspaceIdentity.length > 8192)
  )
    return null;
  if (
    p.deviceSid !== undefined &&
    (typeof p.deviceSid !== "string" || !p.deviceSid || p.deviceSid.length > 512)
  )
    return null;
  return {
    ...(typeof p.deviceSid === "string" ? { deviceSid: p.deviceSid } : {}),
    workspacePath: p.workspacePath,
    ...(typeof p.workspaceIdentity === "string" && p.workspaceIdentity.trim()
      ? { workspaceIdentity: p.workspaceIdentity.trim() }
      : {}),
  };
}

/** 小程序基础库不保证 URL/URLSearchParams；仅改外壳参数，不改授权 fragment。 */
export function webviewEntryUrl(raw: string, values: Record<string, string | undefined>): string {
  const index = raw.indexOf("#");
  const fragment = index < 0 ? "" : raw.slice(index);
  const base = index < 0 ? raw : raw.slice(0, index);
  const queryAt = base.indexOf("?");
  const path = queryAt < 0 ? base : base.slice(0, queryAt);
  const query =
    queryAt < 0
      ? []
      : base
          .slice(queryAt + 1)
          .split("&")
          .filter(
            (pair) =>
              !Object.entries(values).some(
                ([key, value]) =>
                  value !== undefined && key === decodeURIComponent(pair.split("=")[0] ?? ""),
              ),
          );
  for (const [key, value] of Object.entries(values))
    if (value !== undefined) query.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return `${path}?${query.join("&")}${fragment}`;
}
