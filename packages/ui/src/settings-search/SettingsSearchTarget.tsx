import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { SettingsSearchId } from "@/settings-search/settingsSearchIndex.js";

export const SettingsSearchTargetContext = createContext<{ id: SettingsSearchId } | null>(null);

/**
 * 已挂载的设置行注册表。分区定位需要区分「行级目标存在但被条件隐藏」与
 * 「行级目标已挂载」：前者回退到分区，后者由行自己滚动、聚焦和高亮。
 * 行可能在平台条件或异步数据就绪后才挂载，因此按 id 计数，Strict Mode
 * 的挂载 / 卸载 / 再挂载保持平衡。注册表只描述当前 UI，不保存任何设置值。
 */
const mountedRowCounts = new Map<SettingsSearchId, number>();

/** 登记一个已挂载的设置行，返回对应的注销函数。 */
function registerMountedSettingsSearchRow(id: SettingsSearchId): () => void {
  mountedRowCounts.set(id, (mountedRowCounts.get(id) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = mountedRowCounts.get(id) ?? 0;
    if (count <= 1) {
      mountedRowCounts.delete(id);
    } else {
      mountedRowCounts.set(id, count - 1);
    }
  };
}

export function isSettingsSearchRowMounted(id: SettingsSearchId): boolean {
  return (mountedRowCounts.get(id) ?? 0) > 0;
}

export function useSettingsSearchTarget(id: SettingsSearchId | undefined) {
  const target = useContext(SettingsSearchTargetContext);
  const ref = useRef<HTMLDivElement>(null);
  const [expiredTarget, setExpiredTarget] = useState<typeof target>(null);
  const matched = id !== undefined && target?.id === id;
  const highlighted = matched && expiredTarget !== target;
  useEffect(() => {
    // 行级目标只在行真实挂载时可用；分区目标据此决定是否兜底。
    if (id === undefined) return;
    return registerMountedSettingsSearchRow(id);
  }, [id]);
  useEffect(() => {
    if (!matched) return;
    // 分区可能异步挂载；由真实设置行消费目标，避免定时滚动抢在控件出现之前。
    ref.current?.scrollIntoView({ block: "center", behavior: "instant" });
    ref.current?.focus({ preventScroll: true });
    // 导航目标会保留，直接用它控制底色会让高亮常驻。仅让本次提示到期，
    // 不清除导航或焦点；按目标对象区分轮次，旧回调也不会清掉再次命中的高亮。
    const timer = window.setTimeout(() => setExpiredTarget(target), 2000);
    return () => window.clearTimeout(timer);
  }, [matched, target]);
  return { ref, highlighted };
}
