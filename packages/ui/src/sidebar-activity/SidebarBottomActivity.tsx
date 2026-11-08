import { LOCALRUN_FEATURES } from "@zcode/shared";

/**
 * 侧栏左下角活动共享槽位。
 *
 * 上游该槽位仲裁「领 token 营销 banner」与「highspeed 分享通知」，两者都属于官方运营能力。
 * KayingCode.localrun 关闭官方奖励 / 遥测后不加载营销触达与全局通知模块：这里保留同名组件，
 * 默认渲染一个空槽位，避免侧栏布局出现第二套实现。重新启用必须单独立项并更新
 * PRODUCT_BOUNDARY.md。
 */
export function SidebarBottomActivity(_props: { noticeStore?: unknown } = {}) {
  if (!LOCALRUN_FEATURES.rewards) return null;
  return null;
}
