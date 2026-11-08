// 通用底部弹层与只读查看器（工具输出 / JSON / diff）。
//
// Flutter 用 showModalBottomSheet + 全屏 92% 高；weapp 没有系统弹层，这里用
// 固定定位 + 遮罩 + 内部滚动复刻同一层级关系。
import { View, Text, ScrollView } from "@tarojs/components";
import type { ConversationRow } from "@zcode/shared/kayingcode-protocol-v4";
import { DiffView } from "./diffView";
import { extractDiff, toolErrorText, toolOutputText, toolTargetPath } from "./toolDetail";

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View className="sheet-overlay">
      <View className="sheet-backdrop" onClick={onClose} />
      <View className="sheet sheet-tall">
        <View className="sheet-head">
          <Text className="sheet-title">{title}</Text>
          <Text className="sheet-close" onClick={onClose}>
            关闭
          </Text>
        </View>
        <ScrollView className="sheet-body" scrollY>
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

export function JsonView({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Text className="sheet-empty">（无数据）</Text>;
  return <Text className="json-text">{JSON.stringify(value, null, 2)}</Text>;
}

const DATA_URI = /data:[^;]+;base64,[A-Za-z0-9+/=]+/g;

export function ToolOutputSheet({
  row,
  onClose,
}: {
  row: ConversationRow;
  onClose: () => void;
}) {
  const name = row.kind === "toolCall" ? row.toolName : "tool";
  const path = toolTargetPath(row);
  const diff = extractDiff(row);
  const text = toolOutputText(row).replace(DATA_URI, "[图片数据]");
  const error = toolErrorText(row);
  const truncated = row.kind === "toolCall" ? row.output?.truncated : undefined;
  const empty = !diff && text.trim().length === 0 && !error;
  return (
    <Sheet title={path ? `${name} · ${path}` : name} onClose={onClose}>
      {diff ? <DiffView diff={diff} /> : null}
      {text ? <Text className="tool-output">{text}</Text> : null}
      {error ? <Text className="sheet-error">{error}</Text> : null}
      {truncated ? (
        <Text className="sheet-note">{`后续内容已省略 · 共 ${truncated.totalBytes} 字节`}</Text>
      ) : null}
      {empty ? (
        <Text className="sheet-note">
          查看器未收到输出数据——宿主未在该工具行中下发内容(部分图片输出不下发图片数据)
        </Text>
      ) : null}
    </Sheet>
  );
}
