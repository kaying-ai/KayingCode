// 左滑显示操作按钮的行容器（对齐 Flutter Dismissible 的删除手势）。
// 用触摸位移驱动 transform，不依赖 movable-view，H5 与 weapp 同一套实现。
import { useRef, useState } from "react";
import { View, Text } from "@tarojs/components";
import type { CommonEventFunction } from "@tarojs/components";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/icons";

const ACTION_WIDTH = 88;

/**
 * Taro 把 View 的 onTouchStart/Move 声明为 CommonEventFunction（参数是
 * BaseEventOrig，类型上没有 touches 字段）；触摸点只在运行时存在。这里按
 * unknown 收参再窄化，既保持 handler 能赋给 View props，也不依赖 Taro 内部
 * 事件类型名。
 */
function touchX(event: unknown): number | null {
  const touches = (event as { touches?: readonly { clientX?: number }[] } | null)?.touches;
  const value = touches?.[0]?.clientX;
  return typeof value === "number" ? value : null;
}

export function SwipeRow({
  actionIcon,
  actionLabel,
  onAction,
  onTap,
  children,
}: {
  /** 操作图标取 Flutter bot_list_page.dart 左滑删除用的 Icons.delete_outline。 */
  actionIcon: IconName;
  actionLabel: string;
  onAction: () => void;
  onTap?: () => void;
  children: React.ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const startX = useRef<number | null>(null);
  const baseOffset = useRef(0);

  const handleStart: CommonEventFunction = (event) => {
    const x = touchX(event);
    if (x === null) return;
    startX.current = x;
    baseOffset.current = open ? -ACTION_WIDTH : 0;
  };

  const handleMove: CommonEventFunction = (event) => {
    const x = touchX(event);
    if (x === null || startX.current === null) return;
    const next = baseOffset.current + (x - startX.current);
    setOffset(Math.min(0, Math.max(-ACTION_WIDTH, next)));
  };

  const handleEnd = () => {
    if (startX.current === null) return;
    startX.current = null;
    const shouldOpen = offset <= -ACTION_WIDTH / 2;
    setOpen(shouldOpen);
    setOffset(shouldOpen ? -ACTION_WIDTH : 0);
  };

  return (
    <View className="swipe-row">
      <View
        className="swipe-action"
        onClick={() => {
          setOpen(false);
          setOffset(0);
          onAction();
        }}
      >
        <Icon name={actionIcon} size={20} />
        <Text className="swipe-action-label">{actionLabel}</Text>
      </View>
      <View
        className="swipe-content"
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
        onClick={() => {
          if (open) {
            setOpen(false);
            setOffset(0);
            return;
          }
          onTap?.();
        }}
      >
        {children}
      </View>
    </View>
  );
}
