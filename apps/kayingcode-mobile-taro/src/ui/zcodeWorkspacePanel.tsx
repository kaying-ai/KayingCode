// ZCode 后端在会话 Tab 的面板：连接 → 工作区目录 → 打开工作区桥。
//
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Button, ScrollView, Input } from "@tarojs/components";
import { describeError, type MobileAccount } from "@kayingcode/mobile-client-core";
import type { SessionSummary } from "@zcode/shared/kayingcode-protocol-v4";
import {
  connectZcodeAccount,
  onZcodeWorkspaceListUpdated,
  openZcodeWorkspace,
} from "../flow/zcodeSession";
import type { ConnectionStatus } from "../flow/store";
import { describeZcodeConnectionError, type ZcodeWorkspace } from "../flow/zcode";
import { subscribeSessionsIndex } from "../flow/sessionsIndex";
import { Icon } from "./icons/Icon";
import { SessionListItem } from "./sessionListItem";
import { zcodeAuthForAccount } from "../flow/zcodeAuth";
import { ZcodeLogin } from "./zcodeLogin";

export function ZcodeWorkspacePanel({
  account,
  status,
  error,
  workspaceLabel,
  onManageDevices,
  onOpenChat,
}: {
  account: MobileAccount;
  status: ConnectionStatus;
  error: string | null;
  workspaceLabel: string;
  onManageDevices: () => void;
  onOpenChat: (sessionId: string | null) => void;
}) {
  const [workspaces, setWorkspaces] = useState<ZcodeWorkspace[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [search, setSearch] = useState("");
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const auth = zcodeAuthForAccount(account);
  const generation = useRef(0);

  const connect = useCallback(async () => {
    const currentAuth = zcodeAuthForAccount(account);
    if (currentAuth && !currentAuth.signedIn) {
      setLoginOpen(true);
      return;
    }
    const gen = ++generation.current;
    setBusy(true);
    setMessage("连接中…");
    try {
      const list = await connectZcodeAccount(account);
      if (gen !== generation.current) return;
      setWorkspaces(list);
      setMessage(list.length === 0 ? "这台设备没有可用的工作区" : "");
    } catch (caught) {
      if (gen === generation.current) setMessage(describeZcodeConnectionError(caught));
      if (
        gen === generation.current &&
        caught instanceof Error &&
        caught.message === "auth-required"
      )
        setLoginOpen(true);
    } finally {
      if (gen === generation.current) setBusy(false);
    }
  }, [account]);

  // 切换 Bot 使在途连接结果失效，并清掉上一台的工作区。
  useEffect(() => {
    generation.current += 1;
    setWorkspaces([]);
    setMessage("");
    setShowWorkspaces(false);
    setLoginOpen(false);
    return () => {
      generation.current += 1;
    };
  }, [account.id]);

  // 已连接时订阅宿主推送的 workspace-list-updated。
  useEffect(() => {
    if (status !== "paired") return;
    return onZcodeWorkspaceListUpdated((list) => setWorkspaces(list));
  }, [status]);

  useEffect(() => subscribeSessionsIndex(setSessions), []);

  const open = async (workspace: ZcodeWorkspace) => {
    if (busy) return;
    setBusy(true);
    setMessage("打开工作区…");
    try {
      await openZcodeWorkspace(workspace);
      setShowWorkspaces(false);
      setMessage("");
    } catch (caught) {
      setMessage(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  const connected = status === "paired";
  const hasWorkspace = connected && workspaceLabel.length > 0;
  const query = search.trim().toLowerCase();
  const visibleSessions = sessions.filter((item) =>
    `${item.title} ${item.lastAssistantPreview ?? ""}`.toLowerCase().includes(query),
  );
  const subtitle =
    status === "pairing"
      ? auth
        ? "等待电脑连接"
        : "等待桌面端批准"
      : status === "connecting"
        ? "连接中"
        : connected
          ? workspaceLabel || "已连接"
          : "未连接";

  return (
    <View className="screen session-tab">
      {loginOpen && auth ? (
        <ZcodeLogin
          key={account.id}
          auth={auth}
          onCancel={() => setLoginOpen(false)}
          onReady={() => {
            setLoginOpen(false);
            void connect();
          }}
        />
      ) : null}
      <View className="topbar session-topbar">
        <View className="topbar-main">
          <Text className="screen-title">{account.label}</Text>
          <Text className="topbar-subtitle">ZCode · {subtitle}</Text>
        </View>
        {connected ? (
          <Icon className="icon-button" name="refresh" size={20} onClick={() => void connect()} />
        ) : null}
        {hasWorkspace ? (
          <Icon
            className="icon-button"
            name="add_comment_outlined"
            size={20}
            onClick={() => onOpenChat(null)}
          />
        ) : null}
        <Icon className="icon-button" name="devices_other" size={20} onClick={onManageDevices} />
      </View>

      {error ? <Text className="message">{error}</Text> : null}

      {!connected ? (
        <Button
          className="action action-primary full-action"
          disabled={busy}
          onClick={() => void connect()}
        >
          {busy ? "连接中…" : "连接 ZCode 设备"}
        </Button>
      ) : null}

      {connected && (!hasWorkspace || showWorkspaces) ? (
        <>
          <Text className="caption section-label">工作区</Text>
          <ScrollView className="session-list" scrollY>
            {workspaces.map((workspace) => (
              <View
                key={workspace.workspaceKey}
                className={
                  workspace.workspaceKey === workspaceLabel || workspace.label === workspaceLabel
                    ? "workspace workspace-active"
                    : "workspace"
                }
                onClick={() => void open(workspace)}
              >
                <Text className="workspace-name">{workspace.label}</Text>
                <Text className="workspace-access">{workspace.path}</Text>
              </View>
            ))}
            {workspaces.length === 0 ? (
              <Text className="empty">{busy ? "加载中…" : "暂无可访问的工作区"}</Text>
            ) : null}
          </ScrollView>
        </>
      ) : null}

      {hasWorkspace && !showWorkspaces ? (
        <>
          <Input
            className="control session-search"
            value={search}
            placeholder="搜索会话"
            onInput={(event) => setSearch(event.detail.value)}
          />
          <ScrollView className="session-list" scrollY>
            <View className="session-rows">
              {visibleSessions.map((item) => (
                <SessionListItem key={item.sessionId} session={item} onOpen={onOpenChat} />
              ))}
            </View>
            {visibleSessions.length === 0 ? (
              <Text className="empty">{sessions.length === 0 ? "暂无会话" : "没有匹配的会话"}</Text>
            ) : null}
          </ScrollView>
          <Button
            className="action action-ghost full-action"
            onClick={() => setShowWorkspaces(true)}
          >
            切换工作区
          </Button>
        </>
      ) : null}

      {message ? <Text className="message">{message}</Text> : null}
    </View>
  );
}
