import { Button, View, Text } from "@tarojs/components";
import { Icon } from "./icons/Icon";

export function SessionEmptyState({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: () => void;
}) {
  return (
    <Button
      className="session-empty-create text-ui-base"
      aria-label="创建新会话"
      disabled={disabled}
      onClick={onCreate}
    >
      <View className="session-empty-create-icon">
        <Icon name="add_comment_outlined" size={20} />
      </View>
      <View className="session-empty-create-main">
        <Text className="session-empty-create-title">新会话</Text>
        <Text className="session-empty-create-copy text-ui-sm">开始新的对话</Text>
      </View>
      <Icon name="chevron_right" size={20} />
    </Button>
  );
}
