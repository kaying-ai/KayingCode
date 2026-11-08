/**
 * KayingCode.localrun 的官方能力开关。
 *
 * 产品边界：无官方账号、无 OAuth 登录、无订阅/Coding Plan、无官方营销/奖励与官方 marketplace。
 * UI/CLI 在批量采纳上游模块时统一读取本开关，而不是逐文件删除入口；任何开关默认关闭，
 * 需要重新启用时必须单独立项并更新 PRODUCT_BOUNDARY.md。
 */
export const LOCALRUN_FEATURES = {
  officialAccount: false,
  oauthLogin: false,
  codingPlan: false,
  subscription: false,
  rewards: false,
  officialMarketplace: false,
  officialTelemetry: false,
} as const;

export type LocalrunFeature = keyof typeof LOCALRUN_FEATURES;

export function isLocalrunFeatureEnabled(feature: LocalrunFeature): boolean {
  return LOCALRUN_FEATURES[feature];
}

/** 官方能力被关闭时统一的可用性错误，供服务 stub 复用。 */
export function localrunFeatureUnavailableError(feature: LocalrunFeature): Error {
  return Object.assign(new Error(`KayingCode.localrun does not enable ${feature}`), {
    kind: "feature_disabled" as const,
  });
}
