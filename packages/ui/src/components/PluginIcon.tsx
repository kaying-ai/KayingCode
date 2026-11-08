import { useState, type ReactNode } from "react";
import { Blocks } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { resolvePluginIconSource } from "@/lib/pluginIconSource.js";
import {
  PLUGIN_MONOGRAM_VIEWBOX_SIZE,
  getPluginMonogramFontSize,
  resolvePluginMonogram,
} from "@/lib/pluginMonogram.js";

/**
 * Plugin 原始图标；支持官方内置图标与 HTTPS。
 * 缺失或失败时：调用方 fallbackIcon → 稳定 monogram 头像 → Blocks。
 */
export function PluginIcon({
  src,
  pluginId,
  label,
  className,
  iconClassName,
  fallbackIcon,
}: {
  src?: string;
  pluginId?: string;
  /** monogram 字形来源（展示名）；缺失时回退 plugin id。 */
  label?: string;
  className?: string;
  iconClassName?: string;
  fallbackIcon?: ReactNode;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const resolvedSrc = resolvePluginIconSource(pluginId, src);
  const showImage = Boolean(resolvedSrc) && !imageFailed;
  const monogram = !showImage && !fallbackIcon ? resolvePluginMonogram({ pluginId, label }) : undefined;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-xl",
        showImage ? "bg-surface" : monogram ? null : "bg-surface text-foreground-subtle",
        className,
        // monogram 品牌色须压过调用方通用 bg-*，否则 bg-background 会抹掉区分度
        monogram?.colorClass,
      )}
    >
      {showImage ? (
        <img
          src={resolvedSrc}
          alt=""
          draggable={false}
          className="h-2/3 w-2/3 object-contain"
          onError={() => setImageFailed(true)}
        />
      ) : fallbackIcon ? (
        fallbackIcon
      ) : monogram ? (
        <svg
          viewBox={`0 0 ${PLUGIN_MONOGRAM_VIEWBOX_SIZE} ${PLUGIN_MONOGRAM_VIEWBOX_SIZE}`}
          className="h-full w-full"
          focusable="false"
        >
          <text
            x={PLUGIN_MONOGRAM_VIEWBOX_SIZE / 2}
            y={PLUGIN_MONOGRAM_VIEWBOX_SIZE / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="currentColor"
            fontFamily="inherit"
            fontWeight={600}
            fontSize={getPluginMonogramFontSize(monogram.glyph)}
          >
            {monogram.glyph}
          </text>
        </svg>
      ) : (
        <Blocks className={cn("size-4", iconClassName)} />
      )}
    </span>
  );
}
