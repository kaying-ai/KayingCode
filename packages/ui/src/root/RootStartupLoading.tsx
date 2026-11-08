import type { ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";
import kayingCodeMarkUrl from "@/assets/KayingCode-mark.png";

interface RootStartupLoadingProps {
  label: string;
  children?: ReactNode;
  busy?: boolean;
}

export function RootStartupLoading({ label, children, busy = true }: RootStartupLoadingProps) {
  return (
    <div
      // Web 端全局 html/body/#root 为 Electron 透明背景让路，React 接管后会替换 HTML 启动壳。
      // 这里必须由阻塞态自身承接主题背景，否则远控链接会在 Root 恢复期间继续露出浏览器白底。
      className="flex h-full min-h-dvh flex-col items-center justify-center gap-6 bg-background text-foreground"
      role="status"
      aria-busy={busy}
      aria-label={label}
      data-testid="root-startup-loading"
    >
      <KayingCodeStartupLogoBadge />
      {children}
    </div>
  );
}

/** 初始化与引导共用品牌图标，保持底色、描边、圆角和标志比例一致。 */
export function KayingCodeStartupLogoBadge({ animated = true }: { animated?: boolean }) {
  return (
    <div
      data-animated={animated}
      className="startup-logo-shell relative flex size-24 items-center justify-center rounded-3xl bg-[linear-gradient(180deg,#000000_0%,#151718_100%)] text-[#ffffff] shadow-xl/20 before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-[rgba(255,255,255,0.1)] before:content-['']"
    >
      <KayingCodeStartupLogo className="h-auto w-[73px]" animated={animated} />
    </div>
  );
}

function KayingCodeStartupLogo({
  className,
  animated = true,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <img
      src={kayingCodeMarkUrl}
      alt=""
      aria-hidden="true"
      className={cn(
        "shrink-0 object-contain",
        animated ? "startup-logo-breathe" : undefined,
        className,
      )}
    />
  );
}
