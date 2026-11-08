// 聊天页入口只在这里编码和解码，避免“新建会话”退化为上次会话的隐式状态。
const CHAT_PAGE_PATH = "/pages/chat/index";

export type ChatPageParams = Readonly<Record<string, string | undefined>>;

/** null 表示空白会话草稿；首次发送前不创建服务端会话。 */
export function chatPageUrl(sessionId: string | null): string {
  if (!sessionId) return `${CHAT_PAGE_PATH}?new=1`;
  return `${CHAT_PAGE_PATH}?sessionId=${encodeURIComponent(sessionId)}`;
}

/**
 * 显式新会话优先于历史 currentSessionId；无参数旧链接仍回退当前会话，
 * 保持进程恢复和旧路由兼容。
 */
export function resolveInitialChatSessionId(
  params: ChatPageParams,
  fallbackSessionId: string | null,
): string | null {
  if (params["new"] === "1") return null;
  const encodedSessionId = params.sessionId;
  if (!encodedSessionId) return fallbackSessionId;
  try {
    return decodeURIComponent(encodedSessionId);
  } catch {
    return encodedSessionId;
  }
}
