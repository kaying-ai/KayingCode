interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface WorkspaceProjectIdentity {
  workspacePath: string;
  workspaceIdentity?: string;
}

const PINNED_PROJECT_KEYS_STORAGE_KEY = "kayingcode-sidebar-pinned-project-keys";

export const PINNED_PROJECT_DROP_ZONE_ID = "project-drop-zone:pinned";
export const REGULAR_PROJECT_DROP_ZONE_ID = "project-drop-zone:regular";
export const PINNED_PROJECT_SECTION_ID = "pinned-projects";
export const REGULAR_PROJECT_SECTION_ID = "projects";

export type ProjectPinDropTarget = "pinned" | "regular";

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getWorkspaceProjectKey(project: WorkspaceProjectIdentity): string {
  return project.workspaceIdentity?.trim() || project.workspacePath;
}

export function readPinnedProjectKeys(
  storage: StorageLike | null = getBrowserStorage(),
): Set<string> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(PINNED_PROJECT_KEYS_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
      return new Set();
    }
    return new Set(parsed.map((value) => value.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

export function persistPinnedProjectKeys(
  projectKeys: ReadonlySet<string>,
  storage: StorageLike | null = getBrowserStorage(),
) {
  try {
    const normalized = [...projectKeys].map((key) => key.trim()).filter(Boolean);
    storage?.setItem(PINNED_PROJECT_KEYS_STORAGE_KEY, JSON.stringify([...new Set(normalized)]));
  } catch {
    // 受限 WebView 或隐私模式可能禁止写 localStorage；失败时保留当前内存状态。
  }
}

export function partitionProjectTabsByPin<T extends WorkspaceProjectIdentity>(
  projects: readonly T[],
  pinnedProjectKeys: ReadonlySet<string>,
): { pinnedProjectTabs: T[]; regularProjectTabs: T[] } {
  const pinnedProjectTabs: T[] = [];
  const regularProjectTabs: T[] = [];
  for (const project of projects) {
    (pinnedProjectKeys.has(getWorkspaceProjectKey(project))
      ? pinnedProjectTabs
      : regularProjectTabs
    ).push(project);
  }
  return { pinnedProjectTabs, regularProjectTabs };
}

export function resolveProjectPinDropTarget({
  overId,
  pinnedProjectIds,
  regularProjectIds,
}: {
  overId: string | null;
  pinnedProjectIds: readonly string[];
  regularProjectIds: readonly string[];
}): ProjectPinDropTarget | null {
  if (!overId) return null;
  if (
    overId === PINNED_PROJECT_DROP_ZONE_ID ||
    overId === PINNED_PROJECT_SECTION_ID ||
    pinnedProjectIds.includes(overId)
  ) {
    return "pinned";
  }
  if (
    overId === REGULAR_PROJECT_DROP_ZONE_ID ||
    overId === REGULAR_PROJECT_SECTION_ID ||
    regularProjectIds.includes(overId)
  ) {
    return "regular";
  }
  return null;
}
