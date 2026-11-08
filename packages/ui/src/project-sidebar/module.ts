/**
 * project-sidebar 模块清单（architecture-governance managed 模块）。
 * 层：ui。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 *
 * Shell 默认使用 `ProjectSidebar`；旧 `WorkspaceSidebar` 保留为
 * `KAYINGCODE_UI_SIDEBAR_V2=0` 回退。创建/编辑、项目文件树与远程项目入口已接入；设备管理返回结果待 Root 向导接缝。
 */
export const projectSidebarModule = {
  id: "project-sidebar",
  requires: ["services", "shared", "ui"],
  provides: ["project-sidebar"],
  publicEntrypoints: [
    "index.ts",
    "ProjectSidebar.tsx",
    "ProjectComposerMenu.tsx",
    "ProjectCreation.tsx",
    "ProjectEditor.tsx",
    "RemoteProjectPicker.tsx",
    "remote-project-connection.ts",
    "useProjectFileTree.ts",
    "TaskGroupedView.tsx",
    "contract.ts",
    "ProjectDirectoryProvider.tsx",
    "ProjectSections.tsx",
    "ProjectNode.tsx",
    "ProjectTaskRows.tsx",
    "remoteOperationProgress.ts",
    "view.ts",
    "useSavedWorkflowProjectOptions.ts",
    "WorkspaceDragOverlay.tsx",
    "useRemoteProjectConnectionPresentation.ts",
    "OfflineRemoteProjectRows.tsx",
  ],
} as const;
