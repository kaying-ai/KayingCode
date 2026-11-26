// `git worktree list --porcelain -z` 的解析；从 gitWorktreeRepo 拆出以控制单文件行数。
// 字段以 NUL 分隔，记录之间多一个空字段；未知字段忽略（例如 detached 标记本身不携带值）。
export interface PorcelainWorktree {
  path: string;
  head: string | null;
  branchName: string | null;
  prunable: boolean;
  bare: boolean;
}

export function parseWorktreeListPorcelain(output: string): PorcelainWorktree[] {
  const records: PorcelainWorktree[] = [];
  let current: PorcelainWorktree | null = null;
  for (const field of output.split("\0")) {
    if (field === "") {
      if (current) records.push(current);
      current = null;
      continue;
    }
    const spaceIndex = field.indexOf(" ");
    const key = spaceIndex < 0 ? field : field.slice(0, spaceIndex);
    const value = spaceIndex < 0 ? "" : field.slice(spaceIndex + 1);
    if (key === "worktree") {
      if (current) records.push(current);
      current = { path: value, head: null, branchName: null, prunable: false, bare: false };
      continue;
    }
    if (!current) continue;
    if (key === "HEAD") current.head = value || null;
    else if (key === "branch") current.branchName = value.replace(/^refs\/heads\//, "");
    else if (key === "prunable") current.prunable = true;
    else if (key === "bare") current.bare = true;
  }
  if (current) records.push(current);
  return records;
}
