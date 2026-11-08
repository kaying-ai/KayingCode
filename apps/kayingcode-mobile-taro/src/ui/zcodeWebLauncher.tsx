import { View, Text, Button } from "@tarojs/components";
import type { MobileAccount } from "@kayingcode/mobile-client-core";
import { openZcodeWebsite } from "./zcodeWebsite";

export function ZcodeWebLauncher({ account }: { account: MobileAccount }) {
  return (
    <View className="screen">
      <Text className="screen-title">{account.label}</Text>
      <Text className="empty">
        {account.backendType === "kayingcode"
          ? "配对、工作区和会话在 KayingCode 网页中继续。"
          : "登录、工作区和会话在 ZCode 官方网页中继续。"}
      </Text>
      <Button
        className="action action-primary full-action"
        onClick={() => openZcodeWebsite(account)}
      >
        {account.backendType === "kayingcode" ? "打开网页" : "打开官方网页"}
      </Button>
    </View>
  );
}
