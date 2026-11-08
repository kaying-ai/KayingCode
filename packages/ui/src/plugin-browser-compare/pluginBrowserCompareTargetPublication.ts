import {
  toTapTapGamePreviewUrl,
  type PluginBrowserComparePublicationV1,
  type TapTapPreviewPublicationV1,
} from "@zcode/shared";

/**
 * Keep the comparison source/session receipt authoritative while projecting a newer
 * successful TapTap build into the target guest.
 */
export function resolvePluginBrowserCompareTargetPublication(
  comparison: PluginBrowserComparePublicationV1,
  latestPublication: TapTapPreviewPublicationV1 | null,
): PluginBrowserComparePublicationV1 {
  if (
    !latestPublication ||
    latestPublication.workspaceKey !== comparison.workspaceKey ||
    normalizeProjectRoot(latestPublication.projectRoot) !==
      normalizeProjectRoot(comparison.projectRoot) ||
    latestPublication.revision <= comparison.targetPublication.revision
  ) {
    return comparison;
  }

  // 修复依据：成功发布会更新 preview receipt，但旧流程可能漏掉
  // prepare_visual_comparison。只派生目标 publication identity，避免源游戏也被重载。
  return {
    ...comparison,
    targetUrl: toTapTapGamePreviewUrl(latestPublication.previewUrl),
    targetPublication: {
      operationId: latestPublication.operationId,
      revision: latestPublication.revision,
    },
  };
}

function normalizeProjectRoot(value: string): string {
  const normalized = value.trim().replaceAll("\\", "/").replace(/\/+$/u, "");
  return /^[A-Za-z]:\//u.test(normalized) ? normalized.toLowerCase() : normalized;
}
