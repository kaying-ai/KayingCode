import { realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";

/**
 * 审核 Bot 只公开逐文件 Read。Bash、MCP、子 Agent 等即使自报 readOnly，
 * 仍可能读容器凭据或产生外部副作用，不能靠通用 readOnly 元数据放行。
 */
export function reviewToolAllowed(toolName: string): boolean {
  return toolName === "Read";
}

/**
 * 根因：通用工具路径解析允许 workspace 外路径，也不会处理符号链接逃逸。
 * 审核容器把 workspace 挂成只读卷后，realpath 检查与只读挂载共同收口路径和竞态。
 */
export async function assertReviewReadPath(workspaceRoot: string, filePath: string): Promise<void> {
  if (!isAbsolute(workspaceRoot) || !isAbsolute(filePath)) {
    throw new Error("review workspace requires absolute paths");
  }
  const [root, target] = await Promise.all([realpath(workspaceRoot), realpath(filePath)]);
  const suffix = relative(root, target);
  if (suffix === "" || (suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix))) {
    return;
  }
  throw new Error("Read is outside the review workspace");
}
