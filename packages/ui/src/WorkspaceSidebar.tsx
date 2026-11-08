/* eslint-disable max-lines -- 归档视图开关沿用现有 sidebar 结构，先保持同文件收口。 */
import { GameFeatureNavigation } from "@/game-features/GameFeatureNavigation.js";
import type { GameFeaturePage } from "@/lib/gameFeaturePages.js";
import { useIsOfficeMode } from "@/hooks/useInterfaceMode.js";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  Archive,
  Blocks,
  CalendarClock,
  Cloud,
  Folder,
  FolderOpen,
  Hash,
  Maximize2,
  MessageCirclePlus,
  Minimize2,
  Plus,
  X,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Locale, RemoteTarget, UserInfo, KayingCodeTaskMeta } from "@zcode/shared";
import { BUILTIN_MODEL_PROVIDER_IDS } from "@zcode/shared";
import {
  TID_CONVERSATION_NEW_TASK,
  TID_CONVERSATION_SECTION,
  TID_AUTOMATIONS_OPEN,
  TID_PROJECT_ADD,
  TID_PROJECT_SECTION,
  TID_SIDEBAR,
  TID_WORKSPACE_LIST,
} from "@zcode/shared";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import { NewTaskButtonGroup } from "@/NewTaskButtonGroup.js";
import {
  selectWorkspaceKayingCodeState,
  useKayingCodeSessionStore,
} from "@/store/kayingcodeSessionStore.js";
import { useKayingCodeStore } from "@/store/StoreProvider.js";
import { useTabStore } from "@/store/TabStoreProvider.js";
import { isWorkspaceReadOnly, isWorkspaceTab, type WorkspaceTabState } from "@/store/tabStore.js";
import { useWorkspaceTaskLists } from "@/hooks/useWorkspaceTaskLists.js";
import {
  persistSidebarTaskPreferences,
  readSidebarTaskPreferences,
  type SidebarTaskOrganizeBy,
  type SidebarTaskSortBy,
} from "@/lib/sidebarTaskPreferences.js";
import {
  persistSidebarPurposeSectionPreferences,
  readSidebarPurposeSectionPreferences,
  reorderSidebarPurposeSections,
  resolveConversationSectionExpanded,
} from "@/lib/sidebarPurposeSectionPreferences.js";
import { setPendingSettingsSectionIntent } from "@/lib/settingsNavigation.js";
import { buildTaskWorkspaceKey } from "@/lib/taskQueryCache.js";
import {
  increaseWorkspaceTaskVisibleLimit,
  resolveVisibleWorkspaceTaskKeys,
  retainWorkspaceTaskVisibleLimits,
  WORKSPACE_TASK_PAGE_SIZE,
  type WorkspaceTaskVisibleLimitByKey,
} from "@/lib/workspaceTaskPagination.js";
import { partitionWorkspaceTabsByPurpose } from "@/lib/workspacePurpose.js";
import {
  getWorkspaceProjectKey,
  PINNED_PROJECT_DROP_ZONE_ID,
  PINNED_PROJECT_SECTION_ID,
  partitionProjectTabsByPin,
  persistPinnedProjectKeys,
  readPinnedProjectKeys,
  REGULAR_PROJECT_DROP_ZONE_ID,
  REGULAR_PROJECT_SECTION_ID,
  resolveProjectPinDropTarget,
} from "@/lib/workspaceProjectPinning.js";
import {
  areAllGroupedTaskGroupsExpanded,
  pruneCollapsedGroupedTaskGroupIds,
} from "@/workspace-grouped-tasks/shared.js";
import {
  persistGroupedTaskCollapsedGroupIds,
  readGroupedTaskCollapsedGroupIds,
} from "@/lib/groupedTaskExpansionPreference.js";
import type { Theme } from "@/useTheme.js";
import type { RemoteConnectionLogEntry } from "@/hooks/useRemoteConnectionLogs.js";
import type { CodeViewerSource } from "@/lib/codeViewer.js";
import { WorkspaceFileTree } from "@/WorkspaceFileTree.js";
import { WorkspaceArchivedTasksFlatSection } from "@/WorkspaceArchivedTasksFlatSection.js";
import { WorkspaceSidebarFooter } from "@/WorkspaceSidebarFooter.js";
import { WorkspaceTimelineTasksSection } from "@/WorkspaceTimelineTasksSection.js";
import { WorkspaceGroupedTasksSection } from "@/WorkspaceGroupedTasksSection.js";
import { StickyGroupHeaderSlot } from "@/workspace-grouped-tasks/sticky-group-header-slot.js";
import type { CreateTaskRequest } from "@/app-shell/types.js";
import { restrictSidebarDrag, SortableWorkspaceSidebarItem } from "./SortableWorkspaceSidebar.js";
import { WorkspaceSidebarItem } from "@/WorkspaceSidebarItem.js";
import {
  resolveSidebarTaskGroupTogglePresentation,
  type SidebarTaskGroupTogglePresentation,
} from "@/WorkspaceSidebar/taskGroupTogglePresentation.js";
import { WorkspacePurposeSection } from "@/WorkspaceSidebar/WorkspacePurposeSection.js";
import { WorkspaceSidebarTaskListHeader } from "@/WorkspaceSidebar/WorkspaceSidebarTaskListHeader.js";
import {
  resolveSidebarTaskOrganizeByForView,
  resolveWorkspaceSidebarTaskListView,
  type WorkspaceSidebarTaskListView,
} from "@/WorkspaceSidebar/workspaceSidebarTaskListView.js";
import { cn } from "@/components/lib/utils.js";
import {
  resolveWorkspaceDragGlobalIndices,
  resolveWorkspaceDragExpanded,
  workspaceVerticalListSortingStrategy,
} from "@/lib/workspaceSidebarDrag.js";
import { createPortal } from "react-dom";

const sidebarCollisionDetection: CollisionDetection = (args) => {
  const activeType = args.active.data.current?.type;
  if (activeType !== "workspace-project" && activeType !== "purpose-section") {
    return closestCenter(args);
  }
  const allowedTypes =
    activeType === "workspace-project"
      ? new Set(["workspace-project", "project-section"])
      : new Set(["purpose-section"]);
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((container) =>
      allowedTypes.has(String(container.data.current?.type)),
    ),
  });
};

function WorkspaceNewTaskTooltip({
  children,
  disabledReason,
}: {
  children: ReactNode;
  disabledReason?: string;
}) {
  // 正常状态下按钮已带“新建任务”文案和快捷键，再挂 tooltip 只是重复；仅禁用时才解释原因。
  if (!disabledReason) return children;
  return (
    <ControlHintTooltip title={disabledReason}>
      <div>{children}</div>
    </ControlHintTooltip>
  );
}
export { applyWorkspaceTriggerSelection } from "@/WorkspaceSidebar/workspaceSidebarSelection.js";
export { WorkspaceSidebarCollapsedRail } from "@/WorkspaceSidebar/WorkspaceSidebarCollapsedRail.js";

type TaskOrganizeBy = SidebarTaskOrganizeBy;
type TaskSortBy = SidebarTaskSortBy;
type SidebarTaskViewMode = "grouped" | "workspace" | "timeline" | "archived";

interface SidebarFileTreeTarget {
  workspacePath: string;
  workspaceName: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
  revealPath?: string;
  temporaryExternalDirectory?: boolean;
}

// 流式 task 事件会让 sidebar 父级频繁刷新；缺任务分组时如果传新的 []
// 会让 memo 的 workspace 行误判 taskItems 变化，穿透到 TaskList/TaskListItem 重渲染。
const EMPTY_WORKSPACE_TASK_ITEMS: KayingCodeTaskMeta[] = [];
// WorkspaceSidebar 是 memo 组件，默认参数里的 {} 每次调用都会创建新引用；
// 缺省远程重连日志时必须复用同一个对象，避免浅比较被默认值打穿。
const EMPTY_RECONNECTING_REMOTE_WORKSPACE_LOGS_BY_WORKSPACE_KEY: Record<
  string,
  RemoteConnectionLogEntry[]
> = {};

function WorkspaceDragOverlay({ tab, width }: { tab: WorkspaceTabState; width: number | null }) {
  const isRemote = Boolean(tab.remoteSessionId || tab.remoteTarget || tab.workspaceIdentity);
  return (
    <div
      data-testid="workspace-drag-overlay"
      className="pointer-events-none flex cursor-grabbing items-center rounded-lg border border-border bg-background text-ui-base text-foreground shadow-lg h-8 px-2.5 gap-2 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0"
      style={width ? { width } : undefined}
    >
      {/* 项目列表图标位于 Button 内，运行态会被按钮 SVG 规则收敛为 14px；
          overlay 脱离 Button 后不再继承该规则，因此显式使用相同尺寸，避免 preview 图标放大。 */}
      {isRemote ? (
        <Cloud className="size-3.5 shrink-0 text-foreground-subtle" />
      ) : (
        <Folder className="size-3.5 shrink-0 text-foreground-subtle" />
      )}
      <span className="min-w-0 flex-1 truncate px-1">{tab.label}</span>
    </div>
  );
}

export interface SidebarFileTreeOpenRequest {
  id: number;
  target: SidebarFileTreeTarget;
}

function resolveSidebarTaskViewMode(params: {
  showArchivedTasks: boolean;
  taskOrganizeBy: TaskOrganizeBy;
}): SidebarTaskViewMode {
  if (params.showArchivedTasks) {
    return "archived";
  }
  if (params.taskOrganizeBy === "chronological") {
    return "timeline";
  }
  if (params.taskOrganizeBy === "grouped") {
    return "grouped";
  }
  return "workspace";
}

export const WorkspaceSidebar = memo(function WorkspaceSidebarComponent({
  workspacePath,
  workspaceRemoteSessionId,
  activePreviewPath,
  onSelectTask,
  onStartDraftInWorkspace,
  onOpenCodeViewer,
  onOpenBrowserUrl,
  fileTreeOpenRequest,
  onCreateTask,
  onCreateConversationTask,
  onOpenFolderFromWorkspaceMenu,
  onOpenRemoteWorkspace,
  theme,
  onConnectRemote: _onConnectRemote,
  onSelectRemoteProject: _onSelectRemoteProject,
  onCancelRemoteProject: _onCancelRemoteProject,
  onReconnectRemoteWorkspace,
  onLogout,
  onLogin,
  user,
  reconnectingRemoteWorkspaceKeys,
  remoteWorkspaceErrorByWorkspaceKey,
  reconnectingRemoteWorkspaceLogsByWorkspaceKey = EMPTY_RECONNECTING_REMOTE_WORKSPACE_LOGS_BY_WORKSPACE_KEY,
  isDesktop = false,
  isMacDesktop: _isMacDesktop = false,
  isWindowsDesktop = false,
  isSidebarVisible: _isSidebarVisible = true,
  onToggleSidebar: _onToggleSidebar,
  toggleSidebarShortcutLabel: _toggleSidebarShortcutLabel,
  canGoBack: _canGoBack = false,
  canGoForward: _canGoForward = false,
  onGoBack: _onGoBack,
  onGoForward: _onGoForward,
  goBackShortcutLabel: _goBackShortcutLabel,
  goForwardShortcutLabel: _goForwardShortcutLabel,
  onOpenAutomations,
  onOpenPluginStore,
  onOpenCommandCenter,
  automationsActive = false,
  gameFeaturePage = null,
  onOpenGameFeature,
  pluginStoreActive = false,
  onFileTreeOpenChange,
}: {
  workspacePath: string;
  workspaceRemoteSessionId?: string;
  activePreviewPath?: string | null;
  onSelectTask: (
    targetWorkspacePath: string,
    taskId: string,
    targetWorkspaceIdentity?: string,
    targetRemoteSessionId?: string,
    expectedUnreadAt?: number,
  ) => void;
  onStartDraftInWorkspace: (targetWorkspacePath: string, targetWorkspaceIdentity?: string) => void;
  onOpenCodeViewer?: (source: CodeViewerSource) => void;
  onOpenBrowserUrl?: (url: string) => void;
  fileTreeOpenRequest?: SidebarFileTreeOpenRequest | null;
  onCreateTask: (request?: CreateTaskRequest) => void;
  onCreateConversationTask: () => void;
  onOpenFolderFromWorkspaceMenu: () => void;
  onOpenRemoteWorkspace?: () => void;
  theme: Theme;
  onConnectRemote: (options: RemoteTarget, requestId?: string) => Promise<string>;
  onSelectRemoteProject: (
    sessionId: string,
    path: string,
    localWorkspacePath?: string,
  ) => Promise<void>;
  onCancelRemoteProject: (sessionId: string) => Promise<void>;
  onReconnectRemoteWorkspace: (workspaceKey: string) => Promise<void>;
  onLogout?: () => void;
  onLogin?: () => void;
  user?: UserInfo | null;
  reconnectingRemoteWorkspaceKeys: string[];
  remoteWorkspaceErrorByWorkspaceKey: Record<string, string>;
  reconnectingRemoteWorkspaceLogsByWorkspaceKey?: Record<string, RemoteConnectionLogEntry[]>;
  isDesktop?: boolean;
  isMacDesktop?: boolean;
  isWindowsDesktop?: boolean;
  isSidebarVisible?: boolean;
  onToggleSidebar?: () => void;
  toggleSidebarShortcutLabel?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
  goBackShortcutLabel?: string;
  goForwardShortcutLabel?: string;
  onOpenAutomations?: () => void;
  onOpenPluginStore?: () => void;
  onOpenCommandCenter?: () => void;
  automationsActive?: boolean;
  gameFeaturePage?: GameFeaturePage | null;
  onOpenGameFeature?: (page: GameFeaturePage) => void;
  pluginStoreActive?: boolean;
  onFileTreeOpenChange?: (open: boolean) => void;
}) {
  const { intl, localePreference, setLocalePreference } = useKayingCodeIntl();
  const handleTaskRowSelect = useCallback(
    (
      targetWorkspacePath: string,
      taskId: string,
      targetWorkspaceIdentity?: string,
      expectedUnreadAt?: number,
    ) => {
      // Shell 第四个参数是远程 session 路由，任务行的 unreadAt 不能复用该位置。
      // Sidebar 行选择显式留空 remoteSessionId，再把用户看到的未读版本传给已读事务。
      onSelectTask(
        targetWorkspacePath,
        taskId,
        targetWorkspaceIdentity,
        undefined,
        expectedUnreadAt,
      );
    },
    [onSelectTask],
  );
  const bumpTaskListVersion = useKayingCodeSessionStore((state) => state.bumpTaskListVersion);
  const workspaceIdentity = useTabStore((state) => {
    if (!state.activeTabId) {
      return undefined;
    }

    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (!activeTab || !isWorkspaceTab(activeTab) || activeTab.workspacePath !== workspacePath) {
      return undefined;
    }

    return activeTab.workspaceIdentity;
  });
  const workspaceReadOnly = useTabStore((state) =>
    isWorkspaceReadOnly(state, workspacePath, workspaceIdentity),
  );
  const workspaceReadOnlyReason = workspaceReadOnly
    ? intl.formatMessage({
        id: "workspaceSidebar.unavailableLocalDirectory",
      })
    : undefined;
  const setTheme = useKayingCodeStore((state) => state.setTheme);
  const tabs = useTabStore((state) => state.tabs);
  const isOfficeMode = useIsOfficeMode();
  const activateTab = useTabStore((state) => state.activateTab);
  const closeTab = useTabStore((state) => state.closeTab);
  const openSettingsTab = useTabStore((state) => state.openSettingsTab);
  const expandedWorkspacePaths = useTabStore((state) => state.expandedWorkspacePaths);
  const toggleWorkspaceExpanded = useTabStore((state) => state.toggleWorkspaceExpanded);
  const reorderWorkspaceTabs = useTabStore((state) => state.reorderWorkspaceTabs);
  const expandAllWorkspaceTabs = useTabStore((state) => state.expandAllWorkspaceTabs);
  const collapseAllWorkspaceTabs = useTabStore((state) => state.collapseAllWorkspaceTabs);

  const workspaceTabs = useMemo(() => tabs.filter(isWorkspaceTab), [tabs]);
  const { conversationWorkspaceTabs, projectWorkspaceTabs } = useMemo(
    () => partitionWorkspaceTabsByPurpose(workspaceTabs),
    [workspaceTabs],
  );
  const [pinnedProjectKeys, setPinnedProjectKeys] = useState(readPinnedProjectKeys);
  const { pinnedProjectTabs, regularProjectTabs } = useMemo(
    () => partitionProjectTabsByPin(projectWorkspaceTabs, pinnedProjectKeys),
    [pinnedProjectKeys, projectWorkspaceTabs],
  );
  const workspacePaths = useMemo(
    () => projectWorkspaceTabs.map((tab) => tab.workspacePath),
    [projectWorkspaceTabs],
  );
  const areAllWorkspaceGroupsExpanded = useMemo(
    () =>
      workspacePaths.length > 0 && workspacePaths.every((path) => expandedWorkspacePaths.has(path)),
    [expandedWorkspacePaths, workspacePaths],
  );
  const [showArchivedTasks, setShowArchivedTasks] = useState(false);
  const [archivedActionsContainer, setArchivedActionsContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(false);
  const [fileTreeTarget, setFileTreeTarget] = useState<SidebarFileTreeTarget | null>(null);
  const [groupedStickyHeader, setGroupedStickyHeader] = useState<ReactNode | null>(null);
  const [taskOrganizeBy, setTaskOrganizeBy] = useState<TaskOrganizeBy>(
    () => readSidebarTaskPreferences().organizeBy,
  );
  const [taskSortBy, setTaskSortBy] = useState<TaskSortBy>(
    () => readSidebarTaskPreferences().sortBy,
  );
  const [purposeSectionPreferences, setPurposeSectionPreferences] = useState(
    readSidebarPurposeSectionPreferences,
  );
  const conversationHasItemsRef = useRef<boolean | null>(null);
  const [workspaceTaskVisibleLimitByKey, setWorkspaceTaskVisibleLimitByKey] =
    useState<WorkspaceTaskVisibleLimitByKey>({});
  const [activeWorkspaceDragId, setActiveWorkspaceDragId] = useState<string | null>(null);
  const [activeWorkspaceDragWidth, setActiveWorkspaceDragWidth] = useState<number | null>(null);
  const [groupedTaskGroupIds, setGroupedTaskGroupIds] = useState<string[]>([]);
  const [groupedTaskGroupIdsHydrated, setGroupedTaskGroupIdsHydrated] = useState(false);
  const [lastNonEmptyGroupedTaskGroupIds, setLastNonEmptyGroupedTaskGroupIds] = useState<string[]>(
    [],
  );
  const [groupedTaskGroupSnapshotHasGroups, setGroupedTaskGroupSnapshotHasGroups] = useState<
    boolean | null
  >(null);
  const [collapsedGroupedTaskGroupIds, setCollapsedGroupedTaskGroupIds] = useState<Set<string>>(
    () => readGroupedTaskCollapsedGroupIds(),
  );
  const handleProjectSectionOpenChange = useCallback((projectsExpanded: boolean) => {
    setPurposeSectionPreferences((current) => {
      if (current.projectsExpanded === projectsExpanded) {
        return current;
      }
      const next = { ...current, projectsExpanded };
      persistSidebarPurposeSectionPreferences(next);
      return next;
    });
  }, []);
  const handlePinnedProjectSectionOpenChange = useCallback((pinnedProjectsExpanded: boolean) => {
    setPurposeSectionPreferences((current) => {
      if (current.pinnedProjectsExpanded === pinnedProjectsExpanded) return current;
      const next = { ...current, pinnedProjectsExpanded };
      persistSidebarPurposeSectionPreferences(next);
      return next;
    });
  }, []);
  const handleSetProjectPinned = useCallback((tab: WorkspaceTabState, pinned: boolean) => {
    const projectKey = getWorkspaceProjectKey(tab);
    setPinnedProjectKeys((current) => {
      if (current.has(projectKey) === pinned) return current;
      const next = new Set(current);
      if (pinned) next.add(projectKey);
      else next.delete(projectKey);
      // 菜单和跨段拖拽必须共用这一个持久化入口，避免视觉分段与本机偏好不同步。
      persistPinnedProjectKeys(next);
      return next;
    });
  }, []);
  const handleToggleProjectPinned = useCallback(
    (tab: WorkspaceTabState) => {
      handleSetProjectPinned(tab, !pinnedProjectKeys.has(getWorkspaceProjectKey(tab)));
    },
    [handleSetProjectPinned, pinnedProjectKeys],
  );
  const handleConversationSectionOpenChange = useCallback((conversationsExpanded: boolean) => {
    setPurposeSectionPreferences((current) => {
      if (current.conversationsExpanded === conversationsExpanded) {
        return current;
      }
      const next = { ...current, conversationsExpanded };
      persistSidebarPurposeSectionPreferences(next);
      return next;
    });
  }, []);
  const handleConversationContentStateChange = useCallback(
    ({ loading, hasItems }: { loading: boolean; hasItems: boolean }) => {
      if (loading) return;
      const previouslyHadItems = conversationHasItemsRef.current;
      conversationHasItemsRef.current = hasItems;
      setPurposeSectionPreferences((current) => {
        const conversationsExpanded = resolveConversationSectionExpanded({
          currentExpanded: current.conversationsExpanded,
          previousHasItems: previouslyHadItems,
          loading,
          hasItems,
        });
        if (current.conversationsExpanded === conversationsExpanded) return current;
        const next = { ...current, conversationsExpanded };
        persistSidebarPurposeSectionPreferences(next);
        return next;
      });
    },
    [],
  );
  const handlePurposeSectionDragEnd = useCallback((event: DragEndEvent) => {
    if (!event.over) {
      return;
    }

    setPurposeSectionPreferences((current) => {
      const sectionOrder = reorderSidebarPurposeSections(
        current.sectionOrder,
        String(event.active.id),
        String(event.over?.id),
      );
      if (sectionOrder.every((sectionId, index) => sectionId === current.sectionOrder[index])) {
        return current;
      }

      const next = { ...current, sectionOrder };
      persistSidebarPurposeSectionPreferences(next);
      return next;
    });
  }, []);
  const lastStableTaskGroupTogglePresentationRef =
    useRef<SidebarTaskGroupTogglePresentation | null>(null);
  const handleCollapsedGroupedTaskGroupIdsChange = useCallback(
    (updater: SetStateAction<Set<string>>) => {
      setCollapsedGroupedTaskGroupIds((currentGroupIds) => {
        const nextGroupIds = typeof updater === "function" ? updater(currentGroupIds) : updater;
        if (nextGroupIds === currentGroupIds) {
          return currentGroupIds;
        }
        // grouped 展开态是本端用户偏好，不能只保存在 React 内存里。
        // 单组点击、批量按钮、拖拽临时收起后的恢复都必须同步到 localStorage。
        persistGroupedTaskCollapsedGroupIds(nextGroupIds);
        return nextGroupIds;
      });
    },
    [],
  );
  const handleGroupedTaskGroupIdsChange = useCallback(
    (nextGroupIds: string[]) => {
      if (
        nextGroupIds.length === 0 &&
        !groupedTaskGroupIdsHydrated &&
        groupedTaskGroupSnapshotHasGroups !== false &&
        (lastNonEmptyGroupedTaskGroupIds.length > 0 || collapsedGroupedTaskGroupIds.size > 0)
      ) {
        // 从 Project 切回 Group 或重启后首进 Group 时，
        // 子列表首帧还没加载 sqlite view，会先回传空 groupIds。
        // 这个瞬时空快照不能当成“所有 group 已删除”，否则会把用户收起偏好
        // prune 成空并写回 localStorage。
        return;
      }

      setGroupedTaskGroupIdsHydrated(true);
      setGroupedTaskGroupSnapshotHasGroups(nextGroupIds.length > 0);
      if (nextGroupIds.length > 0) {
        setLastNonEmptyGroupedTaskGroupIds(nextGroupIds);
      }
      setGroupedTaskGroupIds((currentGroupIds) =>
        currentGroupIds.length === nextGroupIds.length &&
        currentGroupIds.every((groupId, index) => groupId === nextGroupIds[index])
          ? currentGroupIds
          : nextGroupIds,
      );
      setCollapsedGroupedTaskGroupIds((currentGroupIds) => {
        const nextCollapsedGroupIds = pruneCollapsedGroupedTaskGroupIds(
          currentGroupIds,
          nextGroupIds,
        );
        if (
          nextCollapsedGroupIds.size === currentGroupIds.size &&
          [...nextCollapsedGroupIds].every((groupId) => currentGroupIds.has(groupId))
        ) {
          return currentGroupIds;
        }
        // 刷新或重启后需要从 localStorage 恢复 grouped 展开态；
        // view 刷新时也要清掉已删除 group 的旧收起记录，避免新 group 被旧状态误命中。
        persistGroupedTaskCollapsedGroupIds(nextCollapsedGroupIds);
        return nextCollapsedGroupIds;
      });
    },
    [
      groupedTaskGroupIdsHydrated,
      groupedTaskGroupSnapshotHasGroups,
      collapsedGroupedTaskGroupIds.size,
      lastNonEmptyGroupedTaskGroupIds.length,
    ],
  );

  useEffect(() => {
    if (!fileTreeOpenRequest) {
      return;
    }
    setFileTreeTarget(fileTreeOpenRequest.target);
    setIsFileTreeOpen(true);
  }, [fileTreeOpenRequest]);
  useEffect(() => {
    onFileTreeOpenChange?.(isFileTreeOpen);
  }, [isFileTreeOpen, onFileTreeOpenChange]);
  useEffect(() => {
    return () => onFileTreeOpenChange?.(false);
  }, [onFileTreeOpenChange]);
  useEffect(() => {
    persistSidebarTaskPreferences({
      organizeBy: taskOrganizeBy,
      sortBy: taskSortBy,
    });
  }, [taskOrganizeBy, taskSortBy]);
  const taskViewMode = resolveSidebarTaskViewMode({
    showArchivedTasks,
    taskOrganizeBy,
  });
  const effectiveTaskViewMode = taskViewMode;
  const visibleWorkspaceTaskKeys = useMemo(
    () =>
      resolveVisibleWorkspaceTaskKeys({
        enabled: effectiveTaskViewMode === "workspace",
        expandedWorkspacePaths,
        workspaces: [
          ...(purposeSectionPreferences.pinnedProjectsExpanded ? pinnedProjectTabs : []),
          ...(purposeSectionPreferences.projectsExpanded ? regularProjectTabs : []),
        ],
      }),
    [
      effectiveTaskViewMode,
      expandedWorkspacePaths,
      pinnedProjectTabs,
      purposeSectionPreferences.pinnedProjectsExpanded,
      purposeSectionPreferences.projectsExpanded,
      regularProjectTabs,
    ],
  );
  useEffect(() => {
    // 交互规则：分页进度只属于当前可见且已展开的 workspace。
    // 单组/项目区/全部收起、切换视图或移除 workspace 都通过同一可见集合清理，
    // 避免不同收起入口各自维护重置逻辑而出现遗漏。
    setWorkspaceTaskVisibleLimitByKey((current) =>
      retainWorkspaceTaskVisibleLimits(current, visibleWorkspaceTaskKeys),
    );
  }, [visibleWorkspaceTaskKeys]);
  useEffect(() => {
    if (taskViewMode !== "grouped") {
      setGroupedStickyHeader(null);
    }
  }, [taskViewMode]);
  const [createGroupedTaskGroupAction, setCreateGroupedTaskGroupAction] = useState<
    (() => void) | null
  >(null);
  const [createGroupedTaskDraftAction, setCreateGroupedTaskDraftAction] = useState<
    (() => void) | null
  >(null);
  const handleCreateGroupActionChange = useCallback((action: (() => void) | null) => {
    setCreateGroupedTaskGroupAction(() => action);
  }, []);
  const handleCreateDraftTaskActionChange = useCallback((action: (() => void) | null) => {
    setCreateGroupedTaskDraftAction(() => action);
  }, []);
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);
  const [showWorkspaceTopMask, setShowWorkspaceTopMask] = useState(false);
  const [showWorkspaceBottomMask, setShowWorkspaceBottomMask] = useState(false);
  const purposeSectionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const localeMenuValue = localePreference === "system" ? "system" : localePreference;
  const workspaceTaskLists = useWorkspaceTaskLists({
    workspaceTabs: projectWorkspaceTabs,
    activeWorkspacePath: workspacePath,
    activeWorkspaceIdentity: workspaceIdentity,
    sortBy: taskSortBy,
    visibleLimitByWorkspaceKey: workspaceTaskVisibleLimitByKey,
    defaultVisibleLimit: WORKSPACE_TASK_PAGE_SIZE,
  });
  const workspaceTaskGroupByKey = useMemo(
    () =>
      new Map(
        workspaceTaskLists.groups.map((group) => [
          buildTaskWorkspaceKey(group.workspacePath, group.workspaceIdentity),
          group,
        ]),
      ),
    [workspaceTaskLists.groups],
  );
  const handleShowMoreWorkspaceTasks = useCallback((workspaceKey: string) => {
    setWorkspaceTaskVisibleLimitByKey((current) =>
      increaseWorkspaceTaskVisibleLimit(current, workspaceKey),
    );
  }, []);
  const handleOpenWorkspaceFileTree = useCallback((target: SidebarFileTreeTarget) => {
    setFileTreeTarget(target);
    setIsFileTreeOpen(true);
  }, []);
  const workspaceScrollMaskStyle = useMemo<CSSProperties>(() => {
    const baseStyle: CSSProperties = { overflowAnchor: "none" };
    if (!showWorkspaceTopMask && !showWorkspaceBottomMask) {
      return baseStyle;
    }
    const topStop = showWorkspaceTopMask ? "transparent 0px, black 32px" : "black 0px, black 32px";
    const bottomStop = showWorkspaceBottomMask
      ? "black calc(100% - 32px), transparent 100%"
      : "black calc(100% - 32px), black 100%";

    return {
      ...baseStyle,
      // 这里直接对滚动容器应用 CSS mask，而不是盖一层 overlay。
      // 这样顶部和底部的渐隐都会作用在真实内容上，并且滚到边界时能立刻消失。
      WebkitMaskImage: `linear-gradient(to bottom, ${topStop}, ${bottomStop})`,
      maskImage: `linear-gradient(to bottom, ${topStop}, ${bottomStop})`,
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskSize: "100% 100%",
      maskSize: "100% 100%",
    };
  }, [showWorkspaceBottomMask, showWorkspaceTopMask]);

  const resetWorkspaceDrag = useCallback(() => {
    setActiveWorkspaceDragId(null);
    setActiveWorkspaceDragWidth(null);
  }, []);
  const handleWorkspaceDragStart = useCallback((event: DragStartEvent) => {
    setActiveWorkspaceDragId(String(event.active.id));
    setActiveWorkspaceDragWidth(event.active.rect.current.initial?.width ?? null);
  }, []);
  const handleWorkspaceDragCancel = useCallback(
    (_event: DragCancelEvent) => {
      resetWorkspaceDrag();
    },
    [resetWorkspaceDrag],
  );
  const handleWorkspaceDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      resetWorkspaceDrag();
      if (!over || active.id === over.id) {
        return;
      }

      // 项目拖拽只展示 project 子序列，但 tabStore 保存的是全量 workspace 顺序。
      // 直接混用两个索引会在 conversation workspace 存在时把项目落到错误位置。
      const indices = resolveWorkspaceDragGlobalIndices({
        activeId: String(active.id),
        overId: String(over.id),
        projectTabs: projectWorkspaceTabs,
        workspaceTabs,
      });
      if (indices) {
        reorderWorkspaceTabs(indices.fromIndex, indices.toIndex);
      }
    },
    [projectWorkspaceTabs, reorderWorkspaceTabs, resetWorkspaceDrag, workspaceTabs],
  );
  const handleSidebarDragStart = useCallback(
    (event: DragStartEvent) => {
      if (projectWorkspaceTabs.some((tab) => tab.id === String(event.active.id))) {
        handleWorkspaceDragStart(event);
      }
    },
    [handleWorkspaceDragStart, projectWorkspaceTabs],
  );
  const handleSidebarDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeProject = projectWorkspaceTabs.find((tab) => tab.id === String(event.active.id));
      if (!activeProject) {
        handlePurposeSectionDragEnd(event);
        return;
      }

      const target = resolveProjectPinDropTarget({
        overId: event.over ? String(event.over.id) : null,
        pinnedProjectIds: pinnedProjectTabs.map((tab) => tab.id),
        regularProjectIds: regularProjectTabs.map((tab) => tab.id),
      });
      if (target) {
        const isPinned = pinnedProjectKeys.has(getWorkspaceProjectKey(activeProject));
        const shouldPin = target === "pinned";
        if (isPinned !== shouldPin) {
          resetWorkspaceDrag();
          handleSetProjectPinned(activeProject, shouldPin);
          return;
        }
      }

      handleWorkspaceDragEnd(event);
    },
    [
      handlePurposeSectionDragEnd,
      handleSetProjectPinned,
      handleWorkspaceDragEnd,
      pinnedProjectKeys,
      pinnedProjectTabs,
      projectWorkspaceTabs,
      regularProjectTabs,
      resetWorkspaceDrag,
    ],
  );
  const activeWorkspaceDragTab = useMemo(
    () =>
      activeWorkspaceDragId
        ? (projectWorkspaceTabs.find((tab) => tab.id === activeWorkspaceDragId) ?? null)
        : null,
    [activeWorkspaceDragId, projectWorkspaceTabs],
  );

  const handleThemeChange = useCallback(
    (value: string) => {
      if (
        value === "light" ||
        value === "dark" ||
        value === "zai-light" ||
        value === "zai-dark" ||
        value === "system"
      ) {
        setTheme(value);
      }
    },
    [setTheme],
  );

  const handleLocaleChange = useCallback(
    (value: string) => {
      if (value === "system") {
        setLocalePreference("system");
        return;
      }
      if (value === "zh-CN" || value === "en-US") {
        setLocalePreference(value as Locale);
      }
    },
    [setLocalePreference],
  );

  const handleOpenPluginStoreMain = useCallback(() => {
    onOpenPluginStore?.();
  }, [onOpenPluginStore]);
  const handleOpenAutomationsMain = useCallback(() => {
    onOpenAutomations?.();
  }, [onOpenAutomations]);
  const activeTaskId = useKayingCodeSessionStore(
    (state) =>
      // Web 远程控制从全局 task 入口进入远端 workspace 时，会先按
      // workspaceIdentity 写入 activeTaskId；如果侧栏仍然只读 path-only 桶，
      // 当前任务高亮会丢失，也会把后续选择误判成未激活。
      selectWorkspaceKayingCodeState(state, workspacePath, workspaceIdentity).activeTaskId,
  );

  useEffect(() => {
    const scrollNode = workspaceScrollRef.current;
    if (!scrollNode) {
      return;
    }

    const contentNode = scrollNode.firstElementChild;

    const updateWorkspaceScrollMask = () => {
      const hasOverflow = scrollNode.scrollHeight > scrollNode.clientHeight + 1;
      const isAtTop = scrollNode.scrollTop <= 1;
      const isAtBottom =
        scrollNode.scrollTop + scrollNode.clientHeight >= scrollNode.scrollHeight - 1;

      setShowWorkspaceTopMask(hasOverflow && !isAtTop);
      setShowWorkspaceBottomMask(hasOverflow && !isAtBottom);
    };

    // RAF-based debounce to coalesce resize events
    let rafId: number | null = null;
    let latestCallback = updateWorkspaceScrollMask;
    const debouncedUpdate = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        latestCallback();
      });
    };

    // workspace 列表的滚动条只在内容溢出后才出现。
    // 如果只监听 scroll，像"展开 workspace 后首次产生滚动条"这类场景不会立刻出现顶部/底部渐隐；
    // 这里同时监听容器与内容尺寸变化，让 mask 能跟随内容增减和滚动位置一起更新。
    updateWorkspaceScrollMask();

    const resizeObserver = new ResizeObserver(() => {
      latestCallback = updateWorkspaceScrollMask;
      debouncedUpdate();
    });
    resizeObserver.observe(scrollNode);
    if (contentNode instanceof HTMLElement) {
      resizeObserver.observe(contentNode);
    }

    scrollNode.addEventListener("scroll", updateWorkspaceScrollMask, {
      passive: true,
    });
    window.addEventListener("resize", debouncedUpdate);

    return () => {
      resizeObserver.disconnect();
      scrollNode.removeEventListener("scroll", updateWorkspaceScrollMask);
      window.removeEventListener("resize", debouncedUpdate);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [expandedWorkspacePaths, workspaceTabs.length]);

  const isGroupedTaskGroupView = !showArchivedTasks && taskOrganizeBy === "grouped";
  const toggleableGroupedTaskGroupIds =
    groupedTaskGroupIds.length > 0
      ? groupedTaskGroupIds
      : groupedTaskGroupSnapshotHasGroups === false
        ? []
        : lastNonEmptyGroupedTaskGroupIds;
  const showOptimisticGroupedTaskGroupToggle =
    isGroupedTaskGroupView &&
    !groupedTaskGroupIdsHydrated &&
    groupedTaskGroupSnapshotHasGroups !== false;
  const showToggleAllGroupedTaskGroups =
    isGroupedTaskGroupView &&
    (groupedTaskGroupIds.length > 0 || showOptimisticGroupedTaskGroupToggle);
  const canToggleAllGroupedTaskGroups =
    isGroupedTaskGroupView && toggleableGroupedTaskGroupIds.length > 0;
  const areAllToggleableGroupedTaskGroupsOpen = areAllGroupedTaskGroupsExpanded(
    toggleableGroupedTaskGroupIds,
    collapsedGroupedTaskGroupIds,
  );
  const canToggleAllProjectTaskGroups =
    !showArchivedTasks && taskOrganizeBy === "project" && projectWorkspaceTabs.length > 0;
  const showToggleAllTaskGroups = canToggleAllProjectTaskGroups || showToggleAllGroupedTaskGroups;
  const canToggleAllTaskGroups = canToggleAllProjectTaskGroups || canToggleAllGroupedTaskGroups;
  const areAllTaskGroupsExpanded =
    taskOrganizeBy === "grouped"
      ? areAllToggleableGroupedTaskGroupsOpen
      : purposeSectionPreferences.projectsExpanded && areAllWorkspaceGroupsExpanded;
  const toggleAllTaskGroupsTransitionPending = showOptimisticGroupedTaskGroupToggle;
  const toggleAllTaskGroupsPresentation = resolveSidebarTaskGroupTogglePresentation({
    current: {
      visible: showToggleAllTaskGroups,
      canToggle: canToggleAllTaskGroups,
      areAllExpanded: areAllTaskGroupsExpanded,
      transitionPending: toggleAllTaskGroupsTransitionPending,
    },
    previous: lastStableTaskGroupTogglePresentationRef.current,
  });
  const taskListView = resolveWorkspaceSidebarTaskListView(taskOrganizeBy);
  const showTaskSortOptions = taskListView !== "grouped" || showArchivedTasks;
  const handleTaskListViewChange = useCallback(
    (view: WorkspaceSidebarTaskListView) => {
      const nextOrganizeBy = resolveSidebarTaskOrganizeByForView(view);
      logger.debug("[WorkspaceSidebar] 切换任务视图", {
        from: taskOrganizeBy,
        to: nextOrganizeBy,
        groupedHydrated: groupedTaskGroupIdsHydrated,
        groupedCount: groupedTaskGroupIds.length,
        lastGroupedCount: lastNonEmptyGroupedTaskGroupIds.length,
      });
      if (nextOrganizeBy === "grouped") {
        setGroupedTaskGroupIdsHydrated(false);
      }
      // 归档视图是叠加态；从视图菜单显式选择后应回到对应列表，避免选中值与实际内容不一致。
      setShowArchivedTasks(false);
      setTaskOrganizeBy(nextOrganizeBy);
    },
    [
      groupedTaskGroupIds.length,
      groupedTaskGroupIdsHydrated,
      lastNonEmptyGroupedTaskGroupIds.length,
      taskOrganizeBy,
    ],
  );
  const handleToggleAllTaskGroups = useCallback(() => {
    if (!canToggleAllTaskGroups) {
      return;
    }
    if (taskOrganizeBy === "grouped") {
      if (toggleableGroupedTaskGroupIds.length === 0) {
        return;
      }
      handleCollapsedGroupedTaskGroupIdsChange(
        areAllToggleableGroupedTaskGroupsOpen ? new Set(toggleableGroupedTaskGroupIds) : new Set(),
      );
      return;
    }
    if (purposeSectionPreferences.projectsExpanded && areAllWorkspaceGroupsExpanded) {
      handleProjectSectionOpenChange(false);
      collapseAllWorkspaceTabs(workspacePaths);
      return;
    }

    handleProjectSectionOpenChange(true);
    expandAllWorkspaceTabs(workspacePaths);
  }, [
    areAllWorkspaceGroupsExpanded,
    areAllToggleableGroupedTaskGroupsOpen,
    canToggleAllTaskGroups,
    collapseAllWorkspaceTabs,
    expandAllWorkspaceTabs,
    handleCollapsedGroupedTaskGroupIdsChange,
    handleProjectSectionOpenChange,
    purposeSectionPreferences.projectsExpanded,
    taskOrganizeBy,
    toggleableGroupedTaskGroupIds,
    workspacePaths,
  ]);
  useEffect(() => {
    // Group 视图会在切换后的下一轮子组件渲染里回传 group ids。
    // 如果切换帧直接使用未 hydrate 的模型，按钮会短暂变成 disabled/expand 图标，造成闪动。
    // 因此在待 hydrate 期间复用上一帧展示模型；真实点击能力仍由 handleToggleAllTaskGroups 的当前状态 guard。
    if (!toggleAllTaskGroupsTransitionPending) {
      lastStableTaskGroupTogglePresentationRef.current = toggleAllTaskGroupsPresentation;
    }
  }, [toggleAllTaskGroupsPresentation, toggleAllTaskGroupsTransitionPending]);

  const archivedTasksActionLabel = intl.formatMessage({
    // 归档视图打开后按钮图标会切换为 X，之前 tooltip 仍固定显示“归档”，
    // 图标语义与文案不一致。打开态统一改成 Close，同时同步 aria-label。
    id: showArchivedTasks ? "common.close" : "workspaceSidebar.toggleArchivedTasks",
  });
  // 性能修复：workspaceTaskToolbar 会随 chat streaming 被重复创建并传给远控任务索引。
  // 这里把 render prop 稳定在真正影响工具栏展示的状态上，避免消息流更新污染侧栏任务区。
  const workspaceTaskToolbar = useCallback(
    () => (
      <div className="pl-2.5 pr-3">
        <WorkspaceSidebarTaskListHeader
          view={taskListView}
          onViewChange={handleTaskListViewChange}
          sortBy={taskSortBy}
          onSortByChange={setTaskSortBy}
          onOpenCommandCenter={onOpenCommandCenter}
          showSortOptions={showTaskSortOptions}
          actions={
            <>
              {toggleAllTaskGroupsPresentation ? (
                <ControlHintTooltip
                  title={intl.formatMessage({
                    id: toggleAllTaskGroupsPresentation.messageId,
                  })}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-foreground-subtle hover:text-foreground"
                    aria-label={intl.formatMessage({
                      id: toggleAllTaskGroupsPresentation.messageId,
                    })}
                    disabled={!toggleAllTaskGroupsPresentation.canToggle}
                    onClick={handleToggleAllTaskGroups}
                  >
                    {toggleAllTaskGroupsPresentation.areAllExpanded ? (
                      <Minimize2 className="size-3.5" />
                    ) : (
                      <Maximize2 className="size-3.5" />
                    )}
                  </Button>
                </ControlHintTooltip>
              ) : null}
              {taskViewMode === "grouped" ? (
                <ControlHintTooltip
                  title={
                    workspaceReadOnlyReason ?? intl.formatMessage({ id: "taskGroup.newGroup" })
                  }
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-foreground-subtle hover:text-foreground"
                    aria-label={intl.formatMessage({
                      id: "taskGroup.newGroup",
                    })}
                    disabled={workspaceReadOnly || !createGroupedTaskGroupAction}
                    onClick={() => {
                      if (!workspaceReadOnly) {
                        createGroupedTaskGroupAction?.();
                      }
                    }}
                  >
                    <Hash className="size-3.5" />
                  </Button>
                </ControlHintTooltip>
              ) : null}
              {showArchivedTasks ? (
                <div
                  ref={setArchivedActionsContainer}
                  data-testid="archived-tasks-toolbar-actions"
                  className="flex shrink-0 items-center"
                />
              ) : null}
              <ControlHintTooltip title={archivedTasksActionLabel}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-foreground-subtle hover:text-foreground data-[state=on]:bg-hover data-[state=on]:text-foreground"
                  data-state={showArchivedTasks ? "on" : "off"}
                  aria-label={archivedTasksActionLabel}
                  onClick={() => {
                    setShowArchivedTasks((current) => !current);
                  }}
                >
                  {showArchivedTasks ? (
                    <X className="size-3.5" />
                  ) : (
                    <Archive className="size-3.5" />
                  )}
                </Button>
              </ControlHintTooltip>
            </>
          }
        />
      </div>
    ),
    [
      archivedTasksActionLabel,
      createGroupedTaskGroupAction,
      handleTaskListViewChange,
      handleToggleAllTaskGroups,
      intl,
      onOpenCommandCenter,
      showArchivedTasks,
      showTaskSortOptions,
      taskListView,
      taskSortBy,
      taskViewMode,
      toggleAllTaskGroupsPresentation,
      workspaceReadOnly,
      workspaceReadOnlyReason,
    ],
  );

  const renderWorkspaceProject = (tab: WorkspaceTabState, sortable: boolean) => {
    const workspaceKey = buildTaskWorkspaceKey(tab.workspacePath, tab.workspaceIdentity);
    const taskGroup = workspaceTaskGroupByKey.get(workspaceKey);
    const taskLoading = workspaceTaskLists.loadingByWorkspaceKey[workspaceKey] ?? false;
    const sharedProps = {
      tab,
      isActiveWorkspace: tab.workspacePath === workspacePath,
      isExpanded: resolveWorkspaceDragExpanded({
        activeDragId: activeWorkspaceDragId,
        expanded: expandedWorkspacePaths.has(tab.workspacePath),
        tabId: tab.id,
      }),
      activateTab,
      closeTab,
      toggleWorkspaceExpanded,
      onSelectTask,
      onStartDraftInWorkspace,
      taskItems: taskGroup?.items ?? EMPTY_WORKSPACE_TASK_ITEMS,
      taskListLoading: taskLoading,
      taskListHasMore: taskGroup?.hasMore ?? false,
      taskListHasUnread: taskGroup?.hasUnread ?? false,
      taskListLiveWorkflowCount: taskGroup?.liveWorkflowCount ?? 0,
      reconnectingRemoteWorkspaceKeys,
      remoteWorkspaceErrorByWorkspaceKey,
      reconnectingRemoteWorkspaceLogsByWorkspaceKey,
      onReconnectRemoteWorkspace,
      onOpenFileTree: handleOpenWorkspaceFileTree,
      isProjectPinned: pinnedProjectKeys.has(getWorkspaceProjectKey(tab)),
      onToggleProjectPinned: () => handleToggleProjectPinned(tab),
    };
    return sortable ? (
      <SortableWorkspaceSidebarItem
        key={tab.id}
        {...sharedProps}
        workspaceKey={workspaceKey}
        onShowMoreWorkspaceTasks={handleShowMoreWorkspaceTasks}
      />
    ) : (
      <WorkspaceSidebarItem
        key={tab.id}
        {...sharedProps}
        onShowMoreTasks={() => handleShowMoreWorkspaceTasks(workspaceKey)}
      />
    );
  };

  return (
    <aside
      data-testid={TID_SIDEBAR}
      // 这里用设计系统的结构面 token 固定侧栏层级，避免不同合成器把左侧容器混成异常灰块。
      className="flex h-full flex-col overflow-hidden"
    >
      <div className="h-12 [app-region:drag]"></div>
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div
          className={cn(
            "absolute inset-0 flex min-h-0 flex-col transition-transform duration-200 ease-out",
            isFileTreeOpen && "-translate-x-full pointer-events-none",
          )}
          aria-hidden={isFileTreeOpen}
        >
          <div className={cn("flex flex-col gap-1 px-2", isWindowsDesktop ? "py-2" : "py-3")}>
            <WorkspaceNewTaskTooltip disabledReason={workspaceReadOnlyReason}>
              <NewTaskButtonGroup
                disabled={workspaceReadOnly}
                onCreateTask={() => {
                  if (workspaceReadOnly) {
                    return;
                  }
                  if (taskViewMode === "grouped") {
                    if (createGroupedTaskDraftAction) {
                      createGroupedTaskDraftAction();
                      return;
                    }
                    onCreateTask({ groupedDraftPlacement: { type: "top" } });
                    return;
                  }
                  onCreateTask({ createSource: "project" });
                }}
              />
            </WorkspaceNewTaskTooltip>
            {/* 远程入口展示策略统一走 useRemoteConnectionEntryVisibility，避免与其他入口出现分叉。*/}
            {/* {showRemoteConnectionEntry ? (
              <SSHDialog
                onConnect={onConnectRemote}
                onSelectProject={onSelectRemoteProject}
                onCancelSession={onCancelRemoteProject}
                isWindowsDesktop={isWindowsDesktop}
                triggerVariant="ghost"
                triggerSize="lg"
                triggerClassName="w-full justify-start gap-2 text-foreground hover:bg-surface-hover hover:text-foreground"
                trigger={
                  <>
                    <Cloud className="size-4" />
                    <span>{intl.formatMessage({ id: "remote.trigger" })}</span>
                  </>
                }
              />
            ) : null} */}
            <Button
              variant="ghost"
              onClick={handleOpenAutomationsMain}
              data-icon="inline-start"
              data-testid={TID_AUTOMATIONS_OPEN}
              size="lg"
              aria-pressed={automationsActive}
              className={cn(
                "w-full justify-start gap-2 text-foreground hover:bg-surface-hover hover:text-foreground",
                automationsActive && "bg-selected text-foreground",
              )}
            >
              <CalendarClock className="size-4" />
              {intl.formatMessage({ id: "workspace.openScheduledSettings" })}
            </Button>
            <Button
              variant="ghost"
              onClick={handleOpenPluginStoreMain}
              data-icon="inline-start"
              data-testid="plugin-store-sidebar-open"
              size="lg"
              aria-pressed={pluginStoreActive}
              className={cn(
                "w-full justify-start gap-2 text-foreground hover:bg-surface-hover hover:text-foreground",
                pluginStoreActive && "bg-selected text-foreground",
              )}
            >
              <Blocks className="size-4" />
              {intl.formatMessage({ id: "workspace.openPluginsSettings" })}
            </Button>
            {!isOfficeMode && onOpenGameFeature ? (
              <GameFeatureNavigation page={gameFeaturePage} onNavigate={onOpenGameFeature} />
            ) : null}
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col">
            <StickyGroupHeaderSlot header={groupedStickyHeader} />
            <div
              ref={workspaceScrollRef}
              className={
                // grouped task 拖拽预览会改变列表高度，禁用 scroll anchoring 避免浏览器自动锚定把 dnd-kit 测量放大成抖动。
                "flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto"
              }
              style={workspaceScrollMaskStyle}
            >
              {workspaceTaskToolbar()}
              <div className="flex min-h-0 flex-col gap-3 px-2">
                {taskViewMode === "archived" ? (
                  <WorkspaceArchivedTasksFlatSection
                    actionsContainer={archivedActionsContainer}
                    workspaceTabs={workspaceTabs}
                    activeWorkspacePath={workspacePath}
                    activeWorkspaceIdentity={workspaceIdentity}
                    activeTaskId={activeTaskId}
                    sortBy={taskSortBy}
                    onSelectTask={onSelectTask}
                  />
                ) : taskViewMode === "grouped" ? (
                  <WorkspaceGroupedTasksSection
                    workspaceTabs={workspaceTabs}
                    activeWorkspacePath={workspacePath}
                    activeWorkspaceIdentity={workspaceIdentity}
                    activeTaskId={activeTaskId}
                    onSelectTask={onSelectTask}
                    onCreateTask={onCreateTask}
                    onOpenFileTree={(target) => {
                      setFileTreeTarget(target);
                      setIsFileTreeOpen(true);
                    }}
                    onCreateGroupActionChange={handleCreateGroupActionChange}
                    onCreateDraftTaskActionChange={handleCreateDraftTaskActionChange}
                    collapsedGroupIds={collapsedGroupedTaskGroupIds}
                    onGroupedTaskGroupIdsChange={handleGroupedTaskGroupIdsChange}
                    onCollapsedGroupIdsChange={handleCollapsedGroupedTaskGroupIdsChange}
                    onStickyGroupHeaderChange={setGroupedStickyHeader}
                    onOpenAutomations={handleOpenAutomationsMain}
                  />
                ) : taskViewMode === "timeline" ? (
                  <WorkspaceTimelineTasksSection
                    workspaceTabs={workspaceTabs}
                    activeWorkspacePath={workspacePath}
                    activeWorkspaceIdentity={workspaceIdentity}
                    activeTaskId={activeTaskId}
                    taskSortBy={taskSortBy}
                    onSelectTask={handleTaskRowSelect}
                  />
                ) : (
                  <DndContext
                    sensors={purposeSectionSensors}
                    collisionDetection={sidebarCollisionDetection}
                    modifiers={[restrictSidebarDrag]}
                    onDragStart={handleSidebarDragStart}
                    onDragEnd={handleSidebarDragEnd}
                    onDragCancel={handleWorkspaceDragCancel}
                  >
                    <WorkspacePurposeSection
                      sortable={false}
                      sortableId={PINNED_PROJECT_SECTION_ID}
                      projectDropZoneId={PINNED_PROJECT_DROP_ZONE_ID}
                      dragHandleLabel={intl.formatMessage({
                        id: "workspaceSidebar.pinnedProjectsSection",
                      })}
                      title={intl.formatMessage({
                        id: "workspaceSidebar.pinnedProjectsSection",
                      })}
                      open={purposeSectionPreferences.pinnedProjectsExpanded}
                      onOpenChange={handlePinnedProjectSectionOpenChange}
                      testId="pinned-project-section"
                      action={null}
                    >
                      <SortableContext
                        items={pinnedProjectTabs.map((tab) => tab.id)}
                        strategy={workspaceVerticalListSortingStrategy}
                      >
                        {pinnedProjectTabs.length === 0 ? (
                          <div className="min-h-10 px-3 py-2 text-ui-base text-foreground-subtle">
                            {intl.formatMessage({
                              id: "workspaceSidebar.noPinnedProjects",
                            })}
                          </div>
                        ) : (
                          <ul data-testid="pinned-workspace-list" className="space-y-2 pb-4">
                            {pinnedProjectTabs.map((tab) => renderWorkspaceProject(tab, true))}
                          </ul>
                        )}
                      </SortableContext>
                    </WorkspacePurposeSection>
                    <SortableContext
                      items={purposeSectionPreferences.sectionOrder}
                      strategy={verticalListSortingStrategy}
                    >
                      <div data-purpose-section-list="true">
                        {purposeSectionPreferences.sectionOrder.map((sectionId) =>
                          sectionId === REGULAR_PROJECT_SECTION_ID ? (
                            <WorkspacePurposeSection
                              key={sectionId}
                              sortableId={sectionId}
                              projectDropZoneId={REGULAR_PROJECT_DROP_ZONE_ID}
                              dragHandleLabel={intl.formatMessage(
                                { id: "workspaceSidebar.reorderSection" },
                                {
                                  section: intl.formatMessage({
                                    id: "workspaceSidebar.projectsSection",
                                  }),
                                },
                              )}
                              title={intl.formatMessage({
                                id: "workspaceSidebar.projectsSection",
                              })}
                              open={purposeSectionPreferences.projectsExpanded}
                              onOpenChange={handleProjectSectionOpenChange}
                              testId={TID_PROJECT_SECTION}
                              action={
                                <DropdownMenu>
                                  <ControlHintTooltip
                                    title={intl.formatMessage({
                                      id: "workspaceSidebar.addProject",
                                    })}
                                  >
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        className="text-foreground-subtle hover:text-foreground data-[state=open]:text-foreground"
                                        aria-label={intl.formatMessage({
                                          id: "workspaceSidebar.addProject",
                                        })}
                                        data-testid={TID_PROJECT_ADD}
                                      >
                                        <Plus className="size-3.5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                  </ControlHintTooltip>
                                  <DropdownMenuContent align="end" className="min-w-44">
                                    <DropdownMenuItem onSelect={onOpenFolderFromWorkspaceMenu}>
                                      <FolderOpen className="size-4" />
                                      {intl.formatMessage({
                                        id: "workspace.openFolder",
                                      })}
                                    </DropdownMenuItem>
                                    {onOpenRemoteWorkspace ? (
                                      <DropdownMenuItem onSelect={onOpenRemoteWorkspace}>
                                        <Cloud className="size-4" />
                                        {intl.formatMessage({
                                          id: "remote.trigger",
                                        })}
                                      </DropdownMenuItem>
                                    ) : null}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              }
                            >
                              <SortableContext
                                items={regularProjectTabs.map((tab) => tab.id)}
                                strategy={workspaceVerticalListSortingStrategy}
                              >
                                {regularProjectTabs.length === 0 ? (
                                  <div className="min-h-10 px-3 py-2 text-ui-base text-foreground-subtle">
                                    {projectWorkspaceTabs.length === 0
                                      ? intl.formatMessage({
                                          id: "workspaceSidebar.noProjects",
                                        })
                                      : null}
                                  </div>
                                ) : (
                                  <ul data-testid={TID_WORKSPACE_LIST} className="space-y-2 pb-4">
                                    {regularProjectTabs.map((tab) =>
                                      renderWorkspaceProject(tab, true),
                                    )}
                                  </ul>
                                )}
                              </SortableContext>
                            </WorkspacePurposeSection>
                          ) : (
                            <WorkspacePurposeSection
                              key={sectionId}
                              sortableId={sectionId}
                              dragHandleLabel={intl.formatMessage(
                                { id: "workspaceSidebar.reorderSection" },
                                {
                                  section: intl.formatMessage({
                                    id: "workspaceSidebar.conversationsSection",
                                  }),
                                },
                              )}
                              title={intl.formatMessage({
                                id: "workspaceSidebar.conversationsSection",
                              })}
                              open={purposeSectionPreferences.conversationsExpanded}
                              onOpenChange={handleConversationSectionOpenChange}
                              testId={TID_CONVERSATION_SECTION}
                              action={
                                <ControlHintTooltip
                                  title={intl.formatMessage({
                                    id: "workspaceSidebar.newConversation",
                                  })}
                                >
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    className="text-foreground-subtle hover:text-foreground"
                                    aria-label={intl.formatMessage({
                                      id: "workspaceSidebar.newConversation",
                                    })}
                                    data-testid={TID_CONVERSATION_NEW_TASK}
                                    onClick={() => {
                                      handleConversationSectionOpenChange(true);
                                      onCreateConversationTask();
                                    }}
                                  >
                                    <MessageCirclePlus className="size-3.5" />
                                  </Button>
                                </ControlHintTooltip>
                              }
                            >
                              <WorkspaceTimelineTasksSection
                                workspaceTabs={conversationWorkspaceTabs}
                                activeWorkspacePath={workspacePath}
                                activeWorkspaceIdentity={workspaceIdentity}
                                activeTaskId={activeTaskId}
                                taskSortBy={taskSortBy}
                                groupByDate={false}
                                // conversation backing workspace 只是内部执行路径；用户文案改成“任务”不改变 purpose 语义。
                                taskRowVariant="default"
                                emptyMessage={intl.formatMessage({
                                  id: "workspaceSidebar.noConversations",
                                })}
                                hideEmptyState
                                onContentStateChange={handleConversationContentStateChange}
                                onSelectTask={handleTaskRowSelect}
                              />
                            </WorkspacePurposeSection>
                          ),
                        )}
                      </div>
                    </SortableContext>
                    {typeof document === "undefined"
                      ? null
                      : createPortal(
                          <DragOverlay>
                            {activeWorkspaceDragTab ? (
                              <WorkspaceDragOverlay
                                tab={activeWorkspaceDragTab}
                                width={activeWorkspaceDragWidth}
                              />
                            ) : null}
                          </DragOverlay>,
                          document.body,
                        )}
                  </DndContext>
                )}
              </div>
            </div>
          </div>

          <WorkspaceSidebarFooter
            className="pr-3"
            theme={theme}
            localeMenuValue={localeMenuValue}
            onLocaleChange={handleLocaleChange}
            onThemeChange={handleThemeChange}
            onSettingsButtonClick={openSettingsTab}
            onUsageClick={openSettingsTab}
            onLogin={onLogin}
            onLogout={onLogout}
            user={user}
            workspacePath={workspacePath}
            workspaceIdentity={workspaceIdentity}
            onChooseWorkspace={onOpenFolderFromWorkspaceMenu}
            workspaceRemoteSessionId={workspaceRemoteSessionId}
            activeTaskId={activeTaskId}
            isDesktop={isDesktop}
          />
        </div>
        <div
          className={cn(
            "absolute inset-0 transition-transform duration-200 ease-out",
            isFileTreeOpen ? "translate-x-0" : "translate-x-full pointer-events-none",
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
              canOpenLocalFileManager={isDesktop}
              activePreviewPath={activePreviewPath}
              onClose={() => setIsFileTreeOpen(false)}
              onOpenBrowserUrl={isDesktop ? onOpenBrowserUrl : undefined}
              onOpenPreview={(source) => {
                // 文件树可以查看非当前 workspace 的文件。
                // 预览 source 携带 workspace 作用域，PreviewPane 才能用正确 host 读取远程文件；
                // 同时不切换当前 workspace，避免"Add to chat"丢给错误的 composer。
                onOpenCodeViewer?.({
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
    </aside>
  );
});
