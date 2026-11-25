import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";
import type { SettingsSectionId } from "@/lib/settingsNavigation.js";
import type { SettingsSearchResult } from "@/settings-search/contract.js";

/**
 * 分区级搜索定位目标。
 *
 * 产品当前没有给每一行设置项传稳定 id（设置行组件不在本模块改动范围），
 * 因此搜索结果先定位到分区：滚动到分区标题、聚焦，并让标题区高亮约 2 秒。
 * 行级 `useSettingsSearchTarget` 仍在本模块导出，后续设置行接入 searchId 后
 * 会由行自己消费同一个导航目标，形成更精确的定位。
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
  const matched = target !== null && target.section === section;
  const highlighted = matched && expiredTarget !== target;
  useEffect(() => {
    if (!matched || !target) return;
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
  }, [matched, target]);
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
