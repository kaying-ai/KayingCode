/* eslint-disable max-lines -- 项目侧栏组合 owner 需要同时编排视图、项目行、分组视图与项目菜单动作；拆分前须先抽出项目行容器。 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderPlus, Plug } from "lucide-react";
import { TID_SIDEBAR } from "@zcode/shared/test-ids";
import { SidebarTooltipProvider } from "@/ControlHintTooltip.js";
import { ScrollFadeViewport } from "@/components/ui/scroll-fade-viewport.js";
import { toast } from "@/components/ui/toast.js";
import { GameFeatureNavigation } from "@/game-features/GameFeatureNavigation.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useIsOfficeMode } from "@/hooks/useInterfaceMode.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import { setPendingSettingsSectionIntent } from "@/lib/settingsNavigation.js";
import type {
  ProjectRowAction,
  ProjectSidebarProps,
  ProjectTask,
  RemoteProjectHost,
  SidebarFileTreeTarget,
  VirtualProject,
} from "@/project-sidebar/contract.js";
import {
  buildRemoteHostWorkspaceIdentity,
  remoteHostIdFromWorkspaceIdentity,
} from "@/project-sidebar/contract.js";
import { ProjectNode } from "@/project-sidebar/ProjectNode.js";
import type { ProjectNodeProps } from "@/project-sidebar/ProjectNodeContent.js";
import { useProjectDirectory } from "@/project-sidebar/ProjectDirectoryProvider.js";
import { ProjectSidebarListHeader } from "@/project-sidebar/ProjectSidebarListHeader.js";
import { ProjectSidebarNavigation } from "@/project-sidebar/ProjectSidebarNavigation.js";
import { ProjectTaskListContext } from "@/project-sidebar/ProjectTaskListContext.js";
import { ProjectTaskRows } from "@/project-sidebar/ProjectTaskRows.js";
import { ProjectSections } from "@/project-sidebar/ProjectSections.js";
import {
  ProjectDragContext,
  SortableProjects,
  resolveProjectDrop,
} from "@/project-sidebar/SortableProjects.js";
import { TaskGroupedView } from "@/project-sidebar/TaskGroupedView.js";
import { HomeOnlyWorkspaceRows } from "@/project-sidebar/HomeOnlyWorkspaceRows.js";
import { useProjectConnectionDiagnostics } from "@/project-sidebar/useProjectConnectionDiagnostics.js";
import { useProjectFileTree } from "@/project-sidebar/useProjectFileTree.js";
import { useProjectPinIntent } from "@/project-sidebar/useProjectPinIntent.js";
import { useProjectRemoteSync } from "@/project-sidebar/useProjectRemoteSync.js";
import { useProjectTaskNavigation } from "@/project-sidebar/useProjectTaskNavigation.js";
import {
  projectHasUnread,
  projectKey,
  projectSourceServerId,
  selectProjectRows,
} from "@/project-sidebar/view.js";
import { WorkspaceFileTree } from "@/WorkspaceFileTree.js";
import { WorkspaceSidebarFooter } from "@/WorkspaceSidebarFooter.js";
import { cn } from "@/components/lib/utils.js";
import { useKayingCodeSessionStore } from "@/store/kayingcodeSessionStore.js";
import { useTabStoreApi } from "@/store/TabStoreProvider.js";
import { useKayingCodeStore } from "@/store/StoreProvider.js";
import { taskGroupKey } from "@/project-sidebar/grouped-view.js";
import type { LocalePreference } from "@zcode/shared";
import type { Theme } from "@/useTheme.js";
import { ProjectCreation } from "@/project-sidebar/ProjectCreation.js";
import { ProjectEditor } from "@/project-sidebar/ProjectEditor.js";
import { RemoteProjectPicker } from "@/project-sidebar/RemoteProjectPicker.js";
import { requestRetainedRemoteProjectConnection } from "@/project-sidebar/remote-project-connection.js";

function resolvePrimaryRoot(project: VirtualProject): string | undefined {
  return project.roots.find((root) => root.isPrimary)?.rootPath ?? project.roots[0]?.rootPath;
}

interface ProjectSidebarRowProps {
  project: VirtualProject;
  remoteHost?: ProjectNodeProps["remoteHost"];
  deviceLabel?: string;
  diagnostics?: ProjectNodeProps["diagnostics"];
  expanded: boolean;
  tasks: ProjectTask[];
  hasUnread: boolean;
  availability?: ProjectNodeProps["availability"];
  isDesktop?: boolean;
  onSelect: ProjectSidebarProps["onSelectTask"];
  refresh(): Promise<void>;
  onExpandedChange(project: VirtualProject, expanded: boolean): void;
  onCreateTask(project: VirtualProject): void;
  onEdit(project: VirtualProject): void;
  onDelete(project: VirtualProject): void;
  onPin(project: VirtualProject): void;
  onMove(project: VirtualProject, task: Parameters<ProjectNodeProps["onMove"]>[0]): void;
  onConnect(project: VirtualProject): void;
  onRemoveEntry(project: VirtualProject): void;
  onOpenDeviceSettings?: (project: VirtualProject) => void;
  onViewFiles(project: VirtualProject, rootPath: string): Promise<void>;
  onBrowseRemoteProjects(project: VirtualProject): void;
  remoteActions: ProjectRowAction[];
}

const ProjectSidebarRow = memo(function ProjectSidebarRow({
  project,
  remoteHost,
  deviceLabel,
  diagnostics,
  expanded,
  tasks,
  hasUnread,
  availability,
  isDesktop,
  onSelect,
  refresh,
  onExpandedChange,
  onCreateTask,
  onEdit,
  onDelete,
  onPin,
  onMove,
  onConnect,
  onRemoveEntry,
  onOpenDeviceSettings,
  onViewFiles,
  onBrowseRemoteProjects,
  remoteActions,
}: ProjectSidebarRowProps) {
  const { intl } = useKayingCodeIntl();
  const msg = useCallback((id: string) => intl.formatMessage({ id: `project.${id}` }), [intl]);
  const entryId = availability?.entryId;
  const additionalActions: ProjectRowAction[] = [...remoteActions];
  if (remoteHost && remoteHost.connectionStatus !== "online" && availability?.online === false) {
    additionalActions.push({
      id: "connect",
      label: msg("connect"),
      icon: Plug,
      run: () => onConnect(project),
    });
  }
  // 已有远端项目通过同一 ProjectEditor 内的 picker 浏览；入口只对远端项目显示。
  if (remoteHost) {
    additionalActions.push({
      id: "add-existing-remote-project",
      label: msg("existingOnDeviceAction"),
      icon: FolderPlus,
      run: () => onBrowseRemoteProjects(project),
    });
  }
  return (
    <ProjectNode
      project={project}
      remoteHost={remoteHost}
      deviceLabel={deviceLabel}
      diagnostics={diagnostics}
      expanded={expanded}
      onExpandedChange={(value) => onExpandedChange(project, value)}
      tasks={tasks}
      hasUnread={hasUnread}
      availability={availability}
      additionalActions={additionalActions}
      onCreate={() => onCreateTask(project)}
      onEdit={() => onEdit(project)}
      onDelete={() => onDelete(project)}
      onPin={() => onPin(project)}
      onMove={(task) => onMove(project, task)}
      onViewFiles={(rootPath) => {
        void onViewFiles(project, rootPath);
      }}
      onSelect={onSelect}
      refresh={refresh}
      onRemoveEntry={entryId ? () => onRemoveEntry(project) : undefined}
      onOpenDeviceSettings={
        isDesktop && onOpenDeviceSettings ? () => onOpenDeviceSettings(project) : undefined
      }
    />
  );
});

/**
 * Shell 默认项目侧栏。目录、分组、未读和偏好全部来自 `ProjectDirectoryProvider`；
 * 本组件只组合导航、视图与项目行，不保存第二份项目事实。
 */
export const ProjectSidebar = memo(function ProjectSidebar(props: ProjectSidebarProps) {
  const directoryState = useProjectDirectory();
  const {
    tree,
    directory,
    availability,
    service,
    remoteService,
    refresh,
    error,
    loading,
    preferences,
    projects,
    groups,
    deviceNames,
  } = directoryState;
  const { intl, localePreference, setLocalePreference } = useKayingCodeIntl();
  const setTheme = useKayingCodeStore((state) => state.setTheme);
  const tabStore = useTabStoreApi();
  const confirm = useConfirmDialog();
  const isOfficeMode = useIsOfficeMode();
  const { tree: displayTree, pin } = useProjectPinIntent(tree);
  const diagnostics = useProjectConnectionDiagnostics(directory, props);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [groupedToolbar, setGroupedToolbar] = useState<HTMLDivElement | null>(null);
  const [groupedSticky, setGroupedSticky] = useState<HTMLDivElement | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<VirtualProject | null>(null);
  const [remotePicker, setRemotePicker] = useState<RemoteProjectHost | null>(null);
  const [fileTreeTarget, setFileTreeTarget] = useState<SidebarFileTreeTarget | null>(null);
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(false);
  const msg = useCallback((id: string) => intl.formatMessage({ id: `project.${id}` }), [intl]);
  // 文件树面板沿用旧侧栏的滑动层 owner；外部请求仍由 Shell 的 `fileTreeOpenRequest`
  // 递增序号，hook 只消费一次，不能把 onOpenFileManager 再接回请求 setter。
  const handleOpenFileManager = useCallback((target: SidebarFileTreeTarget) => {
    setFileTreeTarget(target);
    setIsFileTreeOpen(true);
  }, []);
  const fileTreeProps = useMemo(
    () => ({ ...props, onOpenFileManager: handleOpenFileManager }),
    [handleOpenFileManager, props],
  );
  const { openFiles, openTaskFiles } = useProjectFileTree(fileTreeProps, directory, remoteService);
  useEffect(() => {
    props.onFileTreeOpenChange?.(isFileTreeOpen);
  }, [isFileTreeOpen, props.onFileTreeOpenChange]);
  useEffect(() => () => props.onFileTreeOpenChange?.(false), [props.onFileTreeOpenChange]);
  // 远程任务的读取与同步菜单只适配既有 attachment，不创建 tab 或连接。
  const remoteSync = useProjectRemoteSync(props, directory);
  const selectTask = useProjectTaskNavigation(props, tree, remoteService);

  const run = useCallback(
    (body: () => Promise<void>) =>
      body().catch((cause: unknown) => {
        logger.error("[project-sidebar] 操作失败", cause);
        toast(cause instanceof Error ? cause.message : String(cause));
      }),
    [],
  );

  const openSettings = useCallback(() => {
    tabStore.getState().openSettingsTab();
  }, [tabStore]);

  const openDeviceSettings = useCallback(() => {
    setPendingSettingsSectionIntent("remoteDevices");
    tabStore.getState().openSettingsTab();
  }, [tabStore]);

  const inheritedTaskGroupId = useCallback((): string | null => {
    if (preferences.view !== "grouped") return null;
    const workspace = useKayingCodeSessionStore
      .getState()
      .getWorkspaceState(props.workspacePath, props.workspaceIdentity);
    if (workspace.draftTaskGroupId !== undefined) return workspace.draftTaskGroupId;
    if (!workspace.activeTaskId) return null;
    return (
      groups.parents.get(
        taskGroupKey({
          taskId: workspace.activeTaskId,
          workspacePath: props.workspacePath,
          workspaceIdentity: props.workspaceIdentity,
        }),
      ) ?? null
    );
  }, [groups.parents, preferences.view, props.workspaceIdentity, props.workspacePath]);

  const startNewTask = useCallback(
    (project?: VirtualProject, taskGroupId?: string | null) => {
      const root = project ? resolvePrimaryRoot(project) : undefined;
      const identity =
        project && project.hostId !== "local" && root
          ? buildRemoteHostWorkspaceIdentity(project.hostId, root)
          : undefined;
      props.onCreateTask({
        projectId: project ? project.id : null,
        taskGroupId: taskGroupId === undefined ? inheritedTaskGroupId() : taskGroupId,
        ...(root
          ? {
              targetWorkspace: {
                workspacePath: root,
                ...(identity ? { workspaceIdentity: identity } : {}),
              },
            }
          : {}),
      });
    },
    [inheritedTaskGroupId, props.onCreateTask],
  );

  const changeExpanded = useCallback(
    (project: VirtualProject, expanded: boolean) => preferences.setExpanded(project, expanded),
    [preferences],
  );

  const createProjectTask = useCallback(
    (project: VirtualProject) => startNewTask(project, null),
    [startNewTask],
  );

  const deleteProject = useCallback(
    (project: VirtualProject) => {
      run(async () => {
        if (!service) throw new Error("project.service-unavailable");
        const confirmed = await confirm({
          title: msg("delete"),
          description: project.name,
          confirmLabel: msg("delete"),
          cancelLabel: msg("cancel"),
          confirmVariant: "destructive",
        });
        if (!confirmed) return;
        await service.deleteProject(project.id, project.hostId);
        await refresh();
      });
    },
    [confirm, msg, refresh, run, service],
  );

  const pendingProjectPins = useRef(new Set<string>());
  const setProjectPinned = useCallback(
    (project: VirtualProject, pinned: boolean) => {
      const key = projectKey(project);
      // 修复依据：菜单和跨区拖拽共用 Host 写入；同项目在刷新完成前只接纳一次。
      if (project.pinned === pinned || pendingProjectPins.current.has(key)) return;
      pendingProjectPins.current.add(key);
      void run(async () => {
        try {
          if (!service) throw new Error("project.service-unavailable");
          await service.saveProject({ id: project.id, hostId: project.hostId, pinned });
          await refresh();
        } finally {
          pendingProjectPins.current.delete(key);
        }
      });
    },
    [refresh, run, service],
  );
  const pinProject = useCallback(
    (project: VirtualProject) => setProjectPinned(project, !project.pinned),
    [setProjectPinned],
  );

  const moveTaskToProject = useCallback(
    (project: VirtualProject, task: Parameters<ProjectNodeProps["onMove"]>[0]) => {
      run(async () => {
        if (!service) throw new Error("project.service-unavailable");
        try {
          await service.moveTask({
            task,
            projectId: project.id,
            hostId: project.hostId,
          });
        } catch (cause) {
          const text = String(cause);
          const needsRootConfirmation =
            text.includes("project.root-confirmation-required") ||
            text.includes("project.cwd-not-in-roots");
          if (project.hostId !== "local" || !needsRootConfirmation) throw cause;
          const confirmed = await confirm({
            title: msg("addFolder"),
            description: task.workspacePath,
            confirmLabel: msg("add"),
            cancelLabel: msg("cancel"),
          });
          if (!confirmed) return;
          await service.moveTask({
            task,
            projectId: project.id,
            hostId: project.hostId,
            addMissingRoot: true,
          });
        }
        await refresh();
      });
    },
    [confirm, msg, refresh, run, service],
  );

  const connectProject = useCallback(
    (project: VirtualProject) => {
      run(async () => {
        if (!remoteService) throw new Error("remote-project.service-unavailable");
        const root = resolvePrimaryRoot(project);
        if (!root) throw new Error("project.root-not-found");
        // Host continue 仍走既有重连入口；server 目标直接 connectHost，保留原错误语义。
        await requestRetainedRemoteProjectConnection({
          workspaceKey: buildRemoteHostWorkspaceIdentity(project.hostId, root),
          service: remoteService,
          reconnect: props.onReconnectRemoteWorkspace,
        });
        await refresh();
      });
    },
    [props.onReconnectRemoteWorkspace, refresh, remoteService, run],
  );

  const removeEntry = useCallback(
    (project: VirtualProject) => {
      run(async () => {
        const entryId = availability.get(projectKey(project))?.entryId;
        if (!entryId || !remoteService) throw new Error("remote-project.entry-not-found");
        await remoteService.removeEntry(entryId);
        await refresh();
      });
    },
    [availability, refresh, remoteService, run],
  );

  const reorder = useCallback(
    (active: string, over: string) => {
      const drop = resolveProjectDrop(projects, active, over);
      if (!drop) return;
      const { source, target, pinned } = drop;
      if (source.pinned !== pinned) {
        setProjectPinned(source, pinned);
        return;
      }
      if (!target) return;
      preferences.reorder(
        projects.filter((item) => item.pinned === source.pinned),
        active,
        over,
      );
    },
    [preferences, projects, setProjectPinned],
  );

  const browseRemoteProjects = useCallback(
    (project: VirtualProject) => {
      const host = directory.hosts.find((item) => item.id === project.hostId);
      if (host) setRemotePicker(host);
    },
    [directory.hosts],
  );

  const openProjectFiles = useCallback(
    (project: VirtualProject, rootPath: string) => run(() => openFiles(project, rootPath)),
    [openFiles, run],
  );

  const taskPresentation = useMemo(
    () => ({
      isWebRemoteControl: props.isWebRemoteControl,
      activeWorkspaceKey: props.workspaceIdentity?.trim() || props.workspacePath,
      onPin: pin,
      onOpenTaskFiles: openTaskFiles,
    }),
    [openTaskFiles, pin, props.isWebRemoteControl, props.workspaceIdentity, props.workspacePath],
  );

  const renderProject = useCallback(
    (project: VirtualProject) => (
      <ProjectSidebarRow
        key={projectKey(project)}
        project={project}
        remoteHost={directory.hosts.find((host) => host.id === project.hostId)}
        deviceLabel={deviceNames.get(projectSourceServerId(project) ?? "")}
        diagnostics={diagnostics.get(project.hostId)}
        expanded={preferences.isExpanded(project)}
        tasks={selectProjectRows(displayTree, {
          kind: "project",
          projectId: project.id,
          hostId: project.hostId,
        })}
        hasUnread={projectHasUnread(displayTree, project)}
        availability={availability.get(projectKey(project))}
        isDesktop={props.isDesktop}
        onSelect={selectTask}
        refresh={refresh}
        onExpandedChange={changeExpanded}
        onCreateTask={createProjectTask}
        onEdit={setEditing}
        onDelete={deleteProject}
        onPin={pinProject}
        onMove={moveTaskToProject}
        onConnect={connectProject}
        onRemoveEntry={removeEntry}
        onOpenDeviceSettings={openDeviceSettings}
        onViewFiles={openProjectFiles}
        onBrowseRemoteProjects={browseRemoteProjects}
        remoteActions={remoteSync.actions(project)}
      />
    ),
    [
      availability,
      browseRemoteProjects,
      changeExpanded,
      connectProject,
      createProjectTask,
      deleteProject,
      deviceNames,
      diagnostics,
      displayTree,
      moveTaskToProject,
      openDeviceSettings,
      openProjectFiles,
      pinProject,
      preferences,
      props.isDesktop,
      remoteSync.actions,
      selectTask,
      refresh,
      removeEntry,
    ],
  );

  if (!service) {
    return (
      <aside
        data-testid={TID_SIDEBAR}
        className="flex h-full min-h-0 flex-col items-center justify-center px-4 text-center text-ui-sm text-foreground-subtle"
      >
        {msg("connectionUnavailable")}
      </aside>
    );
  }

  const pinnedProjects = projects.filter((project) => project.pinned);
  const expandableProjects = projects.filter(
    (project) => availability.get(projectKey(project))?.online !== false,
  );
  const hasExpandedProjects = expandableProjects.some(preferences.isExpanded);
  const homeOnlySwitcher = props.isWebRemoteControl
    ? props.webRemoteControlWorkspaceSwitcher
    : undefined;
  const view = preferences.view;

  return (
    <ProjectTaskListContext.Provider value={taskPresentation}>
      <SidebarTooltipProvider>
        <aside data-testid={TID_SIDEBAR} className="flex h-full min-h-0 flex-col overflow-hidden">
          <div
            className={`h-12 shrink-0 [app-region:drag] ${props.isWebRemoteControl ? "max-md:hidden" : ""}`}
          />
          <div className="relative min-h-0 flex-1 overflow-clip">
            <div
              data-project-sidebar-panel="navigation"
              className={cn(
                "absolute inset-0 flex min-h-0 flex-col transition-transform duration-200 ease-out",
                isFileTreeOpen && "pointer-events-none -translate-x-full",
              )}
              aria-hidden={isFileTreeOpen}
            >
              <ProjectSidebarNavigation
                props={props}
                onCreate={() => startNewTask(undefined, undefined)}
              />
              {!isOfficeMode && props.onOpenGameFeature ? (
                <div className="flex flex-col gap-1 px-2 pb-2">
                  <GameFeatureNavigation
                    page={props.gameFeaturePage ?? null}
                    onNavigate={props.onOpenGameFeature}
                  />
                </div>
              ) : null}
              <ProjectDragContext onDrop={reorder}>
                <div
                  data-testid="sidebar-task-list-region"
                  className="flex min-h-0 flex-1 flex-col border-t border-border/50 pt-3 [anchor-name:--sidebar-task-list-divider]"
                >
                  <ProjectSidebarListHeader
                    onOpenCommandCenter={props.onOpenCommandCenter}
                    view={view}
                    onViewChange={preferences.setView}
                    groupedActionsRef={setGroupedToolbar}
                  />
                  <div className="relative flex min-h-0 flex-1 flex-col">
                    <div ref={setGroupedSticky} />
                    <ScrollFadeViewport ref={scrollRef} className="overflow-x-hidden">
                      <div className="flex flex-col gap-3 pb-3">
                        {homeOnlySwitcher ? (
                          <HomeOnlyWorkspaceRows switcher={homeOnlySwitcher} />
                        ) : view === "projects" ? (
                          <>
                            <ProjectTaskRows
                              kind="pinned"
                              tasks={selectProjectRows(displayTree, { kind: "pinned" })}
                              onSelect={selectTask}
                              refresh={refresh}
                            />
                            <SortableProjects
                              projects={pinnedProjects}
                              renderProject={renderProject}
                            />
                            <ProjectSections
                              tree={displayTree}
                              projects={projects}
                              directory={directory}
                              renderProject={renderProject}
                              loading={loading}
                              onSelect={selectTask}
                              refresh={refresh}
                              onCreate={() => startNewTask(undefined, undefined)}
                              onAddProject={() => setCreating(true)}
                              hasExpandedProjects={hasExpandedProjects}
                              canToggleProjects={expandableProjects.length > 0}
                              onToggleProjects={() =>
                                preferences.setAllExpanded(expandableProjects, !hasExpandedProjects)
                              }
                            />
                          </>
                        ) : view === "grouped" ? (
                          <>
                            <ProjectTaskRows
                              kind="pinned"
                              tasks={selectProjectRows(displayTree, { kind: "pinned" })}
                              onSelect={selectTask}
                              refresh={refresh}
                            />
                            <TaskGroupedView
                              tasks={displayTree.tasks}
                              onSelect={selectTask}
                              refresh={refresh}
                              scrollRef={scrollRef}
                              toolbarTarget={groupedToolbar}
                              stickyTarget={groupedSticky}
                              workspacePath={props.workspacePath}
                              workspaceIdentity={props.workspaceIdentity}
                              onOpenAutomations={props.onOpenAutomations}
                              onCreate={(groupId) => startNewTask(undefined, groupId)}
                            />
                          </>
                        ) : (
                          <ProjectTaskRows
                            key="timeline"
                            kind="timeline"
                            tasks={selectProjectRows(displayTree, { kind: "timeline" })}
                            onSelect={selectTask}
                            refresh={refresh}
                          />
                        )}
                        {loading && !homeOnlySwitcher ? (
                          <p className="px-4 text-ui-sm text-foreground-subtle">
                            {intl.formatMessage({ id: "common.loading" })}
                          </p>
                        ) : null}
                        {error && !homeOnlySwitcher ? (
                          <p role="alert" className="px-4 text-ui-sm text-destructive">
                            {error}
                          </p>
                        ) : null}
                      </div>
                    </ScrollFadeViewport>
                  </div>
                </div>
              </ProjectDragContext>
              <WorkspaceSidebarFooter
                className="pr-3"
                theme={props.theme}
                localeMenuValue={localePreference}
                onLocaleChange={(value) => setLocalePreference(value as LocalePreference)}
                onThemeChange={(value) => setTheme(value as Theme)}
                onSettingsButtonClick={openSettings}
                onLogin={props.onLogin}
                onLogout={props.onLogout}
                user={props.user}
                workspacePath={props.workspacePath}
                workspaceIdentity={props.workspaceIdentity}
                workspaceRemoteSessionId={props.workspaceRemoteSessionId}
                isDesktop={props.isDesktop}
              />
            </div>
            <div
              className={cn(
                "absolute inset-0 transition-transform duration-200 ease-out",
                isFileTreeOpen ? "translate-x-0" : "pointer-events-none translate-x-full",
              )}
              aria-hidden={!isFileTreeOpen}
            >
              {fileTreeTarget ? (
                <WorkspaceFileTree
                  workspacePath={fileTreeTarget.workspacePath}
                  workspaceName={fileTreeTarget.workspaceName}
                  workspaceIdentity={fileTreeTarget.workspaceIdentity}
                  workspaceRemoteSessionId={fileTreeTarget.workspaceRemoteSessionId}
                  revealPath={fileTreeTarget.revealPath}
                  temporaryExternalDirectory={fileTreeTarget.temporaryExternalDirectory}
                  canOpenLocalFileManager={props.isDesktop}
                  activePreviewPath={props.activePreviewPath}
                  onClose={() => setIsFileTreeOpen(false)}
                  onOpenBrowserUrl={props.isDesktop ? props.onOpenBrowserUrl : undefined}
                  onOpenPreview={(source) => {
                    // 文件树可以查看非当前 workspace 的文件；预览 source 保留自身 scope。
                    props.onOpenCodeViewer?.({
                      ...source,
                      workspacePath: fileTreeTarget.workspacePath,
                      workspaceIdentity: fileTreeTarget.workspaceIdentity,
                      workspaceRemoteSessionId: fileTreeTarget.workspaceRemoteSessionId,
                    });
                  }}
                />
              ) : null}
            </div>
          </div>
          {creating && remoteService ? (
            <ProjectCreation
              workspacePath={props.workspacePath}
              workspaceIdentity={props.workspaceIdentity}
              onCreateTask={props.onCreateTask}
              projects={tree.projects}
              directory={directory}
              service={service}
              remoteService={remoteService}
              defaultDeviceId={
                props.workspaceIdentity
                  ? (remoteHostIdFromWorkspaceIdentity(props.workspaceIdentity) ?? "local")
                  : "local"
              }
              // Root 已提供设备管理返回接缝；只有缺少 onOpenRemoteWorkspace 的宿主
              // （Web/旧 embedding）才隐藏入口，不能无条件关闭。
              allowDeviceManagement={Boolean(props.onOpenRemoteWorkspace)}
              onOpenRemoteWorkspace={props.onOpenRemoteWorkspace}
              onClose={() => setCreating(false)}
              onSaved={refresh}
            />
          ) : null}
          {editing ? (
            <ProjectEditor
              key={projectKey(editing)}
              project={editing}
              host={directory.hosts.find((host) => host.id === editing.hostId)}
              projects={tree.projects.filter(
                (project) => !availability.get(projectKey(project))?.entryId,
              )}
              service={service}
              onClose={() => setEditing(null)}
              onSaved={refresh}
              onDeleted={refresh}
            />
          ) : null}
          {remotePicker && remoteService ? (
            <RemoteProjectPicker
              key={remotePicker.membershipId}
              host={remotePicker}
              service={service}
              remoteService={remoteService}
              onClose={() => setRemotePicker(null)}
              onSaved={refresh}
            />
          ) : null}
          {remoteSync.dialog}
        </aside>
      </SidebarTooltipProvider>
    </ProjectTaskListContext.Provider>
  );
});
