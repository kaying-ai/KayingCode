// 消息流分组（纯函数）：userInput 各自成组，其后的助手行并入同组，
// timelineMarker 独立成组并打断前后回合。
//
// 与 Flutter 的 _groupRows 同规则；服务端中途换 turnId 不拆组——分组依据是
// 行类型与到达顺序，不是 turnId（turnId 由 CLI 裁决归属，客户端零归属逻辑）。
import type {
  ConversationRow,
  AssistantTextRow,
  TurnHeaderRow,
} from "@zcode/shared/kayingcode-protocol-v4";

export interface AssistantTurnParts {
  /** 正文段（保持原位置的 reasoning / toolCall / subagent 仍在 items 里）。 */
  items: ConversationRow[];
  /** 回合头从 items 中摘出，渲染在组尾作为分隔线。 */
  header: TurnHeaderRow | null;
  /** 最后一个正文段的 rowId：反馈/时间标签只挂它，避免每段都挂。 */
  lastTextRowId: number | null;
}

export function groupRows(rows: readonly ConversationRow[]): ConversationRow[][] {
  const groups: ConversationRow[][] = [];
  let current: ConversationRow[] | null = null;
  for (const row of rows) {
    if (row.kind === "timelineMarker") {
      current = null;
      groups.push([row]);
      continue;
    }
    if (row.kind === "userInput" || current === null || current[0]!.kind === "userInput") {
      const group = [row];
      groups.push(group);
      current = group;
    } else {
      current.push(row);
    }
  }
  return groups;
}

/**
 * 把一组助手行拆成「渲染序列 + 回合头」。
 * 连续 assistantText 合并成一段（正文可能被协议拆成多行），非文本行保持原位。
 */
export function assistantTurnParts(rows: readonly ConversationRow[]): AssistantTurnParts {
  const items: ConversationRow[] = [];
  let header: TurnHeaderRow | null = null;
  let lastTextRowId: number | null = null;
  for (const row of rows) {
    if (row.kind === "turnHeader") {
      header = row;
      continue;
    }
    if (row.kind === "assistantText") {
      const previous = items[items.length - 1];
      if (previous && previous.kind === "assistantText") {
        items[items.length - 1] = mergeAssistantText(previous, row);
      } else {
        items.push(row);
      }
      lastTextRowId = row.rowId;
      continue;
    }
    items.push(row);
  }
  return { items, header, lastTextRowId };
}

function mergeAssistantText(left: AssistantTextRow, right: AssistantTextRow): AssistantTextRow {
  return {
    ...right,
    rowId: left.rowId,
    text: left.text + right.text,
    // 合并段的状态取后者：前段已 complete、后段仍在 streaming 时不能提前收起光标。
    state: right.state,
  };
}

/** 最后一个用户输入行的 rowId（投递徽标只挂它）。 */
export function lastUserInputRowId(rows: readonly ConversationRow[]): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index]!.kind === "userInput") return rows[index]!.rowId;
  }
  return null;
}

/** 回合头里的错误摘要：取本回合首个 error 工具行的信息，截断 160 字。 */
export function turnErrorSummary(rows: readonly ConversationRow[]): string | null {
  for (const row of rows) {
    if (row.kind !== "toolCall" || row.status !== "error") continue;
    const detail = row.error
      ? `${row.error.code} ${row.error.message}`.trim()
      : (row.output?.text ?? "").trim();
    if (detail.length === 0) continue;
    return detail.length > 160 ? `${detail.slice(0, 160)}…` : detail;
  }
  return null;
}

/** 已结束的子代理行（后台面板用；运行中由快照的 subagents.running 承载）。 */
export function endedSubagentRows(rows: readonly ConversationRow[]): ConversationRow[] {
  return rows.filter(
    (row) => row.kind === "subagent" && (row.status === "success" || row.status === "failed" || row.status === "cancelled"),
  );
}

/** 最新一条 completedSuccess 回合的 turnHeader（文件面板默认展开对象）。 */
export function latestCompletedTurn(rows: readonly ConversationRow[]): TurnHeaderRow | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    if (row.kind === "turnHeader" && row.state === "completedSuccess") return row;
  }
  return null;
}

/**
 * 行所属回合的 turnHeader。
 * 服务端的文件变更查询只接受 turnHeader 作为行目标（它才是权威归属），因此从任意
 * 用户行发起「查看文件变更」必须先回到本回合的 turnHeader。
 */
export function turnHeaderOfRow(
  rows: readonly ConversationRow[],
  row: ConversationRow,
): TurnHeaderRow | null {
  for (const candidate of rows) {
    if (candidate.kind !== "turnHeader") continue;
    if (candidate.turnId === row.turnId) return candidate;
  }
  return null;
}
