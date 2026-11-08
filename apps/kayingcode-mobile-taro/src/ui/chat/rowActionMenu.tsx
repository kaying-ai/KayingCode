// 行操作菜单（长按 userInput / assistantText 触发）。
//
// 五项与 Flutter 一致：编辑并重发、重试本轮、分叉对话、回滚文件到此、查看文件变更。
// 回滚文件是唯一有破坏性的动作，必须二次确认（文案说明对话本身会保留）。
import { useState } from "react";
import { View, Text, Input, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { ConversationRow } from "@zcode/shared/kayingcode-protocol-v4";

export interface RowActionHandlers {
  onEdit: (text: string) => void;
  onRetry: () => void;
  onFork: () => void;
  onRewind: () => void;
  onViewFiles: () => void;
}

export function RowActionMenu({
  row,
  busy,
  handlers,
  onClose,
}: {
  row: ConversationRow;
  busy: boolean;
  handlers: RowActionHandlers;
  onClose: () => void;
}) {
  const isUserInput = row.kind === "userInput";
  const initial = isUserInput ? row.text : "";
  const [editing, setEditing] = useState<string | null>(null);

  const confirmRewind = async () => {
    const result = await Taro.showModal({
      title: "回滚文件？",
      content: "将把此消息之后产生的文件变更回滚，对话保留",
      confirmText: "回滚",
      cancelText: "取消",
    });
    if (result.confirm) handlers.onRewind();
  };

  if (editing !== null) {
    return (
      <View className="sheet-overlay">
        <View className="sheet-backdrop" onClick={() => setEditing(null)} />
        <View className="sheet">
          <Text className="sheet-title">编辑消息</Text>
          <Input
            className="control"
            value={editing}
            onInput={(event) => setEditing(event.detail.value)}
          />
          <View className="sheet-actions">
            <Button className="action action-ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button
              className="action action-primary"
              disabled={editing.trim().length === 0}
              onClick={() => {
                handlers.onEdit(editing.trim());
                setEditing(null);
              }}
            >
              重发
            </Button>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="sheet-overlay">
      <View className="sheet-backdrop" onClick={onClose} />
      <View className="sheet">
        {isUserInput ? (
          <Text className="menu-item" onClick={() => !busy && setEditing(initial)}>
            编辑并重发
          </Text>
        ) : null}
        <Text className="menu-item" onClick={() => !busy && handlers.onRetry()}>
          重试本轮
        </Text>
        <Text className="menu-item" onClick={() => !busy && handlers.onFork()}>
          分叉对话
        </Text>
        <Text className="menu-item" onClick={() => !busy && void confirmRewind()}>
          回滚文件到此
        </Text>
        <Text className="menu-item" onClick={() => !busy && handlers.onViewFiles()}>
          查看文件变更
        </Text>
        <Text className="menu-item menu-cancel" onClick={onClose}>
          取消
        </Text>
      </View>
    </View>
  );
}
