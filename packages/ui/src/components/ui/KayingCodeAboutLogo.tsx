import markUrl from "@/assets/KayingCode-mark.png";
import { cn } from "@/components/lib/utils.js";

// 品牌 KY 标（对齐 assets/brand/kayingcode.png）改用官方 PNG 资源。
// 旧实现是六个手绘多边形 path（近似描摹），渲染出来笔画错位成"乱码"字形
// （启动壳/欢迎屏/About 都受影响）；PNG 为白字透明底，使用处均为固定深色壳，
// 与 WindowsTopLeftLogo 使用同一资源族。
export function KayingCodeAboutLogo({ className }: { className?: string }) {
  return (
    <img
      src={markUrl}
      alt="KayingCode"
      draggable={false}
      className={cn("shrink-0 select-none", className)}
    />
  );
}

export function KayingCodeWordmarkLogo({ className }: { className?: string }) {
  return (
    <svg
      width="240"
      height="48"
      viewBox="0 0 240 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 text-current", className)}
      aria-hidden="true"
      focusable="false"
    >
      {/* 原 mark 区域 translate(0 4) scale(0.156) 覆盖 0..40 × 4..44，等位替换为 PNG。 */}
      <image href={markUrl} x="0" y="4" width="40" height="40" />
      <text
        x="52"
        y="32"
        fill="currentColor"
        fontFamily="ui-sans-serif, -apple-system, 'Segoe UI', sans-serif"
        fontSize="22"
        fontWeight="600"
        letterSpacing="-0.02em"
      >
        KayingCode
      </text>
    </svg>
  );
}
