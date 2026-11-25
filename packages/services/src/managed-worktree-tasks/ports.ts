import type { CommandAck, CommandEnvelope, CommandKey } from "@zcode/shared/zcode-protocol-v4";
import type { GitWorktreeRepo } from "#src/git/managed-worktree/contract.js";
import type { WorktreeRemovalGate } from "#src/managed-worktree-tasks/removal-gate.js";
import type { ProjectRepositoryContract } from "#src/project-storage/contract.js";
import type { ManagedWorktreeWorkspace } from "./contract.js";

/** 受管 worktree 使用的任务行：只读 tasks-index，不复制任务状态。 */
export type ManagedWorktreeTaskRow = ReturnType<
  ProjectRepositoryContract["listTasksByWorktree"]
>[number];

/**
 * 受管 worktree 服务需要的任务仓储端口：直接取真实 ProjectRepositoryContract 的子集。
 * `worktree_root` 精确匹配、`reserveCreatedTask` 的 cwd/worktreeRoot 与 `releaseReservedTask`
 * 都由 project-storage 提供，服务不按 cwd 猜测归属。
 */
export type ManagedWorktreeTaskRepository = Pick<
  ProjectRepositoryContract,
  | "readTree"
  | "resolveSessionDirectories"
  | "listTasksByWorktree"
  | "reserveCreatedTask"
  | "releaseReservedTask"
>;

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
