/* eslint-disable max-lines -- 上下文触发器、悬浮层与来源明细共用一个受控 HoverCard，拆开会打散开合状态与停止滚动的边界。 */
import { useCallback, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { TID_CHAT_CONTEXT_USAGE_TRIGGER, type KayingCodeProvider } from "@zcode/shared";
import {
  Context,
  ContextContentBody,
  ContextContent,
  ContextTrigger,
} from "@/components/ai-elements/context.js";
import { Progress } from "@/components/ui/progress.js";
import { cn } from "@/components/lib/utils.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { runContextPanelActionWithClose } from "@/chat-input-toolbar/contextPanelAction.js";
import {
  buildContextUsageBreakdownSegments,
  buildContextUsageProgressSegments,
  CONTEXT_USAGE_PERCENT_MAX,
  formatContextCacheHitRateLabel,
  formatContextUsageShare,
  formatContextUsageSummary,
  getBreakdownToneStyle,
  getContextUsageBreakdownLabelId,
  getRenderableTaskUsage,
  type ComposerContextTaskUsage,
} from "@/chat-input-toolbar/contextUsageMetrics.js";

export { getRenderableTaskUsage };

export function getContextCompressionCommand(_provider: KayingCodeProvider): string {
  return "/compact";
}

export function ChatContextUsage({
  taskUsage,
  selectedProvider: _selectedProvider,
  intl,
  locale,
  onSendCompressionCommand,
  compressionDisabled,
}: {
  /** 保留入参形状以兼容调用方；localrun 不展示套餐额度。 */
  codingPlanUsageRemaining?: unknown;
  startPlanBalance?: unknown;
  taskUsage: ComposerContextTaskUsage | null;
  selectedProvider: KayingCodeProvider;
  intl: ReturnType<typeof useKayingCodeIntl>["intl"];
  locale: string;
  onSendCompressionCommand?: (command: string) => void;
  compressionDisabled?: boolean;
}) {
  const [contextOpen, setContextOpen] = useState(false);
  const handleContextOpenChange = useCallback((open: boolean) => {
    setContextOpen(open);
  }, []);
  const renderableTaskUsage = getRenderableTaskUsage(taskUsage);
  const breakdownSegments = useMemo(
    () => buildContextUsageBreakdownSegments(taskUsage?.breakdown),
    [taskUsage?.breakdown],
  );
  const progressSegments = useMemo(
    () => buildContextUsageProgressSegments(breakdownSegments),
    [breakdownSegments],
  );
  const cacheHitRateLabel = formatContextCacheHitRateLabel(taskUsage?.cache?.hitRate, locale, {
    showBelowThreshold: import.meta.env.DEV,
  });
  const summaryLabel = renderableTaskUsage
    ? formatContextUsageSummary({
        locale,
        percent: renderableTaskUsage.percent / CONTEXT_USAGE_PERCENT_MAX,
        size: renderableTaskUsage.size,
        used: renderableTaskUsage.used,
      })
    : null;
  const handleTriggerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      // Radix HoverCard 会在 touchstart 中阻止后续 click，手机端靠 click 打不开面板；
      // 触摸 pointerdown 阶段先开一次，桌面端保持原有 hover/focus 语义。
      if (event.defaultPrevented || event.pointerType !== "touch") return;
      if (typeof window === "undefined" || !window.matchMedia?.("(hover: none)").matches) return;
      if (!contextOpen) {
        handleContextOpenChange(true);
      }
    },
    [contextOpen, handleContextOpenChange],
  );

  // 草稿会话与异常兜底没有可展示用量：空环或 0% 会被读成“上下文已用满”，不如不渲染。
  if (!renderableTaskUsage || !summaryLabel) {
    return null;
  }

  return (
    <Context
      usedTokens={renderableTaskUsage.used}
      maxTokens={renderableTaskUsage.size}
      open={contextOpen}
      onOpenChange={handleContextOpenChange}
    >
      {/* 环形图标本身承载用量百分比；具体数字走 tooltip 与面板摘要，不在工具栏占文字宽度。 */}
      <ControlHintTooltip title={summaryLabel} standalone>
        <ContextTrigger
          aria-label={summaryLabel}
          className="size-7 shrink-0 p-0 text-foreground-subtle hover:text-foreground"
          data-chat-toolbar-popover-trigger="true"
          data-testid={TID_CHAT_CONTEXT_USAGE_TRIGGER}
          onPointerDown={handleTriggerPointerDown}
        />
      </ControlHintTooltip>
      <ContextContent className="!w-80 !rounded-xl" side="top" sideOffset={2}>
        <ContextContentBody className="space-y-3 p-3">
          <div className="space-y-2">
            <div className="mb-3 flex min-w-0 items-center gap-3">
              <span className="shrink-0 text-ui-base font-medium text-foreground">
                {intl.formatMessage({ id: "chat.contextUsage.title" })}
              </span>
              <span className="ml-auto shrink-0 text-right font-mono text-ui-sm text-foreground-subtle">
                {summaryLabel}
              </span>
            </div>
            <Progress
              className="h-2 bg-surface"
              indicatorClassName="min-w-2"
              segments={progressSegments}
              value={renderableTaskUsage.percent}
            />
          </div>
          {breakdownSegments.length > 0 ? (
            <div
              aria-label={intl.formatMessage({ id: "chat.contextUsage.breakdown" })}
              className="grid gap-1.5"
            >
              {breakdownSegments.map((segment, index) => (
                <div className="flex min-w-0 items-center gap-2 text-ui-sm" key={segment.source}>
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={getBreakdownToneStyle(index)}
                  />
                  <span className="min-w-0 truncate text-foreground-subtle">
                    {intl.formatMessage({ id: getContextUsageBreakdownLabelId(segment.source) })}
                  </span>
                  {/* 明细行只展示占比：分项 token 与顶部总量口径不同，混排会被读成同一单位。 */}
                  <span className="ml-auto min-w-10 shrink-0 text-right font-mono text-ui-sm tabular-nums text-foreground">
                    {formatContextUsageShare(segment.share, locale)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {cacheHitRateLabel ? (
            <div
              className={cn(
                "flex items-center justify-between gap-3 text-ui-sm",
                breakdownSegments.length > 0 && "border-t border-border pt-3",
              )}
            >
              <span className="text-foreground-subtle">
                {intl.formatMessage({ id: "chat.contextUsage.cacheHitRate" })}
              </span>
              <span className="font-mono text-ui-sm text-foreground">{cacheHitRateLabel}</span>
            </div>
          ) : null}
          {onSendCompressionCommand ? (
            <button
              type="button"
              disabled={compressionDisabled}
              className="w-full rounded-md border border-border px-2 py-1.5 text-ui-sm text-foreground hover:bg-surface-hover disabled:opacity-50"
              onClick={() =>
                runContextPanelActionWithClose({
                  action: () =>
                    onSendCompressionCommand(getContextCompressionCommand(_selectedProvider)),
                  close: () => setContextOpen(false),
                })
              }
            >
              {intl.formatMessage({ id: "chat.contextUsage.compress" })}
            </button>
          ) : null}
        </ContextContentBody>
      </ContextContent>
    </Context>
  );
}
