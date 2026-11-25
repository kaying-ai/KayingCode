import type { CommandAck, CommandEnvelope, CommandKey } from "@zcode/shared/zcode-protocol-v4";
import type { GitWorktreeRepo } from "#src/git/managed-worktree/contract.js";
import type { WorktreeRemovalGate } from "#src/managed-worktree-tasks/removal-gate.js";
import type {
  ProjectDirectories,
  ProjectTaskRef,
  ProjectTree,
} from "#src/project-storage/contract.js";
import type { ManagedWorktreeWorkspace } from "./contract.js";

/**
 * 受管 worktree 使用的任务行：只读 tasks-index，不复制任务状态。
 * `worktree_root` 精确匹配由仓储实现，服务不按 cwd 猜测归属。
 */
export interface ManagedWorktreeTaskRow extends ProjectTaskRef {
  projectId: string | null;
  title: string;
  archived: boolean;
}

/**
 * 受管 worktree 服务需要的任务仓储端口。
 *
 * 产品适配：上游 4.0.0 直接把 `ProjectRepositoryContract` 注入（该契约已含 worktree_root/cwd 列与
 * `listTasksByWorktree` / `releaseReservedTask` / `readTaskCwd`）。本仓库 project-storage 尚未落这些
 * worktree 扩展，因此先以窄端口声明本服务实际使用的方法；project-storage 完成 worktree 扩展后，
 * 由真实 repository 实现该端口，装配点在 `packages/services/src/node.ts`（本轮不做 Host 接线）。
 */
export interface ManagedWorktreeTaskRepository {
  readTree(options?: {
    includeDeleted?: boolean;
    includeDeletedTasks?: boolean;
    includeTasks?: boolean;
  }): ProjectTree;
  /** 任务行记录的 cwd（受管 worktree 任务与 workspacePath 不同）；没有这一行时回退 workspacePath。 */
  resolveSessionDirectories(task: ProjectTaskRef): ProjectDirectories & { cwd?: string };
  listTasksByWorktree(input: { worktreeRoot: string }): ManagedWorktreeTaskRow[];
  /**
   * 普通创建在 CLI 首发前预留任务行：workspace 是项目主目录，cwd/worktreeRoot 只在这里写一次。
   */
  reserveCreatedTask(input: {
    task: Omit<ProjectTaskRef, "taskId"> & { taskId?: string };
    projectId: string | null;
    cwd: string;
    worktreeRoot: string;
    additionalDirectories?: string[];
  }): ProjectDirectories & { taskId: string };
  /**
   * 撤销一条尚无 CLI 事实的创建预留：released = 已撤销；absent = 没有这一行；
   * kept = 行已有 CLI 事实（会话已存在），不删除。
   */
  releaseReservedTask(input: { task: ProjectTaskRef }): "released" | "absent" | "kept";
}

export interface ManagedWorktreeCommand extends ManagedWorktreeWorkspace {
  projectId?: string | null;
  envelope: CommandEnvelope;
}

export interface ManagedWorktreeServicePorts {
  /** 本 Host 是否为本地桌面 Host；远端 Source Server 一律拒绝。 */
  isLocalHost: boolean;
  repository(): Promise<ManagedWorktreeTaskRepository>;
  git: GitWorktreeRepo;
  /** 删除租约与会话操作闸门；与 Agent 服务、终端服务共享同一个实例。 */
  removalGate: WorktreeRemovalGate;
  runtime: {
    hasTerminalsUnder(path: string): Promise<boolean>;
    /**
     * 请求 workspace 的 CLI 卸载 cwd 位于 directory 内的全部驻留会话（session/releaseUnderDirectory）。
     * 会话选择与忙闲只由 CLI 判断，任一会话忙时全部不卸载。只使用已存在的 CLI 进程。
     */
    releaseSessionsUnder(
      target: ManagedWorktreeWorkspace & { directory: string },
    ): Promise<{ released: string[]; busy: string[] }>;
  };
  agent: {
    supportsWorktreeCwd(target: ManagedWorktreeWorkspace): Promise<boolean>;
    /** 以 Host 可信身份发送命令（允许携带 cwd / worktreeCreation / targetCwd）。 */
    sendCommand(command: ManagedWorktreeCommand): Promise<CommandAck>;
    /** 按 commandId 查询 CLI 对命令的裁决（commands/query）；CLI 没有记录时为 "unknown"。 */
    queryCommandResult(
      target: ManagedWorktreeWorkspace & { key: CommandKey },
    ): Promise<CommandAck | "unknown">;
  };
  /** 正在创建的数量变化时上报（阻止退出事项）。 */
  reportCreatingCount?(count: number): void;
  afterChange?(): Promise<void>;
  now?(): number;
}
