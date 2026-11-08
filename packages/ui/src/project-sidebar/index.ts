/**
 * project-sidebar 的本地公开入口。
 *
 * Shell 通过 `ProjectSidebar` + `ProjectDirectoryProvider` 使用完整侧栏；旧
 * `WorkspaceSidebar` 由 `KAYINGCODE_UI_SIDEBAR_V2=0` 回退。创建/编辑、远程项目选择与文件树入口已接入；
 * 设备管理返回结果仍需 Root 的远程向导提供接缝。
 *
 * 服务面：`useProjectDirectory` 读取窗口项目目录组；缺少 `projectService` 时 Shell 回退旧侧栏
 * （见 `lib/projectSidebarRuntime.ts`），组件本身只渲染空态，不伪造项目树。
 */
export { ProjectSidebar } from "@/project-sidebar/ProjectSidebar.js";
export { ProjectComposerMenu } from "@/project-sidebar/ProjectComposerMenu.js";
export { ProjectCreation } from "@/project-sidebar/ProjectCreation.js";
export { ProjectEditor } from "@/project-sidebar/ProjectEditor.js";
export { RemoteProjectPicker } from "@/project-sidebar/RemoteProjectPicker.js";
export { TaskGroupedView } from "@/project-sidebar/TaskGroupedView.js";
export {
  ProjectDirectoryProvider,
  useOptionalProjectDirectory,
  useProjectDirectory,
} from "@/project-sidebar/ProjectDirectoryProvider.js";
export { ProjectSections } from "@/project-sidebar/ProjectSections.js";
export { ProjectNode } from "@/project-sidebar/ProjectNode.js";
export { ProjectNodeContent } from "@/project-sidebar/ProjectNodeContent.js";
export { ProjectTaskRow, ProjectTaskRows } from "@/project-sidebar/ProjectTaskRows.js";
export { ProjectFolderIcon } from "@/project-sidebar/ProjectFolderIcon.js";
export { ProjectTaskListContext } from "@/project-sidebar/ProjectTaskListContext.js";
export { readProjectSidebarView } from "@/project-sidebar/view-preference.js";
export {
  countProjectTreeUnreadTasks,
  projectHasUnread,
  projectKey,
  projectSourceServerId,
  selectProjectRows,
  selectSortedProjects,
} from "@/project-sidebar/view.js";
export { readProjectSidebarTree } from "@/project-sidebar/project-tree-reader.js";
export { resolveRemoteOperationProgress } from "@/project-sidebar/remoteOperationProgress.js";
export * from "@/project-sidebar/contract.js";
export type { ProjectNodeProps } from "@/project-sidebar/ProjectNodeContent.js";
