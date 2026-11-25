// composer 头部的 worktree 入口（managed-worktrees/CONTRACT.md §3、§7）。
// 能力来自 Provider 的 supportsWorktreeCwd 查询；入口在能力未就绪时可见但禁用，并给出原因。
// 受控值同时投影到 worktreeDraftSelection：发送路径（SessionPane）不在同一条 props 链上，
// 只在点击时读取这份投影，不保存第二份可编辑状态。
import { useEffect } from "react";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { describeWorktreeSupportDisabledReason } from "./managedWorktreeErrors.js";
import { useOptionalManagedWorktreeContext } from "./ManagedWorktreeProvider.js";
import type { WorktreeSupport } from "./useWorktreeSupport.js";
import { publishWorktreeDraftSelection, type WorktreeDraftSelection } from "./worktreeDraftSelection.js";
import { WorktreeBranchPicker, WorktreeToggle } from "./WorktreeComposerControls.js";

export type { WorktreeDraftSelection } from "./worktreeDraftSelection.js";

/**
 * `value`：undefined = 未启用；null = 启用并从当前 HEAD 检出；string = 启用并指定起点。
 * 草稿选择由宿主持有，组件不保存第二份状态。
 */
export function ManagedWorktreeComposerEntry({
  projectId,
  currentBranchLabel,
  value,
  onChange,
  enabled = true,
  support: supportOverride,
}: {
  projectId: string | null;
  currentBranchLabel: string;
  value: WorktreeDraftSelection;
  onChange(value: WorktreeDraftSelection): void;
  enabled?: boolean;
  /** 测试或宿主显式注入；缺省读取 Provider 的 supportsWorktreeCwd 结果。 */
  support?: WorktreeSupport;
}) {
  const { intl } = useKayingCodeIntl();
  const context = useOptionalManagedWorktreeContext();
  const support = supportOverride ?? context?.support ?? null;
  const workspacePath = context?.workspacePath;
  const workspaceIdentity = context?.workspaceIdentity;
  const visible = Boolean(enabled && projectId && support?.visible);
  useEffect(() => {
    // 入口不可见时投影关闭：能力/项目失效后不能残留一个可用的 worktree 选择。
    if (!workspacePath) return;
    publishWorktreeDraftSelection(workspacePath, workspaceIdentity, visible ? value : undefined);
  }, [value, visible, workspaceIdentity, workspacePath]);
  if (!visible || !support || !projectId) return null;
  const disabledReason = support.available
    ? null
    : describeWorktreeSupportDisabledReason(intl, support.disabledReason ?? "unsupported");
  return (
    <>
      {value !== undefined && support.available ? (
        <WorktreeBranchPicker
          projectId={projectId}
          selectedRef={value}
          currentBranchLabel={currentBranchLabel}
          onSelect={(ref) => onChange(ref)}
          className="px-0 pt-0"
        />
      ) : null}
      <WorktreeToggle
        className="ml-auto"
        checked={value !== undefined}
        disabled={!support.available}
        disabledReason={disabledReason}
        onCheckedChange={(checked) => onChange(checked ? null : undefined)}
      />
    </>
  );
}
