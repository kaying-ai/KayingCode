// 我的（设置首页）：产品卡 + 一级分组入口（对齐 Flutter SettingsHomePage）。
// 二级配置在 pages/settings 按 section 渲染；没有契约的能力保留入口并标注不可用。
//
// 分组行图标逐条取 Flutter settings_page.dart 里同一行的 ListTile leading：
// 外观与语言 palette_outlined、连接与通知 devices_outlined、模型与服务
// extension_outlined、自动化 schedule_outlined、诊断与关于 info_outline。
// Taro 多出来的「设备管理」一行用 devices_other——Flutter 在设备分组里用的就是它。
import { useState } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import brandIcon from "../assets/kayingcode.png";
import supportQr from "../assets/support-contact-qr.png";
import { appVersion } from "./appVersion";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/icons";

export type SettingsSection = "appearance" | "connections" | "models" | "automation" | "about";

const COMPANY_URL = "https://kayingai.com";

function GroupRow({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <View className="list-card" onClick={onClick}>
      <Text className="settings-row-icon">
        <Icon name={icon} size={18} />
      </Text>
      <View className="list-main">
        <Text className="list-title">{title}</Text>
        {subtitle ? <Text className="list-subtitle">{subtitle}</Text> : null}
      </View>
      <Text className="muted">
        <Icon name="chevron_right" size={18} />
      </Text>
    </View>
  );
}

export function SettingsHome({
  onOpenSection,
}: {
  onOpenSection: (section: SettingsSection) => void;
}) {
  const [qrOpen, setQrOpen] = useState(false);

  return (
    <View className="screen settings-home">
      <View className="surface-card product-card">
        <View className="product-card-head">
          <Image className="product-icon" src={brandIcon} mode="aspectFit" />
          <View className="list-main">
            <Text className="product-name">KayingCode</Text>
            <Text className="list-subtitle">Taro 移动端 · v{appVersion}</Text>
          </View>
        </View>
        <View className="list-card product-row">
          <Text className="settings-row-icon">
            <Icon name="language_outlined" size={18} />
          </Text>
          <View className="list-main">
            <Text className="list-title">公司官网</Text>
            <Text className="list-subtitle">{COMPANY_URL}</Text>
          </View>
          <Text
            className="muted"
            onClick={() => {
              void Taro.setClipboardData({ data: COMPANY_URL });
              void Taro.showToast({ title: "官网地址已复制", icon: "none" });
            }}
          >
            <Icon name="copy_outlined" size={18} />
          </Text>
        </View>
        <View className="list-card product-row" onClick={() => setQrOpen(true)}>
          <Text className="settings-row-icon">
            <Icon name="support_agent_outlined" size={18} />
          </Text>
          <View className="list-main">
            <Text className="list-title">联系客服</Text>
            <Text className="list-subtitle">查看客服二维码</Text>
          </View>
          <Image className="product-qr-thumb" src={supportQr} mode="aspectFit" />
        </View>
      </View>

      <View className="surface-card settings-group">
        <GroupRow
          icon="palette_outlined"
          title="外观与语言"
          subtitle="主题、字号与代码字号"
          onClick={() => onOpenSection("appearance")}
        />
        <GroupRow
          icon="devices_outlined"
          title="连接与通知"
          subtitle="设备管理、协议日志"
          onClick={() => onOpenSection("connections")}
        />
        <GroupRow
          icon="extension_outlined"
          title="模型与服务"
          subtitle="模型供应商、服务管理、用量"
          onClick={() => onOpenSection("models")}
        />
      </View>

      <View className="surface-card settings-group">
        <GroupRow
          icon="schedule_outlined"
          title="自动化"
          subtitle="定时与触发任务"
          onClick={() => onOpenSection("automation")}
        />
        <GroupRow
          icon="info_outline"
          title="诊断与关于"
          subtitle={`KayingCode v${appVersion}`}
          onClick={() => onOpenSection("about")}
        />
      </View>

      {qrOpen ? (
        <View className="dialog-overlay" onClick={() => setQrOpen(false)}>
          <View className="dialog-card">
            <Text className="dialog-title">联系客服</Text>
            <Image className="product-qr-full" src={supportQr} mode="aspectFit" />
            <Text className="caption qr-hint">扫描二维码联系客服，也可截图后从相册识别</Text>
            <View className="dialog-actions">
              <Text className="action action-ghost" onClick={() => setQrOpen(false)}>
                关闭
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
