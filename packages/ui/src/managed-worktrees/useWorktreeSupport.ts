// worktree 入口（composer 开关、管理弹窗按钮）的可见性与可用性（managed-worktrees/CONTRACT.md §3）。
// 可见：本地 Git 仓库；可用：项目 CLI 在 runtime/capabilities 中声明 worktreeCwd。
import { useEffect, useState } from "react";
import { useOptionalServices } from "@/hooks/useServices.js";
import { useOptionalBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { logger } from "@/logger.js";

export interface WorktreeSupport {
  /** 本地 Git 仓库且具备 worktree 服务：入口应渲染。 */
  visible: boolean;
  /** CLI 声明支持会话 cwd 与 workspace 不同：入口可操作。 */
  available: boolean;
  /** 不可用原因，用于禁用态 tooltip；可用时为 null。 */
  disabledReason: "not-repository" | "unsupported" | "remote" | null;
}

const HIDDEN: WorktreeSupport = {
  visible: false,
  available: false,
  disabledReason: null,
};

export function useWorktreeSupport(
  workspacePath: string,
  workspaceIdentity: string | undefined,
  enabled: boolean,
): WorktreeSupport {
  const services = useOptionalServices();
  const baseServices = useOptionalBaseWorkspaceServices();
  const managedWorktreeService = baseServices?.managedWorktreeService;
  const gitService = services?.gitService;
  const [state, setState] = useState<{ key: string; support: WorktreeSupport } | null>(null);
  const remote = Boolean(workspaceIdentity?.trim());
  const key = `${workspacePath}\u0000${workspaceIdentity?.trim() ?? ""}`;
  const active = enabled && Boolean(managedWorktreeService) && Boolean(gitService) && !remote;

  useEffect(() => {
    if (!active || !managedWorktreeService || !gitService) return;
    let disposed = false;
    // 每次查询递增序号，只有最新一次的结果能写入；workspace 切换后旧请求不得覆盖新结果。
    let latest = 0;
    const request = ++latest;
    void Promise.all([
      gitService.getWorkspaceRepositoryInfo({ workspacePath }),
      managedWorktreeService.supportsWorktreeCwd({ workspacePath }),
    ]).then(
      ([info, supported]) => {
        if (disposed || request !== latest) return;
        const visible = info.kind !== "not-repository";
        setState({
          key,
          support: {
            visible,
            available: visible && supported,
            disabledReason: visible ? (supported ? null : "unsupported") : "not-repository",
          },
        });
      },
      (error: unknown) => {
        // 查询失败按不可见处理：保留普通新建/分叉，不阻断对话。
        logger.warn("[worktree] 读取 worktree 能力失败", { error });
        if (!disposed && request === latest) setState({ key, support: HIDDEN });
      },
    );
    return () => {
      disposed = true;
    };
  }, [active, gitService, key, managedWorktreeService, workspacePath]);

  if (remote) {
    return { visible: false, available: false, disabledReason: "remote" };
  }
  return active && state?.key === key ? state.support : HIDDEN;
}
