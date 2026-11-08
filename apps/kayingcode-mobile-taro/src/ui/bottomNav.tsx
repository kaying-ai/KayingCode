// 壳层底栏：会话列表 / 项目列表 / 我的。Tab 在同一个壳页面内切换（对齐 Flutter
// RootShell 的 index 切换），不重建连接、不丢列表状态。
//
// 图标逐字对齐 Flutter root_shell.dart 的 NavigationBar：每项都有
// icon / selectedIcon 一对，选中时换成实心版本。
import { View, Text } from "@tarojs/components";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/icons";

export type ShellTab = "session" | "projects" | "settings";

const TABS: { id: ShellTab; icon: IconName; selectedIcon: IconName; label: string }[] = [
  { id: "session", icon: "forum_outlined", selectedIcon: "forum", label: "会话列表" },
  {
    id: "projects",
    icon: "grid_view_rounded",
    selectedIcon: "grid_view_rounded",
    label: "项目列表",
  },
  { id: "settings", icon: "person_outline", selectedIcon: "person", label: "我的" },
];

export function BottomNav({
  active,
  onChange,
  unread = 0,
}: {
  active: ShellTab;
  onChange: (tab: ShellTab) => void;
  /** 未读任务总数；>0 时在「会话」Tab 上显示角标。 */
  unread?: number;
}) {
  return (
    <View className="bottom-nav">
      {TABS.map((tab) => (
        <View
          key={tab.id}
          className={`bottom-nav-item ${active === tab.id ? "active" : ""}`}
          onClick={() => {
            if (active !== tab.id) onChange(tab.id);
          }}
        >
          <Icon
            className="bottom-nav-icon"
            name={active === tab.id ? tab.selectedIcon : tab.icon}
          />
          <Text>{tab.label}</Text>
          {tab.id === "session" && unread > 0 ? (
            <Text className="bottom-nav-badge">{unread > 99 ? "99+" : String(unread)}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
