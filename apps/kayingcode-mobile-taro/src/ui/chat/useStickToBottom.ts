// 消息流贴底跟随：对齐 Flutter chat_page.dart 的 `_stickToBottom`（偏移 0 = 最新一条，
// 距底 40px 内算贴底，用户上滑即解除跟随，未贴底时给「回到底部」浮钮）。
//
// Flutter 用 `reverse: true` 列表：内容增长天然发生在视口外，什么都不用做。Taro 的
// scroll-view 没有 reverse 能力，而**受控的 scrollTop 会在每次重渲染时把视图拽回底部**
// （用户上滑读历史会被打断，实测），所以改用两个交替的尾部锚点 + `scroll-into-view`：
// 只有我们想让视图跟随时该值才变化，重渲染时同值重设是空操作。
import { useCallback, useEffect, useRef, useState } from "react";
import Taro from "@tarojs/taro";

/** 距底部多少像素内仍算贴底（与 Flutter 的 40px 判定同量级）。 */
const NEAR_BOTTOM_PX = 40;
/** 尾部锚点轮换用的两个 id：交替赋值才能让 scroll-into-view 每次都构成“变化”。 */
export const BOTTOM_ANCHORS = ["chat-anchor-a", "chat-anchor-b"] as const;

export function useStickToBottom(): {
  /** 传给 ScrollView 的 `scrollIntoView`；指向两个尾部锚点之一。 */
  anchorId: string;
  /** 是否贴在底部（未贴底且有内容时页面显示「回到底部」浮钮）。 */
  following: boolean;
  onScroll: (event: { detail?: { scrollTop?: number; scrollHeight?: number } }) => void;
  /** 内容变化时调用：只有贴底才跟随，避免把正在读历史的用户拽走。 */
  follow: () => void;
  jumpToBottom: () => void;
} {
  const [seq, setSeq] = useState(0);
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);
  const viewportHeight = useRef(0);

  // 视口高度只量一次：scroll-view 的 scroll 事件只给 scrollTop/scrollHeight，没有 clientHeight。
  useEffect(() => {
    Taro.createSelectorQuery()
      .select(".rows")
      .boundingClientRect()
      .exec((result: unknown) => {
        const rect = Array.isArray(result)
          ? (result[0] as { height?: number } | undefined)
          : undefined;
        viewportHeight.current = rect?.height ?? 0;
      });
  }, []);

  const follow = useCallback(() => {
    if (!followingRef.current) return;
    setSeq((value) => value + 1);
  }, []);

  const jumpToBottom = useCallback(() => {
    followingRef.current = true;
    setFollowing(true);
    setSeq((value) => value + 1);
  }, []);

  const onScroll = useCallback(
    (event: { detail?: { scrollTop?: number; scrollHeight?: number } }) => {
      const viewport = viewportHeight.current;
      if (viewport <= 0) return;
      const top = event.detail?.scrollTop ?? 0;
      const height = event.detail?.scrollHeight ?? 0;
      const near = height - top - viewport <= NEAR_BOTTOM_PX;
      if (near === followingRef.current) return;
      followingRef.current = near;
      setFollowing(near);
    },
    [],
  );

  return {
    anchorId: BOTTOM_ANCHORS[seq % BOTTOM_ANCHORS.length]!,
    following,
    onScroll,
    follow,
    jumpToBottom,
  };
}
