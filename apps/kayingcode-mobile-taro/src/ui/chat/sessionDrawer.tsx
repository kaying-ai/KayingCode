// 会话抽屉：当前 Bot 当前工作区的会话列表（搜索、新会话、重命名、删除）。
//
// 数据只来自 v4 sessions-index（与桌面任务列表同源），排序是 lastActivityAt 降序——
// sessions-index 的 delta 只保证「更新即替换」，不保证顺序，客户端必须自己排。
import { useState } from "react";
import { View, Text, Input, Button, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { SessionSummary } from "@zcode/shared/kayingcode-protocol-v4";
import { Icon } from "../icons/Icon";
import { formatRelativeTime } from "./chatFormat";

export function SessionDrawer({
  open,
  workspaceLabel,
  sessions,
  currentSessionId,
  onClose,
  onPick,
  onSwitchWorkspace,
  onOpenSettings,
  onRename,
  onDelete,
}: {
  open: boolean;
  workspaceLabel: string;
  sessions: readonly SessionSummary[];
  currentSessionId: string | null;
  onClose: () => void;
  onPick: (sessionId: string | null) => void;
  onSwitchWorkspace: () => void;
  onOpenSettings: () => void;
  onRename: (sessionId: string, title: string) => void;
  onDelete: (sessionId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<SessionSummary | null>(null);
  const [renaming, setRenaming] = useState<{ sessionId: string; title: string } | null>(null);

  if (!open) return null;
  const term = query.trim().toLowerCase();
  const sorted = [...sessions].sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  const filtered = term.length === 0 ? sorted : sorted.filter((s) => s.title.toLowerCase().includes(term));

  const askRename = (entry: SessionSummary) => {
    setMenu(null);
    setRenaming({ sessionId: entry.sessionId, title: entry.title });
  };
  const askDelete = async (entry: SessionSummary) => {
    setMenu(null);
    const result = await Taro.showModal({
      title: "删除会话？",
      content: `将删除「${entry.title || entry.sessionId}」，此操作不可恢复`,
      confirmText: "删除",
      cancelText: "取消",
    });
    if (result.confirm) onDelete(entry.sessionId);
  };

  return (
    <View className="sheet-overlay">
      <View className="sheet-backdrop" onClick={onClose} />
      <View className="drawer">
        <View className="list-card" onClick={onSwitchWorkspace}>
          <View className="list-main">
            <Text className="list-title">{workspaceLabel || "工作区"}</Text>
            <Text className="list-subtitle">切换工作区</Text>
          </View>
          <Icon name="keyboard_arrow_down" />
        </View>
        <Input
          className="control drawer-search"
          value={query}
          placeholder="搜索会话"
          onInput={(event) => setQuery(event.detail.value)}
        />
        <View className="drawer-actions">
          <Button
            className="action action-ghost"
            onClick={() => {
              onPick(null);
              onClose();
            }}
          >
            <Icon name="add" size={14} /> 新会话
          </Button>
          <Button className="action action-ghost" onClick={onOpenSettings}>
            <Icon name="settings_outlined" size={14} /> 设置
          </Button>
        </View>
        <ScrollView className="drawer-list" scrollY>
          {filtered.length === 0 ? (
            <Text className="empty">
              {term.length > 0 ? `没有匹配「${query}」的会话` : "暂无会话，点「＋新会话」开始对话"}
            </Text>
          ) : (
            filtered.map((entry) => (
              <View
                key={entry.sessionId}
                className={`list-card ${entry.sessionId === currentSessionId ? "drawer-current" : ""}`}
                onClick={() => {
                  onPick(entry.sessionId);
                  onClose();
                }}
                onLongPress={() => setMenu(entry)}
              >
                <View className="list-main">
                  <Text className="list-title">{entry.title || entry.sessionId}</Text>
                  <Text className="list-subtitle">
                    {entry.lastAssistantPreview || phaseLabel(entry.phase)}
                  </Text>
                </View>
                <View className="drawer-meta">
                  {entry.pendingInteraction ? <Text className="status status-running">待处理</Text> : null}
                  <Text className="caption">{formatRelativeTime(entry.lastActivityAt)}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {menu ? (
        <View className="sheet-overlay">
          <View className="sheet-backdrop" onClick={() => setMenu(null)} />
          <View className="sheet">
            <Text className="sheet-title">{menu.title || "会话操作"}</Text>
            <Text className="menu-item" onClick={() => askRename(menu)}>
              重命名
            </Text>
            <Text className="menu-item menu-danger" onClick={() => void askDelete(menu)}>
              删除
            </Text>
            <Text className="menu-item menu-cancel" onClick={() => setMenu(null)}>
              取消
            </Text>
          </View>
        </View>
      ) : null}

      {renaming ? (
        <View className="sheet-overlay">
          <View className="sheet-backdrop" onClick={() => setRenaming(null)} />
          <View className="sheet">
            <Text className="sheet-title">重命名会话</Text>
            <Input
              className="control"
              value={renaming.title}
              onInput={(event) => setRenaming({ ...renaming, title: event.detail.value })}
            />
            <View className="sheet-actions">
              <Button className="action action-ghost" onClick={() => setRenaming(null)}>
                取消
              </Button>
              <Button
                className="action action-primary"
                disabled={renaming.title.trim().length === 0}
                onClick={() => {
                  onRename(renaming.sessionId, renaming.title.trim());
                  setRenaming(null);
                }}
              >
                保存
              </Button>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function phaseLabel(phase: string): string {
  if (phase === "running" || phase === "prewarming") return "工作中";
  if (phase === "error") return "出错";
  if (phase === "draft") return "草稿";
  return "空闲";
}
