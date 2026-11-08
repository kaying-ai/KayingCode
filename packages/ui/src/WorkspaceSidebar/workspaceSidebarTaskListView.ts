import type { SidebarTaskOrganizeBy } from "@/lib/sidebarTaskPreferences.js";

/** 侧栏任务区头部暴露的三个视图；与持久化的 organizeBy 一一对应。 */
export type WorkspaceSidebarTaskListView = "projects" | "grouped" | "timeline";

const VIEW_BY_ORGANIZE: Record<SidebarTaskOrganizeBy, WorkspaceSidebarTaskListView> = {
  project: "projects",
  grouped: "grouped",
  chronological: "timeline",
};

const ORGANIZE_BY_VIEW: Record<WorkspaceSidebarTaskListView, SidebarTaskOrganizeBy> = {
  projects: "project",
  grouped: "grouped",
  timeline: "chronological",
};

export function resolveWorkspaceSidebarTaskListView(
  organizeBy: SidebarTaskOrganizeBy,
): WorkspaceSidebarTaskListView {
  return VIEW_BY_ORGANIZE[organizeBy];
}

export function resolveSidebarTaskOrganizeByForView(
  view: WorkspaceSidebarTaskListView,
): SidebarTaskOrganizeBy {
  return ORGANIZE_BY_VIEW[view];
}
