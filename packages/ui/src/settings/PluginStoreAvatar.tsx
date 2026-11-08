import type { ReactNode } from "react";
import { PluginIcon } from "@/components/PluginIcon.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import type { StorePluginItem } from "@/settings/pluginStoreListing.js";
import { resolvePluginDisplayName } from "@/settings/pluginStoreListing.js";

/**
 * 商店条目头像：listing.icon（仅 https）优先，加载失败或缺失时降级为
 * 稳定 monogram 头像（展示名字形 + id 哈希色），避免无图插件共用同一枚 Blocks。
 * 设计稿的图标资源只是图形本身，外层语义化容器负责主题背景；对整张图片
 * dark:invert 会把 Android 绿色等品牌色反相，因此这里保留资源原始颜色。
 */
export function PluginStoreAvatar({
  item,
  className,
  iconClassName,
  fallbackIcon,
}: {
  item: Pick<StorePluginItem, "name" | "listing"> & Partial<Pick<StorePluginItem, "id">>;
  className?: string;
  iconClassName?: string;
  fallbackIcon?: ReactNode;
}) {
  const { locale } = useKayingCodeIntl();
  return (
    <PluginIcon
      src={item.listing?.icon}
      pluginId={item.id}
      label={resolvePluginDisplayName({ name: item.name, listing: item.listing }, locale)}
      className={className}
      iconClassName={iconClassName}
      fallbackIcon={fallbackIcon}
    />
  );
}
