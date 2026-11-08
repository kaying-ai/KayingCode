import { useEffect, useState } from "react";
import { RollingToolbarLabel } from "@/chat-input-toolbar/RollingToolbarLabel.js";
import { cn } from "@/components/lib/utils.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";

// 未登录 footer 的品牌轮播文案：向两种语言追加 sidebar.branding.* key 并加入
// 下方数组即可扩展；宽度随当前文案自适应，超宽由外层既有 truncate 收敛。
const SIDEBAR_BRANDING_MESSAGE_KEYS = [
  "sidebar.branding.harness",
  "sidebar.branding.kayingcode",
  "sidebar.branding.kayingai",
] as const;

const SIDEBAR_BRANDING_INTERVAL_MS = 4000;

export function SidebarBrandingCarousel({ className }: { className?: string }) {
  const { intl } = useKayingCodeIntl();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (SIDEBAR_BRANDING_MESSAGE_KEYS.length <= 1) {
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % SIDEBAR_BRANDING_MESSAGE_KEYS.length);
    }, SIDEBAR_BRANDING_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const messageKey = SIDEBAR_BRANDING_MESSAGE_KEYS[index] ?? SIDEBAR_BRANDING_MESSAGE_KEYS[0];
  const message = intl.formatMessage({ id: messageKey });

  // 修复依据：只给新文案做入场动画会先瞬间卸载旧文案，视觉上像跳切。
  // 共享滚动标签会让旧值向上退出、新值从下方同步进入，并统一处理 reduced-motion。
  return <RollingToolbarLabel label={message} className={cn("max-w-full", className)} />;
}
