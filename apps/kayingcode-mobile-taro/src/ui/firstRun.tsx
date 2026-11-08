// 空 Bot 档案时的首启入口（对齐 Flutter FirstRunPage）：两个后端添加入口 +
// 从备份导入 + 设置。KayingCode 与 ZCode 都可在 Taro 侧连接（ZCode 的会话通道
// 属会话映射批次，见会话 Tab 的标注）。
//
// 图标与 Flutter first_run_page.dart 一一对应：设置 settings_outlined、
// ZCode desktop_windows_outlined、KayingCode link_outlined、
// 从备份导入 settings_backup_restore、行尾 chevron_right。
import { View, Text, Image } from "@tarojs/components";
import type { MobileBackendType } from "@kayingcode/mobile-client-core";
import brandIcon from "../assets/kayingcode.png";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/icons";

function ConnectChoice({
  title,
  description,
  icon,
  note,
  onTap,
}: {
  title: string;
  description: string;
  icon: IconName;
  note?: string;
  onTap: () => void;
}) {
  return (
    <View className="surface-card first-run-choice" onClick={onTap}>
      <Icon className="first-run-choice-icon" name={icon} size={20} />
      <View className="list-main">
        <Text className="list-title">{title}</Text>
        <Text className="list-subtitle">{description}</Text>
        {note ? <Text className="caption first-run-choice-note">{note}</Text> : null}
      </View>
      <Icon name="chevron_right" size={18} className="muted" />
    </View>
  );
}

export function FirstRun({
  onConnect,
  onImport,
  onSettings,
}: {
  onConnect: (backend: MobileBackendType) => void;
  onImport: () => void;
  onSettings: () => void;
}) {
  return (
    <View className="screen first-run">
      <View className="first-run-head">
        <Image className="brand-mark" src={brandIcon} mode="aspectFit" />
        <Text className="section-title first-run-brand">KayingCode</Text>
        <Icon className="icon-button" name="settings_outlined" size={20} onClick={onSettings} />
      </View>
      <Text className="screen-title">把桌面工作区带到手机上</Text>
      <Text className="first-run-copy">连接你正在使用的桌面端，随时查看会话并继续工作。</Text>
      <ConnectChoice
        title="连接 KayingCode"
        description="使用 KayingCode 桌面端生成的完整 V2 授权链接"
        icon="link_outlined"
        onTap={() => onConnect("kayingcode")}
      />
      <Text className="link-action" onClick={onImport}>
        <Icon name="settings_backup_restore" size={18} /> 从备份导入设备
      </Text>
      <View className="first-run-notice">
        <Text className="list-title">开始前</Text>
        <Text className="caption">
          请在电脑上打开对应产品的远程连接信息。手机可扫码、从相册识别二维码，或粘贴完整连接链接；KayingCode
          授权由网页完成，链接失效时请在桌面重新生成。
        </Text>
      </View>
    </View>
  );
}
