import { View, Text } from "@tarojs/components";
import type { SessionSummary } from "@zcode/shared/kayingcode-protocol-v4";
import { getSessionPreviewLabel } from "./sessionWorkspaceView";

/** 两端会话入口共用列表行，避免通用卡片样式覆盖列表的间距与分隔线。 */
export function SessionListItem({
  session,
  onOpen,
}: {
  session: SessionSummary;
  onOpen: (sessionId: string) => void;
}) {
  const date = new Date(session.lastActivityAt);
  const activity = `${date.getMonth() + 1}/${date.getDate()}`;
  return (
    <View className="session-item" onClick={() => onOpen(session.sessionId)}>
      <View className="session-item-heading">
        <Text className="session-item-title text-ui-base">{session.title || "未命名会话"}</Text>
        <Text className="session-item-time text-ui-xs">{activity}</Text>
      </View>
      <View className="session-item-detail">
        <Text className="session-item-preview text-ui-sm">{getSessionPreviewLabel(session)}</Text>
        {session.pendingInteraction ? (
          <Text className="session-item-status text-ui-xs">待处理</Text>
        ) : null}
      </View>
    </View>
  );
}
