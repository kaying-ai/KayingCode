/**
 * Window Host → Main 的 extension-host 控制消息与 HostResponse 共用 parentPort。
 * BroadcastHub/task-realtime 只消费 HostResponse，必须先排除 extension-host/*，
 * 否则每次窗口 Host 就绪都会把 `extension-host/window-ready` 当成未知 HostResponse 告警。
 */
export function isExtensionHostControlMessage(message: unknown): boolean {
  if (typeof message !== "object" || message === null) return false;
  const type = (message as { type?: unknown }).type;
  return typeof type === "string" && type.startsWith("extension-host/");
}
