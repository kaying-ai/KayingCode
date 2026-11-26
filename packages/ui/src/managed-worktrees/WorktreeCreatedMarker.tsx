// 会话历史中的"已创建 worktree"（managed-worktrees/CONTRACT.md §6）：由 CLI 写入历史，
// 桌面、手机与重启后看到的是同一项；默认收起，可展开查看 git 与拷贝输出。
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { managedWorktreeTestIds } from "./managedWorktreeTestIds.js";
import { WorktreeOutputBlock } from "./WorktreeOutputBlock.js";

export function WorktreeCreatedMarker({
  rowId,
  output,
}: {
  rowId: string | number;
  output: string;
}) {
  const { intl } = useKayingCodeIntl();
  return (
    <div data-row-id={rowId} className="py-1">
      <WorktreeOutputBlock
        testId={managedWorktreeTestIds.createdMarker}
        title={intl.formatMessage({ id: "managedWorktrees.created.title" })}
        status="done"
        output={output}
      />
    </div>
  );
}
