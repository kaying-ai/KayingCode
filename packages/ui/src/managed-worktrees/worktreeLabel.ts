// worktree 显示名 `<仓库名> · <bucket>`（managed-worktrees/CONTRACT.md §1、§4）。
// 只由 worktree 根目录推导：受管布局为 <受管根>/<bucket>/<仓库名>。
export function formatWorktreeLabel(
  intl: { formatMessage: (desc: { id: string }, values?: Record<string, string>) => string },
  worktreeRoot: string | null | undefined,
): string | null {
  if (!worktreeRoot) return null;
  // Windows 路径与 POSIX 路径都按两种分隔符切分；结尾分隔符不影响结果。
  const segments = worktreeRoot.split(/[\\/]+/).filter(Boolean);
  const name = segments.at(-1);
  const bucket = segments.at(-2);
  return name && bucket
    ? intl.formatMessage({ id: "managedWorktrees.name" }, { repo: name, bucket })
    : null;
}

/** 目录名（仓库名）；worktree 行在没有 bucket 信息时用它做标题。 */
export function worktreeDirectoryName(worktreeRoot: string): string {
  const segments = worktreeRoot.split(/[\\/]+/).filter(Boolean);
  return segments.at(-1) ?? worktreeRoot;
}
