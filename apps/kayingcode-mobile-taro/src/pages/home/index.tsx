// 移动壳首页（对齐 Flutter RootShell）：底栏 会话列表 / 项目列表 / 我的 三 Tab，
// Tab 在页面内切换（不重建连接、不丢列表状态）；设备管理、聊天详情、
// 设置二级、配对、自动化都从这里 push 出去。
import { useEffect, useState } from "react";
import { View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import {
  parseMobileConnection,
  removeMobileAccount,
  renameMobileAccount,
  type MobileAccount,
} from "@kayingcode/mobile-client-core";
import { addAccountFromInput, forceAddAccountFromInput } from "../../flow/session";
import { setAppResumed, subscribeNotifyAlerts } from "../../flow/notifications";
import { closeSessionsIndex, openSessionsIndex } from "../../flow/sessionsIndex";
import { flow } from "../../flow/store";
import { useFlow } from "../../flow/useFlow";
import { useUnreadTotal } from "../../flow/useNotifications";
import { BottomNav, type ShellTab } from "../../ui/bottomNav";
import { BotList } from "../../ui/botList";
import { ConnectionPrompt } from "../../ui/connectionPrompt";
import { ConfirmDialog, PromptDialog } from "../../ui/dialog";
import { FirstRun } from "../../ui/firstRun";
import { SettingsHome, type SettingsSection } from "../../ui/settingsHome";
import { RecentProjects } from "../../ui/recentProjects";
import { useTheme } from "../../ui/theme";
import { openZcodeWebsite } from "../../ui/zcodeWebsite";

export default function HomePage() {
  const theme = useTheme();
  const state = useFlow();
  const [tab, setTab] = useState<ShellTab>("session");
  const [addTarget, setAddTarget] = useState<"kayingcode" | "zcode" | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<MobileAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MobileAccount | null>(null);

  // 从配对/设备管理返回时刷新档案（档案由 core 落盘，壳层只读快照）。
  useDidShow(() => {
    flow.refreshAccounts();
  });

  const unread = useUnreadTotal();

  // 会话索引的唯一上游订阅挂在壳层：不随 Tab 切换重建，未读角标才能在
  // Bot/我的 Tab 继续更新；通知推导与会话列表共用同一拍快照（一次订阅）。
  useEffect(() => {
    const connection = flow.getConnection();
    if (state.status !== "paired" || !connection) {
      closeSessionsIndex();
      return;
    }
    openSessionsIndex(connection);
    return () => closeSessionsIndex();
  }, [state.status]);

  // 前后台切换参与通知三重门控（后台必推、前台正看该会话不推）。
  useEffect(() => {
    const onShow = () => setAppResumed(true);
    const onHide = () => setAppResumed(false);
    Taro.onAppShow(onShow);
    Taro.onAppHide(onHide);
    return () => {
      Taro.offAppShow(onShow);
      Taro.offAppHide(onHide);
    };
  }, []);

  // 页内告警：Taro 没有系统通知通道（weapp 无、H5 未申请权限），用 toast 如实
  // 呈现，不假装成系统通知。
  useEffect(
    () =>
      subscribeNotifyAlerts((alert) => {
        void Taro.showToast({ title: alert.title, icon: "none" });
      }),
    [],
  );

  /** 添加只落盘并展示卡片；点击 Bot 后由会话页自动完成连接与首次配对。 */
  const afterAdd = () => {
    flow.refreshAccounts();
    setTab("session");
    void Taro.showToast({ title: "已添加，点击 Bot 连接", icon: "none" });
  };

  const commitAdd = (rawUrl: string) => {
    const result = addAccountFromInput(rawUrl);
    if (result.status === "invalid") {
      void Taro.showToast({ title: "无法解析该连接信息", icon: "none" });
      return;
    }
    if (result.status === "unknown-host") {
      setPendingUrl(rawUrl);
      return;
    }
    afterAdd();
  };

  const openSection = (section: SettingsSection) => {
    // 自动化是独立的 push 页；其余 section 由设置二级页按参数渲染。
    if (section === "automation") {
      Taro.navigateTo({ url: "/pages/automation/index" });
      return;
    }
    Taro.navigateTo({ url: `/pages/settings/index?section=${section}` });
  };

  const openDevices = () => {
    Taro.navigateTo({ url: "/pages/device/index" });
  };

  return (
    <View className={`${theme.className} shell`}>
      <View className="shell-body">
        {tab === "session" ? (
          state.accounts.length === 0 ? (
            <FirstRun
              onConnect={(backend) => setAddTarget(backend)}
              onImport={openDevices}
              onSettings={() => setTab("settings")}
            />
          ) : (
            <BotList
              accounts={state.accounts}
              activeAccountId={state.activeAccountId}
              status={state.status}
              error={state.error}
              onSelect={openZcodeWebsite}
              onAdd={(backend) => setAddTarget(backend)}
              onManage={openDevices}
              onRename={(account) => setRenameTarget(account)}
              onDelete={(account) => setDeleteTarget(account)}
            />
          )
        ) : null}

        {tab === "projects" ? <RecentProjects accounts={state.accounts} /> : null}

        {tab === "settings" ? <SettingsHome onOpenSection={openSection} /> : null}
      </View>

      <BottomNav active={tab} onChange={setTab} unread={unread} />

      {addTarget ? (
        <ConnectionPrompt
          key={addTarget}
          backend={addTarget}
          onCancel={() => setAddTarget(null)}
          onSubmit={(value) => {
            setAddTarget(null);
            commitAdd(value);
          }}
        />
      ) : null}

      {pendingUrl ? (
        <ConfirmDialog
          title="未知服务器"
          message={`该连接指向 ${
            parseMobileConnection(pendingUrl)?.host ?? "未知主机"
          }，不在已知服务器列表。连接后，你发送的所有对话内容都会经过这台服务器。仅在你确信来源可靠时继续。`}
          confirmLabel="仍要添加"
          onCancel={() => setPendingUrl(null)}
          onConfirm={() => {
            const url = pendingUrl;
            setPendingUrl(null);
            const account = url ? forceAddAccountFromInput(url) : null;
            if (account) afterAdd();
          }}
        />
      ) : null}

      {renameTarget ? (
        <PromptDialog
          title="修改本地名称"
          initial={renameTarget.label}
          confirmLabel="保存"
          onCancel={() => setRenameTarget(null)}
          onSubmit={(value) => {
            renameMobileAccount(renameTarget.id, value);
            setRenameTarget(null);
            flow.refreshAccounts();
          }}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title="删除 Bot 连接？"
          message={
            deleteTarget.backendType === "kayingcode"
              ? `将移除「${deleteTarget.label}」的连接信息并清除已保存的凭据。安装身份和其他服务器的连接不受影响。`
              : `将移除「${deleteTarget.label}」的连接信息。`
          }
          confirmLabel="删除"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            if (target.id === state.activeAccountId) flow.resetConnection();
            removeMobileAccount(target.id);
            flow.refreshAccounts();
          }}
        />
      ) : null}
    </View>
  );
}
