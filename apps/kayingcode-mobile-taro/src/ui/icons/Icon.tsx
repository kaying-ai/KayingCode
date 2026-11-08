// 图标与加载指示。
//
// 字形来自 Flutter 自带的 Material Icons 子集（生成物：material-icons-subset.ttf +
// icons.ts + material-icons.css，见 scripts/generate-mobile-taro-icons.py），
// 排版规则在同目录的 icon.css。图标名就是 Flutter 的 `Icons.<name>`，逐字形一致。
import { Text, View } from "@tarojs/components";
import type { ITouchEvent } from "@tarojs/components";
import { iconGlyph, type IconName } from "./icons";

/**
 * 一个字形图标。
 *
 * `size` 传 CSS px：本工程按 375 设计宽编写，CSS 里的 px 会被编译成 rpx，
 * 而内联 px 与它同尺度（见 README「尺寸单位」）。不传则继承容器字号——
 * 多数位置（.tool-status / .todo-mark / .tile-icon 等）已有自己的字号类。
 */
export function Icon({
  name,
  size,
  className,
  onClick,
}: {
  name: IconName;
  size?: number;
  className?: string;
  onClick?: (event: ITouchEvent) => void;
}) {
  return (
    <Text
      className={className ? `mi ${className}` : "mi"}
      style={size === undefined ? undefined : { fontSize: `${size}px` }}
      onClick={onClick}
    >
      {iconGlyph(name)}
    </Text>
  );
}

/**
 * Flutter 的 `CircularProgressIndicator` 等价物：小程序没有现成的转圈组件，
 * 用边框 + 旋转动画画一个。尺寸跟随字号（1em），所以调用方只要给出字号，
 * 就能和旁边的图标对齐；Flutter 端这些位置用的也是这个转圈而不是字形。
 */
export function Spinner({
  size = 12,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <View
      className={className ? `icon-spinner ${className}` : "icon-spinner"}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderWidth: `${Math.max(1, Math.round(size * 0.15))}px`,
      }}
    />
  );
}
