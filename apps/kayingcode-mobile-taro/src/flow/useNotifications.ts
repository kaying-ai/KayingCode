// 通知域到 React 的绑定：未读总数（底栏「会话」角标）。
import { useSyncExternalStore } from "react";
import { subscribeUnread, unreadTotal } from "./notifications";

export function useUnreadTotal(): number {
  return useSyncExternalStore(subscribeUnread, unreadTotal, unreadTotal);
}
