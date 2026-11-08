// 网页拥有 KayingCode 配对、目录、会话和恢复；壳层不同时挂载原生连接 hooks。
import { View, Text, Button } from "@tarojs/components";
import type { MobileAccount } from "@kayingcode/mobile-client-core";
import type { ConnectionStatus } from "../flow/store";
import { ZcodeWebLauncher } from "./zcodeWebLauncher";
import { ZcodeWorkspacePanel } from "./zcodeWorkspacePanel";
import { zcodeEntryMode } from "../flow/zcodeEntry";

export function SessionTab({
  account,
  status,
  error,
  workspaceLabel,
  onOpenChat,
  onManageDevices,
}: {
  account: MobileAccount | null;
  status: ConnectionStatus;
  error: string | null;
  workspaceLabel: string;
  onOpenChat: (sessionId: string | null) => void;
  onManageDevices: () => void;
}) {
  if (!account) {
    return (
      <View className="screen">
        <Text className="screen-title">会话</Text>
        <Text className="empty">还没有 Bot。先在 Bot 列表添加一台桌面设备。</Text>
        <Button className="action action-primary full-action" onClick={onManageDevices}>
          去添加设备
        </Button>
      </View>
    );
  }
  if (account.backendType === "zcode" && zcodeEntryMode(process.env.TARO_ENV) === "native") {
    return (
      <ZcodeWorkspacePanel
        account={account}
        status={status}
        error={error}
        workspaceLabel={workspaceLabel}
        onManageDevices={onManageDevices}
        onOpenChat={onOpenChat}
      />
    );
  }
  return <ZcodeWebLauncher account={account} />;
}
