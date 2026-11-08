// 消息流上下方的横幅：模式、重连、上下文用量、目标、后台任务、排队、待交互。
//
// 位置与 Flutter 一致：模式/用量/重连挂在消息流上方或紧贴其下，
// 目标 → 后台任务 → 排队 → 待交互 依次贴在 composer 之上（阻塞式交互离输入越近越好）。
import { useState } from "react";
import { View, Text, Input, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type {
  BackgroundWorkSummary,
  GoalState,
  PendingInteraction,
  QueueItem,
  QueueState,
  SessionUsageState,
} from "@zcode/shared/kayingcode-protocol-v4";
import { InteractionCard, type InteractionAnswer } from "../interactionCard";
import { Icon, Spinner } from "../icons/Icon";
import { formatQuotaReset, formatTokensCompact, modeIsHot, modeLabel } from "./chatFormat";

export function ModeBanner({ mode }: { mode: string }) {
  if (!modeIsHot(mode)) return null;
  const yolo = mode === "yolo" || mode === "full";
  return (
    <View className={`banner ${yolo ? "banner-error" : "banner-warn"}`}>
      <Text className="banner-text">
        {`${modeLabel(mode)} · ${yolo ? "全部操作免确认，请确认在工作机上" : "只读研究，方案产出后需你确认才会动手"}`}
      </Text>
    </View>
  );
}

export function ReconnectBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View className="banner banner-warn">
      <Spinner size={12} />
      <Text className="banner-text">连接已断开，正在自动重连…</Text>
    </View>
  );
}

export function ContextUsageBar({ usage }: { usage: SessionUsageState | null }) {
  const contextWindow = usage?.contextWindow;
  if (!contextWindow || !(contextWindow.maxTokens > 0)) return null;
  const used = contextWindow.usedTokens;
  const max = contextWindow.maxTokens;
  const ratio = used / max;
  return (
    <View className="ctx-bar">
      <View className="ctx-track">
        <View
          className={`ctx-fill ${ratio > 0.8 ? "ctx-warn" : ""}`}
          style={{ width: `${Math.min(ratio * 100, 100)}%` }}
        />
      </View>
      <Text className="ctx-text">{`${formatTokensCompact(used)}/${formatTokensCompact(max)}`}</Text>
    </View>
  );
}

export function GoalBanner({ goal }: { goal: GoalState | null }) {
  const objective = goal?.objective ?? "";
  if (!goal || objective.length === 0) return null;
  return (
    <View className="banner banner-ok">
      <Icon className="banner-icon" name="flag_outlined" />
      <Text className="banner-text">{objective}</Text>
      <Text className="banner-tail">{goalStatusLabel(goal.status)}</Text>
    </View>
  );
}

function goalStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "进行中";
    case "paused":
      return "已暂停";
    case "verifying":
      return "验证中";
    case "verified":
      return "已验证";
    case "notSatisfied":
      return "未满足";
    case "failed":
      return "失败";
    default:
      return status;
  }
}

export function BackgroundWorksBar({ works }: { works: readonly BackgroundWorkSummary[] }) {
  const running = works.filter((work) => work.status === "running" && work.endedAt === undefined);
  if (running.length === 0) return null;
  return (
    <View className="banner banner-run">
      <Spinner size={12} />
      <Text className="banner-text">
        {`后台任务 ${running.length} 个运行中: ${running.map((work) => work.title || work.workId).join("、")}`}
      </Text>
    </View>
  );
}

export function QueueBar({
  queue,
  busy,
  onSendNow,
  onEdit,
  onDelete,
  onToggleAutoDrain,
}: {
  queue: QueueState | null;
  busy: boolean;
  onSendNow: (item: QueueItem) => void;
  onEdit: (item: QueueItem) => void;
  onDelete: (item: QueueItem) => void;
  onToggleAutoDrain: (value: boolean) => void;
}) {
  const items = queue?.items ?? [];
  if (items.length === 0) return null;
  const autoDrain = queue?.autoDrain === true;
  return (
    <View className="queue">
      <View className="queue-head">
        <Text className="queue-title">{`排队消息 ${items.length}`}</Text>
        <Text
          className="queue-auto"
          onClick={() => {
            if (!busy) onToggleAutoDrain(!autoDrain);
          }}
        >
          {autoDrain ? "自动发送: 开" : "自动发送: 关"}
        </Text>
      </View>
      {items.map((item) => (
        <View key={item.queueItemId} className="queue-item">
          <Text className="queue-text">{itemText(item)}</Text>
          <View className="queue-actions">
            <Text className="queue-action" onClick={() => !busy && onSendNow(item)}>
              立即发送
            </Text>
            <Text className="queue-action" onClick={() => !busy && onEdit(item)}>
              编辑
            </Text>
            <Text className="queue-action queue-danger" onClick={() => !busy && onDelete(item)}>
              删除
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** compact 意图没有正文，展示成维护条目而不是空行。 */
export function itemText(item: QueueItem): string {
  if (item.kind === "compact") return "/compact（压缩上下文）";
  const text = item.text?.trim() ?? "";
  return text.length > 0 ? text : "（空消息）";
}

export function useQueueActions(handlers: {
  edit: (item: QueueItem, text: string) => void;
  remove: (item: QueueItem) => void;
}) {
  const [editing, setEditing] = useState<{ item: QueueItem; text: string } | null>(null);
  const askEdit = (item: QueueItem) => setEditing({ item, text: itemText(item) });
  const askDelete = async (item: QueueItem) => {
    const result = await Taro.showModal({
      title: "删除排队消息？",
      content: `将删除「${itemText(item)}」`,
      confirmText: "删除",
      cancelText: "取消",
    });
    if (result.confirm) handlers.remove(item);
  };
  const submitEdit = () => {
    if (!editing) return;
    const text = editing.text.trim();
    if (text.length > 0) handlers.edit(editing.item, text);
    setEditing(null);
  };
  const editor = editing ? (
    <View className="sheet-overlay">
      <View className="sheet-backdrop" onClick={() => setEditing(null)} />
      <View className="sheet">
        <Text className="sheet-title">编辑排队消息</Text>
        <Input
          className="control"
          value={editing.text}
          onInput={(event) => setEditing({ item: editing.item, text: event.detail.value })}
        />
        <View className="sheet-actions">
          <Button className="action action-ghost" onClick={() => setEditing(null)}>
            取消
          </Button>
          <Button className="action action-primary" disabled={!editing.text.trim()} onClick={submitEdit}>
            保存
          </Button>
        </View>
      </View>
    </View>
  ) : null;
  return { askEdit, askDelete, editor };
}

export function PendingInteractions({
  interactions,
  busy,
  onAnswer,
}: {
  interactions: readonly PendingInteraction[];
  busy: boolean;
  onAnswer: (interaction: PendingInteraction, answer: InteractionAnswer) => void;
}) {
  if (interactions.length === 0) return null;
  return (
    <View className="pending-interactions">
      {interactions.map((interaction) => (
        <InteractionCard
          key={interaction.interactionId}
          interaction={interaction}
          busy={busy}
          onAnswer={(answer) => onAnswer(interaction, answer)}
        />
      ))}
    </View>
  );
}

/** 额度重置文案（用量面板与剩余额度共用）。 */
export function quotaResetLabel(resetAt: number): string {
  const formatted = formatQuotaReset(resetAt);
  return formatted ? `重置 ${formatted}` : "";
}
