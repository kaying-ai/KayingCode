// worktree 任务的附加目录：源仓库内的 root 映射到 worktree 中对应路径，起点中不存在的目录不加入。
// 从 service.ts 拆出以控制单文件行数；规则见上游 docs/git/worktree.md §2.1。
import { stat } from "node:fs/promises";
import { mapProjectRootsIntoWorktree } from "@zcode/shared/managed-worktree";

export async function resolveWorktreeAdditionalDirectories(
  roots: readonly string[],
  placement: { sourceRoot: string; worktreeRoot: string; cwd: string },
): Promise<string[]> {
  const candidates = mapProjectRootsIntoWorktree(roots, placement);
  const exists = await Promise.all(
    candidates.map((path) =>
      stat(path).then(
        (stats) => stats.isDirectory(),
        () => false,
      ),
    ),
  );
  return candidates.filter((_, index) => exists[index]);
}
