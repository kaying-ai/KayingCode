import type { ModelSelection } from "@zcode/provider";

/** 模型显式变更判定；localrun 无 Start Plan 推荐，仅用于避免无意义的 override 写入。 */
export function hasExplicitModelChanged(
  previous: ModelSelection | null | undefined,
  next: ModelSelection | null | undefined,
): next is ModelSelection {
  return Boolean(
    next && (previous?.providerId !== next.providerId || previous.modelId !== next.modelId),
  );
}
