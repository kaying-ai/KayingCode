import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";
import type { SettingsSectionId } from "@/lib/settingsNavigation.js";
import type { SettingsSearchResult } from "@/settings-search/contract.js";
import {
  shouldUseSettingsSearchSectionFallback,
  type SettingsSearchRowTargetState,
} from "@/settings-search/settingsNavigationSearch.js";
import { isSettingsSearchRowMounted } from "@/settings-search/SettingsSearchTarget.js";

/**
 * 分区级搜索定位目标，同时承担行级目标的兜底。
 *
 * 行级结果由真实设置行通过 useSettingsSearchTarget 滚动、聚焦和高亮；
 * 分区只在没有行级 id，或行级 id 在约一次宏任务后仍未挂载时兜底。
 * 未挂载包括平台条件隐藏、运行时数据未就绪以及索引已移除的旧 id。
 */
export function SettingsSearchSectionTarget({
  section,
  target,
  className,
  children,
}: {
  section: SettingsSectionId;
  target: SettingsSearchResult | null;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [expiredTarget, setExpiredTarget] = useState<SettingsSearchResult | null>(null);
  // 已确认的挂载结果按目标对象归属；换目标后自动回到 pending，避免旧结论闪一下兜底。
  const [rowTargetResolution, setRowTargetResolution] = useState<{
    target: SettingsSearchResult;
    mounted: boolean;
  } | null>(null);
  const matched = target !== null && target.section === section;
  const rowTargetId = target?.setting;
  useEffect(() => {
    if (!matched || !target || rowTargetId === undefined) return;
    // 分区标题与设置行在同一批更新里挂载，但分区目标的 effect 先于行完成；
    // 等一次宏任务再读注册表：行已挂载时分区让位给行，行被隐藏时由分区兜底。
    const timer = window.setTimeout(() => {
      setRowTargetResolution({
        target,
        mounted: isSettingsSearchRowMounted(rowTargetId),
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [matched, rowTargetId, target]);
  const rowTargetState: SettingsSearchRowTargetState =
    rowTargetId === undefined
      ? "none"
      : rowTargetResolution?.target === target
        ? rowTargetResolution.mounted
          ? "mounted"
          : "missing"
        : "pending";
  const useSectionFallback = matched && shouldUseSettingsSearchSectionFallback(rowTargetState);
  const highlighted = useSectionFallback && expiredTarget !== target;
  useEffect(() => {
    if (!useSectionFallback || !target) return;
    // 搜索命中后面板内容会在同一批更新里换成分区；等一帧再滚动，
    // 避免在旧布局上计算位置。行为与上游一致，滚动是瞬时的，不用动画抢焦点。
    const frame = window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ block: "start", behavior: "instant" });
      ref.current?.focus({ preventScroll: true });
    });
    // 导航目标需要保留给后续行级消费；只让本次高亮到期，不清除导航或焦点。
    // 按目标对象区分轮次，旧回调不会清掉后续命中的高亮。
    const timer = window.setTimeout(() => setExpiredTarget(target), 2000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [useSectionFallback, target]);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-settings-search-section={section}
      data-settings-search-highlighted={highlighted || undefined}
      className={cn(
        "rounded-xl outline-none",
        highlighted && "bg-accent ring-1 ring-inset ring-input-border-focused",
        className,
      )}
    >
      {children}
    </div>
  );
}
