// 壳层状态订阅：flow 是模块级单例，页面用本 hook 拿到响应式快照。
import { useSyncExternalStore } from "react";
import { flow, type FlowState } from "./store";

export function useFlow(): FlowState {
  return useSyncExternalStore(flow.subscribe, flow.getSnapshot);
}
