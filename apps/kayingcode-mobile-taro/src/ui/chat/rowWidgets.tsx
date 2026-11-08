// 消息流的行渲染：用户气泡、助手正文、思考块、时间线标记、回合头、文件变更卡、子代理。
// 工具卡在 toolTile.tsx。
//
// userInput 的 origin/epilogueStart 不额外分叉：移动端与 Flutter 同口径，把系统来源
//   也当普通气泡渲染，避免出现半实现的「run 卡」。
import { useState } from "react";
import { View, Text } from "@tarojs/components";
import type {
  AssistantTextRow,
  ConversationRow,
  ReasoningRow,
  SubagentRow,
  TimelineMarkerRow,
  TurnHeaderRow,
  UserInputRow,
} from "@zcode/shared/kayingcode-protocol-v4";
import { DiffStat } from "./diffView";
import { ToolCallTile } from "./toolTile";
import { formatDuration, formatRowTime } from "./chatFormat";
import { Markdown, StreamingMarkdown } from "./markdownView";
import { assistantTurnParts, turnErrorSummary } from "./rowGroup";
import { Icon, Spinner } from "../icons/Icon";
import type { IconName } from "../icons/icons";

export interface RowCallbacks {
  /** 长按 userInput / assistantText：打开操作菜单。 */
  onRowLongPress: (row: ConversationRow) => void;
  /** 工具卡「查看」：打开输出查看器。 */
  onViewTool: (row: ConversationRow) => void;
  /** 回合文件变更卡 / 查看文件变更。 */
  onOpenTurnFiles: (header: TurnHeaderRow) => void;
  onOpenAttachment: (ref: string, fileName: string, mime: string) => void;
}

export function TurnGroup({
  rows,
  running,
  userInputId,
  callbacks,
}: {
  rows: readonly ConversationRow[];
  running: boolean;
  userInputId: number | null;
  callbacks: RowCallbacks;
}) {
  const first = rows[0]!;
  if (rows.length === 1 && first.kind === "timelineMarker") {
    return <TimelineMarker row={first} />;
  }
  if (first.kind === "userInput") {
    return (
      <View className="turn turn-user">
        <UserBubble
          row={first}
          processing={running && first.rowId === userInputId}
          onLongPress={() => callbacks.onRowLongPress(first)}
          onOpenAttachment={callbacks.onOpenAttachment}
        />
      </View>
    );
  }
  const parts = assistantTurnParts(rows);
  const errorSummary = parts.header ? turnErrorSummary(rows) : null;
  const showFeedback = parts.header !== null && parts.header.state !== "running";
  return (
    <View className="turn turn-assistant">
      {parts.items.map((row) => (
        <Row
          key={row.rowId}
          row={row}
          showFeedback={showFeedback && row.rowId === parts.lastTextRowId}
          callbacks={callbacks}
        />
      ))}
      {parts.header ? <TurnHeader row={parts.header} errorSummary={errorSummary} /> : null}
      {parts.header?.fileChanges && parts.header.fileChanges.files > 0 ? (
        <FileChangesCard header={parts.header} onOpen={callbacks.onOpenTurnFiles} />
      ) : null}
    </View>
  );
}

function Row({
  row,
  showFeedback,
  callbacks,
}: {
  row: ConversationRow;
  showFeedback: boolean;
  callbacks: RowCallbacks;
}) {
  switch (row.kind) {
    case "userInput":
      return (
        <UserBubble
          row={row}
          processing={false}
          onLongPress={() => callbacks.onRowLongPress(row)}
          onOpenAttachment={callbacks.onOpenAttachment}
        />
      );
    case "assistantText":
      return (
        <AssistantBubble
          row={row}
          showFeedback={showFeedback}
          onLongPress={() => callbacks.onRowLongPress(row)}
        />
      );
    case "reasoning":
      return <ReasoningTile row={row} />;
    case "toolCall":
      return <ToolCallTile row={row} onView={callbacks.onViewTool} />;
    case "subagent":
      return <SubagentTile row={row} />;
    case "timelineMarker":
      return <TimelineMarker row={row} />;
    case "turnHeader":
      return <TurnHeader row={row} errorSummary={null} />;
    default:
      // artifact / hookInvocation：与 Flutter 同口径，移动端不渲染（协议字段见 rows.ts，
      // 两者在移动场景没有可交互的落地形态）。
      return null;
  }
}

function UserBubble({
  row,
  processing,
  onLongPress,
  onOpenAttachment,
}: {
  row: UserInputRow;
  processing: boolean;
  onLongPress: () => void;
  onOpenAttachment: (ref: string, fileName: string, mime: string) => void;
}) {
  const attachments = row.attachments ?? [];
  return (
    <View className="bubble-user-wrap">
      <View className="bubble-user" onLongPress={onLongPress}>
        {row.text ? <Text className="bubble-user-text">{row.text}</Text> : null}
        {attachments.map((attachment) => (
          <View
            key={attachment.ref}
            className="attach"
            onClick={() => onOpenAttachment(attachment.ref, attachment.fileName, attachment.mime)}
          >
            <Icon className="attach-icon" name="attach_file" />
            <Text className="attach-name">{attachment.fileName || "附件"}</Text>
            <Text className="attach-size">{formatBytes(attachment.bytes)}</Text>
          </View>
        ))}
      </View>
      {processing ? (
        <View className="badge badge-run">
          <Spinner size={11} /> 处理中
        </View>
      ) : null}
    </View>
  );
}

function AssistantBubble({
  row,
  showFeedback,
  onLongPress,
}: {
  row: AssistantTextRow;
  showFeedback: boolean;
  onLongPress: () => void;
}) {
  const streaming = row.state === "streaming";
  const time = formatRowTime(Number(row.createdAt) || 0);
  return (
    <View className="bubble-assistant" onLongPress={onLongPress}>
      {streaming ? (
        <StreamingMarkdown text={row.text} streaming fontSize={13} />
      ) : (
        <Markdown text={row.text} fontSize={13} />
      )}
      {showFeedback ? (
        <View className="bubble-foot">
          <Text className="foot-action" onLongPress={onLongPress}>
            长按操作
          </Text>
          {time ? <Text className="foot-time">{time}</Text> : null}
        </View>
      ) : streaming ? (
        <View className="bubble-foot">
          <View className="foot-running">
            <Spinner size={12} /> 生成中
          </View>
          {time ? <Text className="foot-time">{time}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function ReasoningTile({ row }: { row: ReasoningRow }) {
  const [open, setOpen] = useState(true);
  const streaming = row.state === "streaming";
  const preview = firstNonEmptyLine(row.text);
  return (
    <View className={`reasoning ${streaming ? "reasoning-running" : ""}`}>
      <Text className="reasoning-head" onClick={() => setOpen(!open)}>
        <Icon name={open ? "keyboard_arrow_down" : "keyboard_arrow_up"} />{" "}
        {streaming ? "思考中…" : "思考"}
      </Text>
      {open ? (
        <Markdown text={row.text} fontSize={12} />
      ) : preview ? (
        <Text className="reasoning-preview">{preview}</Text>
      ) : null}
      {streaming || row.durationMs ? (
        <View className="reasoning-foot">
          {streaming ? <Spinner size={12} /> : null}
          {row.durationMs ? formatDuration(row.durationMs) : ""}
        </View>
      ) : null}
    </View>
  );
}

function SubagentTile({ row }: { row: SubagentRow }) {
  const meta = SUBAGENT_STATUS[row.status] ?? { label: String(row.status), tone: "faint" };
  return (
    <View className="subagent">
      <Text className="subagent-title">{`子代理 · ${row.subagentType}`}</Text>
      <Text className={`subagent-status subagent-${meta.tone}`}>
        {`${meta.label}  ${row.summaryText ?? ""}`}
      </Text>
    </View>
  );
}

const SUBAGENT_STATUS: Record<string, { label: string; tone: string }> = {
  running: { label: "运行中", tone: "run" },
  success: { label: "已完成", tone: "ok" },
  failed: { label: "失败", tone: "error" },
  cancelled: { label: "已取消", tone: "warn" },
};

function TimelineMarker({ row }: { row: TimelineMarkerRow }) {
  const meta = markerMeta(row);
  return (
    <View className="timeline">
      <Text className={`timeline-text timeline-${meta.tone}`}>
        <Icon name={meta.icon} /> {meta.text}
      </Text>
    </View>
  );
}

function markerMeta(row: TimelineMarkerRow): { icon: IconName; text: string; tone: string } {
  const marker = row.marker as unknown as Record<string, unknown>;
  const type = String(marker.type ?? "");
  const str = (key: string) => (typeof marker[key] === "string" ? (marker[key] as string) : "");
  switch (type) {
    case "compact": {
      const before = typeof marker.tokensBefore === "number" ? String(marker.tokensBefore) : "";
      const after = typeof marker.tokensAfter === "number" ? String(marker.tokensAfter) : "?";
      const status = COMPACT_STATUS[str("status")] ?? str("status");
      return {
        icon: "compress",
        text: `压缩上下文 · ${status}${before ? ` · ${before}→${after} tokens` : ""}`,
        tone: "run",
      };
    }
    case "forkNotice":
      return { icon: "fork_right", text: "从会话分叉而来", tone: "faint" };
    case "forkCreated":
      return { icon: "fork_right", text: "已创建分叉会话", tone: "faint" };
    case "modelChange":
      return {
        icon: "swap_horiz",
        text: `模型切换 ${str("fromModel")} → ${str("toModel")}`,
        tone: "warn",
      };
    case "goalSet":
      return { icon: "flag_outlined", text: `设定目标: ${str("objective")}`, tone: "ok" };
    case "goalVerify":
      return {
        icon: "fact_check_outlined",
        text: `目标验证 第${marker.iteration ?? "?"}轮 · ${GOAL_OUTCOME[str("outcome")] ?? str("outcome")}`,
        tone: "ok",
      };
    case "retryNotice":
      return {
        icon: "refresh",
        text: `自动重试 第${marker.attempt ?? "?"}次 (${str("reasonCode")})`,
        tone: "warn",
      };
    case "checkpointRestored":
      return { icon: "restore", text: "已恢复检查点", tone: "faint" };
    default:
      return { icon: "info_outline", text: type, tone: "faint" };
  }
}

const COMPACT_STATUS: Record<string, string> = {
  running: "进行中",
  success: "完成",
  failed: "失败",
  noop: "无需压缩",
  cancelled: "已取消",
};

const GOAL_OUTCOME: Record<string, string> = {
  running: "进行中",
  pass: "通过",
  notSatisfied: "未满足",
  failed: "失败",
};

function TurnHeader({ row, errorSummary }: { row: TurnHeaderRow; errorSummary: string | null }) {
  const label = turnHeaderLabel(row, errorSummary);
  if (!label) return null;
  return (
    <View className="turn-head">
      <View className="turn-rule" />
      <Text className={`turn-head-text turn-head-${row.state}`}>{label}</Text>
      <View className="turn-rule" />
    </View>
  );
}

function turnHeaderLabel(row: TurnHeaderRow, errorSummary: string | null): string {
  switch (row.state) {
    case "running":
      return row.activeMs ? `本轮执行中 · ${formatDuration(row.activeMs)}` : "本轮执行中";
    case "completedSuccess": {
      const parts = ["本轮完成"];
      if (row.activeMs) parts.push(formatDuration(row.activeMs));
      const changes = row.fileChanges;
      if (changes && changes.files > 0) {
        parts.push(`+${changes.additions} -${changes.deletions} ${changes.files} 文件`);
      }
      return parts.join(" · ");
    }
    case "completedInterrupted":
      return "已中断";
    case "failed":
      return errorSummary ? `本轮失败 · ${errorSummary}` : "本轮失败";
    default:
      return "";
  }
}

function FileChangesCard({
  header,
  onOpen,
}: {
  header: TurnHeaderRow;
  onOpen: (header: TurnHeaderRow) => void;
}) {
  const changes = header.fileChanges!;
  return (
    <View className="file-changes" onClick={() => onOpen(header)}>
      <Text className="file-changes-text">{`${changes.files} 个文件已更改`}</Text>
      <DiffStat additions={changes.additions} deletions={changes.deletions} />
      <Icon className="file-changes-caret" name="chevron_right" />
    </View>
  );
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split("\n")) {
    if (line.trim().length > 0) return line.trim();
  }
  return "";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
