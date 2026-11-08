// 聊天详情页（push 页面，从会话 Tab 进入）。
//
// 服务端事实（会话快照/增量、命令账本、workspace 配置目录、模型目录）全部由
// mobile-client-core 与 useChatController 持有；本页只保存滚动与弹层状态。
import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { MOBILE_BACKEND_DISPLAY_NAME } from "@kayingcode/mobile-client-core";
import type {
  ConversationRow,
  QueueItem,
  SessionSummary,
  TurnHeaderRow,
} from "@zcode/shared/kayingcode-protocol-v4";
import type { InteractionAnswer } from "../../ui/interactionCard";
import { ComposerSection } from "../../ui/chat/composerSection";
import { InsightsSheet, insightsBgCount } from "../../ui/chat/insightsSheet";
import { UsageSheet } from "../../ui/chat/sheets";
import {
  BackgroundWorksBar,
  ContextUsageBar,
  GoalBanner,
  ModeBanner,
  PendingInteractions,
  QueueBar,
  ReconnectBanner,
  useQueueActions,
} from "../../ui/chat/chatBanners";
import { RowActionMenu } from "../../ui/chat/rowActionMenu";
import { buildRowActions } from "../../ui/chat/rowActions";
import { SessionDrawer } from "../../ui/chat/sessionDrawer";
import { ToolOutputSheet } from "../../ui/chat/overlay";
import { TurnFilesSheet } from "../../ui/chat/turnFilesSheet";
import { TurnGroup } from "../../ui/chat/rowWidgets";
import { AI_CONTENT_LABEL_TEXT } from "../../ui/chat/aiContentLabel";
import { groupRows, lastUserInputRowId, turnHeaderOfRow } from "../../ui/chat/rowGroup";
import { useChatController } from "../../ui/chat/useChatController";
import { useChatSend } from "../../ui/chat/useChatSend";
import { useStickToBottom } from "../../ui/chat/useStickToBottom";
import { resolveInitialChatSessionId } from "../../ui/chatRoute";
import { goBack } from "../../ui/navigation";
import { useTheme } from "../../ui/theme";
import { Icon } from "../../ui/icons/Icon";
import { markSessionRead, setVisibleSession } from "../../flow/notifications";
import { subscribeSessionsIndex } from "../../flow/sessionsIndex";
import { flow } from "../../flow/store";
import { openZcodeAttachment } from "../../flow/attachmentPreview";

export default function ChatPage() {
  const theme = useTheme();
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(() =>
    resolveInitialChatSessionId(router.params, flow.getCurrentSessionId()),
  );
  const chat = useChatController(sessionId);
  const { state, pending, commands } = chat;
  const sender = useChatSend({ chat, sessionId, setSessionId });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [rowMenu, setRowMenu] = useState<ConversationRow | null>(null);
  const [toolRow, setToolRow] = useState<ConversationRow | null>(null);
  const [filesHeader, setFilesHeader] = useState<TurnHeaderRow | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);

  // 会话列表（抽屉用）：订阅壳层唯一的 sessions-index 上游。不能自己再开一路——
  // core 的 subscribeSessionsIndex 是单订阅者，再订阅会先 unsubscribe 掉
  // 壳层与通知推导共用的那一路（列表与未读角标会一起失效）。
  useEffect(() => subscribeSessionsIndex(setSessions), []);

  useEffect(() => {
    flow.setCurrentSessionId(sessionId);
  }, [sessionId]);

  // 正在查看的会话：通知门控据此跳过「用户正盯着」的那条；进入即清该会话未读。
  useEffect(() => {
    setVisibleSession(sessionId);
    if (sessionId) markSessionRead(sessionId);
    return () => setVisibleSession(null);
  }, [sessionId]);

  const groups = useMemo(() => groupRows(state.rows), [state.rows]);
  const running = state.phase === "running" || state.phase === "prewarming";
  const userInputId = useMemo(() => lastUserInputRowId(state.rows), [state.rows]);
  const contextRatio =
    state.usage?.contextWindow && state.usage.contextWindow.maxTokens > 0
      ? state.usage.contextWindow.usedTokens / state.usage.contextWindow.maxTokens
      : null;
  const mode = state.config?.mode ?? chat.draft.mode;
  // 消息流贴底跟随（对齐 Flutter 的 _stickToBottom）：换会话回到贴底，流式增量与待发
  // 条目变化时只在贴底状态下跟随（用户上滑读历史时不打断）。
  const rowsView = useStickToBottom();
  useEffect(() => {
    rowsView.jumpToBottom();
  }, [sessionId, chat.connection, rowsView.jumpToBottom]);
  useEffect(() => {
    rowsView.follow();
  }, [state.rows, pending, rowsView.follow]);
  // 输入区占位文案按当前 Bot 的后端显示，写死 KayingCode 会让 ZCode 会话误标。
  const account = flow.getActiveAccount();
  const agentName = account ? MOBILE_BACKEND_DISPLAY_NAME[account.backendType] : "Agent";
  const insightsCount = insightsBgCount({
    backgroundWorks: state.backgroundWorks,
    rows: state.rows,
  });
  const canAttach = Boolean(flow.getZcodeSession()?.bridge);

  const speak = (run: () => Promise<unknown>, prefix: string) => {
    void run().catch((caught: unknown) => chat.fail(caught, prefix));
  };

  const editQueue = (item: QueueItem, text: string) => {
    if (commands && sessionId)
      speak(() => commands.editQueueItem(sessionId, item.queueItemId, text), "编辑失败");
  };
  const deleteQueue = (item: QueueItem) => {
    if (commands && sessionId)
      speak(() => commands.deleteQueueItem(sessionId, item.queueItemId), "删除失败");
  };

  const queueActions = useQueueActions({ edit: editQueue, remove: deleteQueue });
  const emptyConversation = state.rows.length === 0 && pending.length === 0;

  return (
    <View className={`${theme.className} chat`}>
      <View className="topbar">
        <Icon className="icon-button" name="arrow_back" size={20} onClick={() => goBack()} />
        <View className="topbar-main">
          <Text className="topbar-title">{sessionId ? state.title || "会话" : "新会话"}</Text>
          <Text className="topbar-subtitle">{flow.getWorkspaceLabel()}</Text>
        </View>
        <Text className={`status ${running ? "status-running" : ""}`}>
          {running ? (
            <>
              <Icon name="motion_photos_on" /> 工作中
            </>
          ) : (
            <>
              <Icon name="radio_button_unchecked" /> 空闲
            </>
          )}
        </Text>
        <Icon className="icon-button" name="menu" size={20} onClick={() => setDrawerOpen(true)} />
      </View>

      <View className="rows-wrap">
        {/* 合规标识：悬浮固定在消息流顶部，不随消息滚动、不拦截手势（aiContentLabel.ts）。 */}
        <View className="ai-label">
          <Text className="ai-label-text">{AI_CONTENT_LABEL_TEXT}</Text>
        </View>
        {emptyConversation ? (
          <View className="chat-empty-state">
            <Text className="chat-empty-state-text">
              {sessionId ? "暂无消息" : "输入消息开始新会话"}
            </Text>
          </View>
        ) : null}
        <ScrollView
          className="rows"
          scrollY
          scrollIntoView={rowsView.anchorId}
          onScroll={rowsView.onScroll}
        >
          <ModeBanner mode={mode} />
          <ContextUsageBar usage={state.usage} />
          {state.olderHasMore ? (
            <Text className="older" onClick={() => void chat.loadOlder()}>
              {chat.loadingOlder ? "加载中…" : "加载更早消息"}
            </Text>
          ) : null}
          {groups.map((group) => (
            <TurnGroup
              key={group[0]!.rowId}
              rows={group}
              running={running}
              userInputId={userInputId}
              callbacks={{
                onRowLongPress: setRowMenu,
                onViewTool: setToolRow,
                onOpenTurnFiles: setFilesHeader,
                onOpenAttachment: (ref, fileName, mime) => {
                  if (sessionId)
                    speak(
                      () => openZcodeAttachment(sessionId, ref, fileName, mime),
                      "附件预览失败",
                    );
                },
              }}
            />
          ))}
          {pending.map((entry) => (
            <View key={entry.commandId} className="pending-row">
              <Text className="pending-text">
                {entry.acknowledged
                  ? `${entry.text}（已受理，等待回显…）`
                  : `${entry.text}（发送中…）`}
              </Text>
            </View>
          ))}
          {/* 贴底跟随的两个尾部锚点（交替赋值，见 useStickToBottom）。 */}
          <View id="chat-anchor-a" />
          <View id="chat-anchor-b" />
        </ScrollView>
        {!rowsView.following && state.rows.length > 0 ? (
          <Text className="jump-bottom" onClick={rowsView.jumpToBottom}>
            <Icon name="keyboard_arrow_down" size={22} />
          </Text>
        ) : null}
      </View>

      {state.control?.lastError ? (
        <Text className="message">{state.control.lastError.message}</Text>
      ) : null}
      {chat.message ? <Text className="message">{chat.message}</Text> : null}

      <GoalBanner goal={state.goal} />
      <BackgroundWorksBar works={state.backgroundWorks} />
      <QueueBar
        queue={state.queue}
        busy={chat.sending}
        onSendNow={(item) =>
          speak(() => commands!.sendQueuedNow(sessionId!, item.queueItemId), "发送失败")
        }
        onEdit={queueActions.askEdit}
        onDelete={(item) => void queueActions.askDelete(item)}
        onToggleAutoDrain={(value) =>
          speak(() => commands!.setAutoDrain(sessionId!, value), "切换失败")
        }
      />
      <PendingInteractions
        interactions={state.pendingInteractions}
        busy={chat.answering}
        onAnswer={(interaction, answer: InteractionAnswer) => void chat.answer(interaction, answer)}
      />

      <ComposerSection
        chat={chat}
        sender={sender}
        sessionId={sessionId}
        running={running}
        agentName={agentName}
        mode={mode}
        contextRatio={contextRatio}
        insightsCount={insightsCount}
        canAttach={canAttach}
        onOpenInsights={sessionId ? () => setInsightsOpen(true) : undefined}
        onOpenUsage={sessionId ? () => setUsageOpen(true) : undefined}
        speak={speak}
      />

      <SessionDrawer
        open={drawerOpen}
        workspaceLabel={flow.getWorkspaceLabel()}
        sessions={sessions}
        currentSessionId={sessionId}
        onClose={() => setDrawerOpen(false)}
        onPick={(next) => {
          setSessionId(next);
          sender.setDraftText("");
        }}
        onSwitchWorkspace={() => {
          flow.resetConnection();
          goBack();
        }}
        onOpenSettings={() => {
          setDrawerOpen(false);
          void Taro.navigateTo({ url: "/pages/settings/index?section=connections" });
        }}
        onRename={(target, title) =>
          speak(() => commands!.renameSession(target, title), "重命名失败")
        }
        onDelete={(target) => {
          if (target === sessionId) setSessionId(null);
          speak(() => commands!.deleteSession(target), "删除失败");
        }}
      />

      {insightsOpen ? (
        <InsightsSheet
          rows={state.rows}
          plan={state.plan}
          goal={state.goal}
          subagents={state.subagents}
          backgroundWorks={state.backgroundWorks}
          hostPlans={chat.hostPlans}
          busy={chat.sending}
          onClose={() => setInsightsOpen(false)}
          onToggleGoal={(action) =>
            speak(
              () =>
                action === "pause"
                  ? commands!.pauseGoal(sessionId!)
                  : commands!.resumeGoal(sessionId!),
              "目标操作失败",
            )
          }
          onOpenTurnFiles={(header) => {
            setInsightsOpen(false);
            setFilesHeader(header);
          }}
        />
      ) : null}

      {usageOpen ? (
        <UsageSheet
          usage={state.usage}
          busy={chat.sending}
          onClose={() => setUsageOpen(false)}
          onQueryTaskUsage={() => void chat.queryTaskUsage()}
        />
      ) : null}

      {rowMenu ? (
        <RowActionMenu
          row={rowMenu}
          busy={chat.sending}
          onClose={() => setRowMenu(null)}
          handlers={buildRowActions(rowMenu, {
            commands,
            sessionId: sessionId ?? "",
            run: speak,
            reject: chat.notify,
            close: () => setRowMenu(null),
            viewFiles: () => {
              const header = turnHeaderOfRow(state.rows, rowMenu);
              if (header) setFilesHeader(header);
              else chat.notify("该回合没有可查询的文件变更");
            },
          })}
        />
      ) : null}

      {toolRow ? <ToolOutputSheet row={toolRow} onClose={() => setToolRow(null)} /> : null}

      {filesHeader ? (
        <TurnFilesSheet
          header={filesHeader}
          load={(target) => chat.fileChanges(target)}
          onClose={() => setFilesHeader(null)}
        />
      ) : null}

      {queueActions.editor}
      {chat.catalogError ? <Text className="caption chat-hint">{chat.catalogError}</Text> : null}
      <ReconnectBanner visible={chat.connection === null && chat.reconnecting} />
    </View>
  );
}
