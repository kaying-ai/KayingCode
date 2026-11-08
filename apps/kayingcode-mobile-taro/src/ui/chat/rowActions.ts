// 行操作回调装配（长按菜单 → 会话命令）。
//
// 单点收口「行目标必须有稳定身份」这条协议约束：conversationRowTargetSchema 是 strict 且
// entityId 必填，所以 rowId + entityId 只能成对下发，客户端不得用 turnId 之类推断补全。
// 缺身份时不是静默失败，而是走 reject 出口把原因告诉用户。
import type {
  ConversationRow,
  ConversationRowTarget,
} from "@zcode/shared/kayingcode-protocol-v4";
import type { RelaySessionCommands } from "@kayingcode/mobile-client-core";
import type { RowActionHandlers } from "./rowActionMenu";

export interface RowActionContext {
  /** 命令面；链路丢失时为 null，此时所有动作只提示不发送。 */
  commands: RelaySessionCommands | null;
  sessionId: string;
  /** 统一错误出口：前缀 + 详情。 */
  run: (action: () => Promise<unknown>, prefix: string) => void;
  /** 客户端侧拒绝（如缺少稳定身份）。 */
  reject: (text: string) => void;
  /** 关闭菜单。 */
  close: () => void;
  /** 「查看文件变更」的落地动作（由页面决定打开哪个弹层）。 */
  viewFiles: () => void;
}

function withTarget(
  row: ConversationRow,
  context: RowActionContext,
  invoke: (target: ConversationRowTarget) => void,
): void {
  if (!row.entityId) {
    context.reject("该消息暂不支持此操作");
    return;
  }
  invoke({ rowId: row.rowId, entityId: row.entityId });
}

export function buildRowActions(
  row: ConversationRow,
  context: RowActionContext,
): RowActionHandlers {
  const { commands, sessionId } = context;

  /** 关菜单 → 校验链路 → 校验身份 → 下发。先关菜单再报错，不留半开弹层。 */
  const issue = (
    invoke: (target: ConversationRowTarget, active: RelaySessionCommands) => Promise<unknown>,
    prefix: string,
  ) => {
    context.close();
    if (!commands) {
      context.reject("连接已丢失，请返回会话页重试");
      return;
    }
    withTarget(row, context, (target) =>
      context.run(() => invoke(target, commands), prefix),
    );
  };

  return {
    onEdit: (text) =>
      issue(
        (target, active) => active.editUserQuery(sessionId, { target, newText: text }),
        "编辑失败",
      ),
    onRetry: () => issue((target, active) => active.retryTurn(sessionId, target), "重试失败"),
    onFork: () => issue((target, active) => active.forkAssistant(sessionId, target), "分叉失败"),
    onRewind: () =>
      issue((target, active) => active.applyFileRewind(sessionId, target), "回滚失败"),
    onViewFiles: () => {
      context.close();
      context.viewFiles();
    },
  };
}
