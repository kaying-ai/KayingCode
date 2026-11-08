// 设置二级页（对齐 Flutter SettingsPage）：从「我的」按 section 进入。
//
// 阶段 1 只交付能真正生效的项（外观主题、设备管理入口、断开当前设备）；
// 语言/字号、诊断与日志、模型与服务、自动化等尚无可对齐的移动端契约，
// 保留入口并显式标注当前不可用，不呈现为可点击的已实现能力。
import { View, Text, Button } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { flow } from "../../flow/store";
import { appVersion } from "../../ui/appVersion";
import { goBack } from "../../ui/navigation";
import { Icon } from "../../ui/icons/Icon";
import { ModelProvidersPanel } from "../../ui/modelProvidersPanel";
import type { SettingsSection } from "../../ui/settingsHome";
import { useTheme, type ThemeMode } from "../../ui/theme";
import "./index.css";

const TITLES: Record<SettingsSection, string> = {
  appearance: "外观与语言",
  connections: "连接与通知",
  models: "模型与服务",
  automation: "自动化",
  about: "诊断与关于",
};

const THEME_LABEL: Record<ThemeMode, string> = {
  dark: "深色",
  light: "浅色",
  system: "跟随系统",
};

function UnavailableCard({ title, note }: { title: string; note: string }) {
  return (
    <View className="surface-card settings-unavailable">
      <Text className="list-title">{title}</Text>
      <Text className="caption">当前不可用</Text>
      <Text className="caption">{note}</Text>
    </View>
  );
}

export default function SettingsPage() {
  const theme = useTheme();
  const router = useRouter();
  const section = (router.params.section ?? "appearance") as SettingsSection;
  const active = flow.getActiveAccount();

  // 断开当前设备：释放 attachment 与连接（旧代数不复用），保留档案与凭据。
  const disconnect = () => {
    flow.resetConnection();
    void Taro.showToast({ title: "已断开当前设备", icon: "none" });
  };

  return (
    <View className={theme.className}>
      <View className="screen settings-screen">
        <View className="topbar settings-topbar">
          <Icon className="icon-button" name="arrow_back" size={20} onClick={() => goBack()} />
          <View className="topbar-main">
            <Text className="screen-title">{TITLES[section] ?? "设置"}</Text>
          </View>
        </View>

        {section === "appearance" ? (
          <View className="surface-card">
            <Text className="list-title">外观主题</Text>
            <View className="theme-options">
              {(["dark", "light", "system"] as ThemeMode[]).map((mode) => (
                <Text
                  key={mode}
                  className={`theme-choice ${theme.mode === mode ? "chosen" : ""}`}
                  onClick={() => theme.setMode(mode)}
                >
                  {THEME_LABEL[mode]}
                </Text>
              ))}
            </View>
            <Text className="caption settings-note">
              语言、界面字号与代码字号随移动端文案本地化批次一起提供。
            </Text>
          </View>
        ) : null}

        {section === "connections" ? (
          <>
            <View className="surface-card">
              <View
                className="list-card settings-row"
                onClick={() => Taro.navigateTo({ url: "/pages/device/index" })}
              >
                <View className="list-main">
                  <Text className="list-title">设备管理</Text>
                  <Text className="list-subtitle">添加、重命名、重连与导入导出</Text>
                </View>
                <Icon name="chevron_right" size={18} className="muted" />
              </View>
            </View>
            {active ? (
              <Button className="action action-danger settings-action" onClick={disconnect}>
                断开当前设备
              </Button>
            ) : null}
            <Text className="caption settings-note">
              协议帧日志、诊断日志与后台通知随诊断批次提供。
            </Text>
          </>
        ) : null}

        {section === "models" ? (
          <>
            <ModelProvidersPanel />
            <UnavailableCard title="用量" note="额度、配额限制与订阅详情尚未接入。" />
            <UnavailableCard title="服务管理" note="插件、技能与命令的只读浏览尚未接入。" />
          </>
        ) : null}

        {section === "about" ? (
          <>
            <View className="surface-card">
              <Text className="list-title">KayingCode</Text>
              <Text className="caption">Taro 移动端 · H5 / 微信小程序 · v{appVersion}</Text>
              <Text className="caption settings-note">
                桌面端与手机端共用同一套会话；代码与命令始终在电脑上执行。
              </Text>
            </View>
            <UnavailableCard
              title="诊断与日志"
              note="诊断日志、协议日志、RPC 调试器与信道浏览器尚未接入。"
            />
          </>
        ) : null}
      </View>
    </View>
  );
}
