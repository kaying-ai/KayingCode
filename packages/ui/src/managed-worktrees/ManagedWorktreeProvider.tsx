// worktree UI 的宿主 Provider（managed-worktrees/CONTRACT.md §1、§2）。
// 唯一职责：把本机 Host 的创建记录与 worktree 列表镜像成只读快照，并提供给 Shell、任务行、
// Header 与弹窗；不写 worktree 状态，不推算阶段，不在本地增删列表行。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  IManagedWorktreeService,
  ManagedWorktreeCreation,
  ManagedWorktreeCreationSettlement,
  ManagedWorktreeEntry,
  ManagedWorktreeGroup,
  ManagedWorktreeTaskRef,
} from "./contract.js";
import { ManagedWorktreesDialog } from "./ManagedWorktreesDialog.js";
import {
  useBaseManagedWorktreeService,
  useManagedWorktreeCreations,
  useManagedWorktreeSettlements,
} from "./useManagedWorktreeCreations.js";
import {
  useManagedWorktreeList,
  useManagedWorktreeProjectChanges,
  type ManagedWorktreeListState,
} from "./useManagedWorktrees.js";
import { useWorktreeSupport, type WorktreeSupport } from "./useWorktreeSupport.js";
import { handleManagedWorktreeCreationSettlement } from "./worktreeCreationLifecycle.js";

const EMPTY_INDEX: ReadonlyMap<string, ManagedWorktreeEntry> = new Map();

export interface ManagedWorktreeContextValue {
  projectId: string | null;
  /** 当前 workspace（项目主目录）；创建行只展示属于它的记录。 */
  workspacePath: string;
  /** workspace 身份；本地 worktree 恒为空，投影到入口/发起路径保证同一匹配口径。 */
  workspaceIdentity?: string;
  service: IManagedWorktreeService | undefined;
  support: WorktreeSupport;
  creations: readonly ManagedWorktreeCreation[];
  worktrees: ManagedWorktreeListState;
  reloadWorktrees(): Promise<void>;
  dialogOpen: boolean;
  openWorktrees(): void;
  closeWorktrees(): void;
  viewedCreationId: string | null;
  viewedCreation: ManagedWorktreeCreation | null;
  viewCreation(creationId: string | null): void;
  /** taskId 归属索引；键包含 workspaceIdentity，禁止只按路径匹配。 */
  taskWorktrees: ReadonlyMap<string, ManagedWorktreeEntry>;
}

const ManagedWorktreeContext = createContext<ManagedWorktreeContextValue | null>(null);

/** 任务归属键：workspaceIdentity + workspacePath + taskId。远程任务与本地任务永不互相命中。 */
export function managedWorktreeTaskKey(params: {
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
}): string {
  return `${params.workspaceIdentity?.trim() ?? ""}\u0000${params.workspacePath}\u0000${params.taskId}`;
}

function buildTaskWorktreeIndex(
  groups: ManagedWorktreeGroup[] | null,
): ReadonlyMap<string, ManagedWorktreeEntry> {
  if (!groups || groups.length === 0) return EMPTY_INDEX;
  const index = new Map<string, ManagedWorktreeEntry>();
  for (const group of groups) {
    for (const worktree of group.worktrees) {
      for (const task of worktree.tasks) {
        index.set(
          managedWorktreeTaskKey({
            workspacePath: task.workspacePath,
            ...(task.workspaceIdentity ? { workspaceIdentity: task.workspaceIdentity } : {}),
            taskId: task.taskId,
          }),
          worktree,
        );
      }
    }
  }
  return index;
}

export function ManagedWorktreeProvider({
  projectId,
  projectName,
  workspacePath,
  workspaceIdentity,
  worktreeEligible = false,
  onOpenTask,
  children,
}: {
  projectId: string | null;
  projectName?: string;
  workspacePath: string;
  workspaceIdentity?: string;
  /** 当前草稿是否属于可创建 worktree 的项目（本地、非 office）。 */
  worktreeEligible?: boolean;
  onOpenTask?(task: ManagedWorktreeTaskRef): void;
  children: ReactNode;
}) {
  const service = useBaseManagedWorktreeService();
  const creations = useManagedWorktreeCreations(service);
  const support = useWorktreeSupport(
    workspacePath,
    workspaceIdentity,
    worktreeEligible && Boolean(projectId),
  );
  // 创建记录集合变化（新增、阶段变化、结束）都会改变 worktree 的 creating/任务占用，作为刷新键。
  const creationsRefreshKey = useMemo(
    () => creations.map((creation) => `${creation.id}:${creation.phase}`).join("|"),
    [creations],
  );
  const worktreeList = useManagedWorktreeList(service, projectId, creationsRefreshKey);
  const reloadWorktrees = worktreeList.reload;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewedCreationId, setViewedCreationId] = useState<string | null>(null);

  useManagedWorktreeSettlements(
    service,
    useCallback(
      (settlement: ManagedWorktreeCreationSettlement) => {
        // 结束事件先于列表推送到达（CONTRACT §2）：先按本窗口发起记录交接会话/草稿，
        // 再刷新 worktree 列表；未知或已消费的结束事件由账本忽略。
        handleManagedWorktreeCreationSettlement(settlement, workspaceIdentity);
        void reloadWorktrees();
      },
      [reloadWorktrees, workspaceIdentity],
    ),
  );
  useManagedWorktreeProjectChanges(
    useCallback(() => {
      void reloadWorktrees();
    }, [reloadWorktrees]),
  );

  const viewedCreation = useMemo(
    () => creations.find((creation) => creation.id === viewedCreationId) ?? null,
    [creations, viewedCreationId],
  );
  // 创建记录结束后自动退出创建视图；视图状态只跟随 Host 的列表，不自行构造。
  useEffect(() => {
    if (viewedCreationId && !viewedCreation) setViewedCreationId(null);
  }, [viewedCreation, viewedCreationId]);

  const projectCreations = useMemo(
    () => creations.filter((creation) => creation.projectId === projectId),
    [creations, projectId],
  );
  const taskWorktrees = useMemo(
    () => buildTaskWorktreeIndex(worktreeList.groups),
    [worktreeList.groups],
  );

  const openWorktrees = useCallback(() => setDialogOpen(true), []);
  const closeWorktrees = useCallback(() => setDialogOpen(false), []);
  const viewCreation = useCallback((creationId: string | null) => {
    setViewedCreationId(creationId);
  }, []);

  const value = useMemo<ManagedWorktreeContextValue>(
    () => ({
      projectId,
      workspacePath,
      ...(workspaceIdentity ? { workspaceIdentity } : {}),
      service,
      support,
      creations: projectCreations,
      worktrees: worktreeList,
      reloadWorktrees,
      dialogOpen,
      openWorktrees,
      closeWorktrees,
      viewedCreationId,
      viewedCreation,
      viewCreation,
      taskWorktrees,
    }),
    [
      closeWorktrees,
      dialogOpen,
      openWorktrees,
      projectCreations,
      projectId,
      reloadWorktrees,
      service,
      support,
      taskWorktrees,
      viewCreation,
      viewedCreation,
      viewedCreationId,
      workspacePath,
      workspaceIdentity,
      worktreeList,
    ],
  );

  return (
    <ManagedWorktreeContext.Provider value={value}>
      {children}
      {projectId ? (
        <ManagedWorktreesDialog
          open={dialogOpen}
          onOpenChange={(open) => (open ? openWorktrees() : closeWorktrees())}
          projectId={projectId}
          {...(projectName ? { projectName } : {})}
          service={service}
          groups={worktreeList.groups}
          loading={worktreeList.loading}
          loadError={worktreeList.error}
          onReload={reloadWorktrees}
          creations={projectCreations}
          activeCreationId={viewedCreationId}
          onOpenCreation={(creation) => {
            viewCreation(creation.id);
            closeWorktrees();
          }}
          {...(onOpenTask ? { onOpenTask } : {})}
        />
      ) : null}
    </ManagedWorktreeContext.Provider>
  );
}

/** Provider 之外（例如独立渲染的任务行）返回 null，不阻断原有 UI。 */
export function useOptionalManagedWorktreeContext(): ManagedWorktreeContextValue | null {
  return useContext(ManagedWorktreeContext);
}

export function useManagedWorktreeContext(): ManagedWorktreeContextValue {
  const context = useContext(ManagedWorktreeContext);
  if (!context) throw new Error("managed-worktrees/provider-required");
  return context;
}

/** 任务所属的受管 worktree；普通任务或 Provider 缺失时为 null。 */
export function useTaskWorktreeEntry(params: {
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string | null | undefined;
}): ManagedWorktreeEntry | null {
  const context = useOptionalManagedWorktreeContext();
  const { taskId, workspaceIdentity, workspacePath } = params;
  return useMemo(() => {
    if (!context || !taskId) return null;
    return (
      context.taskWorktrees.get(
        managedWorktreeTaskKey({
          workspacePath,
          ...(workspaceIdentity ? { workspaceIdentity } : {}),
          taskId,
        }),
      ) ?? null
    );
  }, [context, taskId, workspaceIdentity, workspacePath]);
}
