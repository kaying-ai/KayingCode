// 会话列表（对齐 Flutter BotListPage）：卡片展示后端徽标、连接状态与远端
// host:port；可切换当前 Bot、重命名、左滑删除，并提供添加入口。
//
// 图标与 Flutter bot_list_page.dart 对齐：卡片左侧是后端图标（KayingCode
// smart_toy_outlined / ZCode desktop_windows_outlined），当前项右侧是
// check_circle，重命名是 edit_outlined，顶栏是 tune_outlined，添加入口是
// link_outlined / desktop_windows_outlined。
import { View, Text } from "@tarojs/components";
import {
  MOBILE_BACKEND_DISPLAY_NAME,
  describeMobileRemote,
  mobileAccountParams,
  type MobileAccount,
} from "@kayingcode/mobile-client-core";
import type { ConnectionStatus } from "../flow/store";
import { SwipeRow } from "./swipeRow";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/icons";
import { zcodeEntryMode } from "../flow/zcodeEntry";

function statusText(status: ConnectionStatus): string {
  switch (status) {
    case "pairing":
      return "等待桌面端批准";
    case "connecting":
      return "连接中";
    case "paired":
      return "已连接";
    case "error":
      return "连接失败";
    default:
      return "未连接";
  }
}

function statusClass(status: ConnectionStatus): string {
  if (status === "paired") return "bot-status bot-status-ok";
  if (status === "error") return "bot-status bot-status-error";
  return "bot-status";
}

function backendIcon(account: MobileAccount): IconName {
  return account.backendType === "kayingcode" ? "smart_toy_outlined" : "desktop_windows_outlined";
}

function BotCard({
  account,
  current,
  status,
  error,
  onRename,
}: {
  account: MobileAccount;
  current: boolean;
  status: ConnectionStatus;
  error: string | null;
  onRename: () => void;
}) {
  const remote = describeMobileRemote(mobileAccountParams(account));
  const website =
    account.backendType === "kayingcode" || zcodeEntryMode(process.env.TARO_ENV) === "website";
  return (
    // 点击统一由 SwipeRow 处理；卡片再绑定一次会在冒泡时重复推入网页，返回后仍留在容器。
    <View className={`bot-card ${current ? "bot-card-current" : ""}`}>
      <Icon
        className={`bot-card-icon ${status === "paired" ? "bot-card-icon-ok" : ""}`}
        name={backendIcon(account)}
        size={26}
      />
      <View className="bot-card-main">
        <Text className="bot-card-title">{account.label}</Text>
        <View className="bot-card-meta">
          <Text className="bot-badge">{MOBILE_BACKEND_DISPLAY_NAME[account.backendType]}</Text>
          <Text className={website ? "bot-status" : statusClass(status)}>
            {website
              ? account.backendType === "kayingcode"
                ? "Web 工作台"
                : "官方网页"
              : statusText(status)}
          </Text>
        </View>
        <Text className="bot-card-remote">{remote}</Text>

        {!website && current && error ? <Text className="bot-card-error">{error}</Text> : null}
      </View>
      <View className="bot-card-actions">
        {current ? (
          <Icon
            className={status === "paired" ? "bot-card-check bot-card-icon-ok" : "bot-card-check"}
            name="check_circle"
            size={18}
          />
        ) : null}
        <Icon
          className="icon-button bot-card-edit"
          name="edit_outlined"
          size={18}
          onClick={(event) => {
            event.stopPropagation();
            onRename();
          }}
        />
      </View>
    </View>
  );
}

export function BotList({
  accounts,
  activeAccountId,
  status,
  error,
  onSelect,
  onAdd,
  onManage,
  onRename,
  onDelete,
}: {
  accounts: readonly MobileAccount[];
  activeAccountId: string | null;
  status: ConnectionStatus;
  error: string | null;
  onSelect: (account: MobileAccount) => void;
  onAdd: (backend: "kayingcode" | "zcode") => void;
  onManage: () => void;
  onRename: (account: MobileAccount) => void;
  onDelete: (account: MobileAccount) => void;
}) {
  return (
    <View className="screen bot-list">
      <View className="topbar bot-list-topbar">
        <View className="topbar-main">
          <Text className="screen-title">会话列表</Text>
          <Text className="topbar-subtitle">
            {accounts.length === 0
              ? "先连接桌面 Bot，再进入会话。"
              : "打开 Web 工作台管理会话和终端；连接管理见右上角。"}
          </Text>
        </View>
        <Icon className="icon-button" name="tune_outlined" size={20} onClick={onManage} />
      </View>

      {accounts
        .filter((account) => account.backendType === "kayingcode")
        .map((account) => {
          const current = account.id === activeAccountId;
          return (
            <SwipeRow
              key={account.id}
              actionIcon="delete_outline"
              actionLabel="删除"
              onAction={() => onDelete(account)}
              onTap={() => onSelect(account)}
            >
              <BotCard
                account={account}
                current={current}
                status={current ? status : "idle"}
                error={current ? error : null}
                onRename={() => onRename(account)}
              />
            </SwipeRow>
          );
        })}

      <Text className="section-title bot-list-add-title">添加 Bot</Text>
      <View className="surface-card first-run-choice" onClick={() => onAdd("kayingcode")}>
        <Icon className="first-run-choice-icon" name="link_outlined" size={20} />
        <View className="list-main">
          <Text className="list-title">连接 KayingCode</Text>
          <Text className="list-subtitle">使用桌面配对码，可能需要电脑批准</Text>
        </View>
        <Icon className="muted" name="add" size={18} />
      </View>
    </View>
  );
}
