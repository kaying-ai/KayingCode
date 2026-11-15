"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/components/lib/utils.js";
import { formatRunningWorkDuration } from "@/lib/workDuration.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";

export interface ChatLoadingProps extends ComponentPropsWithoutRef<"div"> {
  loading: boolean;
  initialElapsedMs?: number;
  size?: "default" | "sm";
}

// 球面密度独立于品牌点阵（KayingCode 的 KY），避免调整字形间距时意外改变球体；动画几何只生成一次。
const ORB_BRAND_POINTS = [
  // K 竖笔
  [2.8, 5.5],
  [2.8, 6.63],
  [2.8, 7.75],
  [2.8, 8.88],
  [2.8, 10],
  [2.8, 11.13],
  [2.8, 12.25],
  [2.8, 13.38],
  [2.8, 14.5],
  // K 上臂
  [4.12, 9.1],
  [5.44, 8.2],
  [6.76, 7.3],
  [8.08, 6.4],
  [9.4, 5.5],
  // K 下臂
  [4.12, 10.9],
  [5.44, 11.8],
  [6.76, 12.7],
  [8.08, 13.6],
  [9.4, 14.5],
  // Y 左上臂
  [10.8, 5.5],
  [11.48, 6.4],
  [12.16, 7.3],
  [12.84, 8.2],
  [13.52, 9.1],
  [14.2, 10],
  // Y 右上臂
  [17.6, 5.5],
  [16.92, 6.4],
  [16.24, 7.3],
  [15.56, 8.2],
  [14.88, 9.1],
  // Y 竖笔
  [14.2, 10.9],
  [14.2, 11.8],
  [14.2, 12.7],
  [14.2, 13.6],
  [14.2, 14.5],
] as const;
const ORB_POINT_COUNT = 105;
const ORB_BRAND_TARGETS = new Map(
  ORB_BRAND_POINTS.map((point, index) => [
    Math.floor((index * ORB_POINT_COUNT) / ORB_BRAND_POINTS.length),
    point,
  ]),
);
const ORB_SPHERE = Array.from({ length: ORB_POINT_COUNT }, (_, index) => {
  const y = 1 - (index / (ORB_POINT_COUNT - 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = Math.PI * (3 - Math.sqrt(5)) * index;
  return [Math.cos(theta) * radius, y, Math.sin(theta) * radius] as const;
});
const easeOrbMorph = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function ChatLoadingOrbs() {
  const groupRef = useRef<SVGGElement>(null);
  useEffect(() => {
    const dots = Array.from(groupRef.current?.querySelectorAll("circle") ?? []);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0;
    let startedAt = performance.now();
    const setDot = (dot: SVGCircleElement, x: number, y: number, r: number, opacity: number) => {
      dot.setAttribute("cx", x.toFixed(2));
      dot.setAttribute("cy", y.toFixed(2));
      dot.setAttribute("r", r.toFixed(2));
      dot.setAttribute("opacity", opacity.toFixed(2));
    };
    const frame = (now: number) => {
      const elapsed = (now - startedAt) % 8240;
      // 只延长纯球体阶段，保留原有变形速度与 字形停留时间。
      const morph =
        elapsed < 5000
          ? 0
          : elapsed < 6296
            ? easeOrbMorph((elapsed - 5000) / 1296)
            : elapsed < 7160
              ? 1
              : elapsed < 7952
                ? 1 - easeOrbMorph((elapsed - 7160) / 792)
                : 0;
      const angle = (now / 2500) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      dots.forEach((dot, index) => {
        const sphere = ORB_SPHERE[index];
        const target = ORB_BRAND_TARGETS.get(index);
        if (!sphere) return;
        const [sx, sy, sz] = sphere;
        const orbX = 10 + 8.5 * (sx * cos + sz * sin);
        const orbY = 10 - 8.5 * sy;
        const depth = (-sx * sin + sz * cos + 1) / 2;
        const orbOpacity = index % 3 === 0 ? 0.35 + 0.6 * depth : 0;
        const stagger =
          morph === 0 || morph === 1
            ? morph
            : Math.max(0, Math.min(1, morph + (index / dots.length - 0.5) * 0.06));
        const [zx, zy] = target ?? [orbX, orbY];
        const dx = zx - orbX;
        const dy = zy - orbY;
        const length = Math.hypot(dx, dy) || 1;
        const arc = Math.sin(Math.PI * stagger) * 0.45 * (index % 2 ? 1 : -1);
        setDot(
          dot,
          orbX + dx * stagger - (dy / length) * arc,
          orbY + dy * stagger + (dx / length) * arc,
          // 球体阶段 0.5，变形后加粗到 0.7；非目标点在 stagger=1 时已淡出。
          0.5 + 0.2 * stagger,
          orbOpacity + ((target ? 1 : 0) - orbOpacity) * stagger,
        );
      });
      frameId = window.requestAnimationFrame(frame);
    };
    const updateMotion = () => {
      window.cancelAnimationFrame(frameId);
      if (reducedMotion.matches) {
        dots.forEach((dot, index) => {
          const target = ORB_BRAND_TARGETS.get(index);
          const [x, y] = target ?? [10, 10];
          setDot(dot, x, y, 0.7, target ? 1 : 0);
        });
      } else {
        startedAt = performance.now();
        frameId = window.requestAnimationFrame(frame);
      }
    };
    updateMotion();
    reducedMotion.addEventListener("change", updateMotion);
    return () => {
      window.cancelAnimationFrame(frameId);
      reducedMotion.removeEventListener("change", updateMotion);
    };
  }, []);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-5 shrink-0 overflow-visible text-brand"
    >
      <g
        ref={groupRef}
        fill="currentColor"
        style={{
          filter: "drop-shadow(0 0 0.2px color-mix(in srgb, currentColor 25%, transparent))",
        }}
      >
        {ORB_SPHERE.map((_, index) => {
          const target = ORB_BRAND_TARGETS.get(index);
          return (
            <circle
              key={index}
              cx={target?.[0] ?? 10}
              cy={target?.[1] ?? 10}
              r={0.5}
              opacity={target ? 1 : 0}
            />
          );
        })}
      </g>
    </svg>
  );
}

export function ChatLoading({
  loading,
  initialElapsedMs = 0,
  className,
  size: _size,
  ...props
}: ChatLoadingProps) {
  const { intl, locale } = useKayingCodeIntl();
  const [elapsedMs, setElapsedMs] = useState(initialElapsedMs);
  const baselineRef = useRef<{ elapsedMs: number; startedAt: number } | null>(null);
  useEffect(() => {
    if (!loading) {
      baselineRef.current = null;
      return;
    }
    const now = performance.now();
    const previous = baselineRef.current;
    baselineRef.current = {
      elapsedMs: Math.max(
        initialElapsedMs,
        previous ? previous.elapsedMs + now - previous.startedAt : 0,
      ),
      startedAt: now,
    };
  }, [loading, initialElapsedMs]);
  useEffect(() => {
    if (!loading) return;
    // 上游耗时频繁变化曾反复取消计时器，导致回调饿死；校准基准与刷新生命周期分离。
    const tick = () => {
      const baseline = baselineRef.current;
      if (baseline) setElapsedMs(baseline.elapsedMs + performance.now() - baseline.startedAt);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);
  if (!loading) return null;
  return (
    <div
      role="status"
      aria-label={intl.formatMessage({ id: "common.loading" })}
      data-kayingcode-chat-loading-animate="true"
      {...props}
      className={cn("inline-flex w-fit items-center gap-2", className)}
    >
      {/* 与摘要保持相同的 16px 图标槽，替换动效时不改变文字对齐。 */}
      <span data-chat-loading-icon className="flex size-4 shrink-0 items-center justify-center">
        <ChatLoadingOrbs />
      </span>
      <span className="animated-gradient-text animated-gradient-text-foreground text-ui-base font-normal motion-reduce:animate-none!">
        {intl.formatMessage({ id: "chat.loading.working" })}
      </span>
      <span
        aria-hidden="true"
        className="font-mono text-ui-caption tabular-nums text-foreground-subtle"
      >
        {formatRunningWorkDuration(
          elapsedMs,
          (descriptor) => intl.formatMessage(descriptor),
          locale,
        )}
      </span>
    </div>
  );
}
