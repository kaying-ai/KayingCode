import type { ToolExecutionContext } from "../tool/types.js";

export function resolveMcpWorkspacePath(
  context: Pick<ToolExecutionContext, "workingDirectory" | "workspaceRoot">,
): string {
  // 修复依据：Bash 成功执行 cd 后会持久化 workingDirectory；它只是命令 cwd，不是权限边界。
  // MCP 若把它发成 workspace_path，位于其父级但仍在工作区内的 projectRoot 会被误判越界。
  return context.workspaceRoot;
}

/**
 * 解析注入给 MCP 的 workspaceKey（身份 key，不是 IO 路径）。
 *
 * 修复依据：身份 key 规范是 `workspaceIdentity?.trim() || workspacePath`，其中
 * workspacePath 指会话不可变的 workspaceRoot。此前无 identity 时错误回退到
 * workingDirectory：Agent `cd` 进 convert_game 子目录后调用 prepare_visual_comparison，
 * 回执会写入子目录路径作为 workspaceKey，UI 侧 activeWorkspaceKey 仍是 workspaceRoot，
 * 校验失败并显示「比较回执无效或属于其他任务」。
 */
export function resolveMcpWorkspaceKey(
  context: Pick<ToolExecutionContext, "workspaceIdentity" | "workspaceRoot">,
): string {
  return context.workspaceIdentity?.trim() || context.workspaceRoot;
}
