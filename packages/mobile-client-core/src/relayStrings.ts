// Relay 移动端文案与展示小工具。
// 本页面不依赖 settingService（relay 面未注册该 channel），因此不接入
// KayingCodeIntlProvider，按 navigator.language 二选一（与 main.tsx 错误屏先例一致）；
// 完整移动端 i18n 体系属 MOB-C-009 后续。navigator 守卫仅为 Node 测试环境兜底，
// 浏览器行为不变。

export const zh = typeof navigator !== "undefined" && /^zh\b/i.test(navigator.language);

export const t = {
  close: zh ? "关闭" : "Close",
  hostFilePreview: zh
    ? "此文件需要在电脑端打开；手机仅预览已授权的会话附件和工具文本。"
    : "Open this file on your host. Mobile previews are limited to authorized conversation attachments and tool text.",
  heldQueue: zh ? "排队消息的处理" : "Queued messages",
  keepQueue: zh ? "保留排队消息并发送" : "Keep queue and send",
  clearQueue: zh ? "清空排队消息并发送" : "Clear queue and send",
  cancelUpload: zh ? "取消发送" : "Cancel send",
  model: zh ? "模型" : "Model",
  modelDefault: zh ? "默认模型" : "Default model",
  reasoning: zh ? "思考档位" : "Reasoning",
  mode: zh ? "协作模式" : "Mode",
  slashCommands: zh ? "斜杠命令" : "Slash commands",
  attachFile: zh ? "添加附件" : "Attach file",
  removeAttachment: zh ? "移除附件" : "Remove attachment",
  attachmentUnavailable: zh
    ? "当前连接不支持附件"
    : "Attachments are unavailable on this connection",
  attachmentTooLarge: zh ? "附件超过大小限制" : "Attachment exceeds the size limit",
  toggleTheme: zh ? "切换明暗主题" : "Toggle theme",
  searchConversation: zh ? "搜索会话内容" : "Search conversation",
  sending: zh ? "发送中…" : "Sending…",
  title: zh ? "KayingCode 移动端" : "KayingCode Mobile",
  connect: zh ? "连接" : "Connect",
  connecting: zh ? "连接中…" : "Connecting…",
  selectTitle: zh ? "选择要访问的项目" : "Choose a project",
  nodeName: zh ? "Agent 节点" : "Agent node",
  offline: zh ? "离线" : "offline",
  online: zh ? "在线" : "online",
  readonly: zh ? "只读" : "read-only",
  readWrite: zh ? "可写" : "read-write",
  tasks: zh ? "任务" : "Tasks",
  newTask: zh ? "新任务" : "New task",
  refresh: zh ? "刷新" : "Refresh",
  emptyTasks: zh ? "暂无任务" : "No tasks yet",
  back: zh ? "返回" : "Back",
  send: zh ? "发送" : "Send",
  messagePlaceholder: zh ? "输入消息…" : "Type a message…",
  stop: zh ? "停止" : "Stop",
  thinking: zh ? "思考中" : "Thinking",
  disconnect: zh ? "断开" : "Disconnect",
  /** workspaceHookReview 等本端不能作答的交互。 */
  waitingInteraction: zh
    ? "存在需要处理的交互（请在电脑端完成）"
    : "An interaction is pending (finish it on your host)",
  invalidCode: zh ? "V2 连接链接格式不正确" : "Invalid V2 connection URL",
  disconnected: zh ? "连接已断开" : "Disconnected",
  offlineHint: zh ? "节点离线，无法连接" : "Node offline",
  stateLost: zh ? "页面状态丢失，请刷新重试" : "Page state lost, refresh and retry",
  // ── 重连（MOB-C-004）──
  reconnecting: zh ? "连接断开，正在重连" : "Connection lost, reconnecting",
  reconnectGiveUp: zh
    ? "自动重连失败，请在项目页重试连接"
    : "Auto-reconnect failed, retry from the project page",
  grantRevoked: zh ? "该项目的访问已被吊销" : "Access to this project was revoked",
  statusConnected: zh ? "已连接" : "Connected",
  statusReconnecting: zh ? "重连中" : "Reconnecting",
  statusOffline: zh ? "未连接" : "Offline",
  retryAttach: zh ? "重试连接" : "Retry connection",
  // ── 交互作答（MOB-C-006）──
  interactionPermission: zh ? "等待你的授权" : "Awaiting your approval",
  interactionUserInput: zh ? "等待你的回复" : "Awaiting your reply",
  interactionSubmit: zh ? "提交" : "Submit",
  interactionCancel: zh ? "取消" : "Cancel",
  interactionCustomPlaceholder: zh ? "自定义回答…" : "Custom answer…",
  interactionMultiHint: zh ? "可多选" : "Multi-select",
  interactionFailed: zh ? "作答失败，请重试" : "Failed to submit answer, retry",
  // ── 历史回补（MOB-C-005）──
  loadOlder: zh ? "加载更早消息" : "Load earlier messages",
  loadingOlder: zh ? "加载中…" : "Loading…",
  // ── pending overlay 与对账（MOB-C-006 / MOB-05）──
  pendingSending: zh ? "发送中…" : "Sending…",
  pendingEcho: zh ? "已受理，等待回显…" : "Accepted, waiting for echo…",
  sendRejected: zh ? "发送未受理" : "Message was not accepted",
  // ── 诊断（MOB-C-009）──
  diagnostics: zh ? "诊断" : "Diagnostics",
  diagRelay: zh ? "Relay" : "Relay",
  diagNode: zh ? "节点" : "Node",
  diagGeneration: zh ? "实例代" : "Generation",
  diagConnection: zh ? "连接" : "Connection",
  diagConnected: zh ? "已附着" : "Attached",
  diagReconnecting: zh ? "重连中 #" : "Reconnecting #",
  diagClosed: zh ? "已断开" : "Closed",
  diagLastClose: zh ? "最近关闭" : "Last close",
} as const;

/** 常见 relay fault code 的本地化描述；未知码回退原码（不猜文本）。 */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatTime(ms: number): string {
  const date = new Date(ms);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}
