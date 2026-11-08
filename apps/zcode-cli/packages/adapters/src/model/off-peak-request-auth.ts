import type {
  ModelInvocationContext,
  ModelRequestAuth,
  ModelRequestAuthSourceInput,
} from "@zcode/contracts";

/**
 * KayingCode.localrun：官方 Off-Peak / Coding Plan 账号票据不在本地启用
 * （见 PRODUCT_BOUNDARY.md「运行模式」），因此没有可刷新的请求级 PAT。
 *
 * 调用方只在 zhipu-account + off-peak 模式进入这里；本地直接拒绝，避免把官方账号
 * 刷新链路重新接回默认链路。保留与上游一致的入参形状，调用点无需分支。
 */
export async function refreshOffPeakRequestAuth(params: {
  accountAccess: unknown;
  auth: ModelRequestAuth;
  input: ModelRequestAuthSourceInput;
  refresh?: ModelInvocationContext["refreshRuntimeHeadersBeforeAttempt"];
}): Promise<ModelRequestAuth> {
  void params;
  throw new Error("KayingCode.localrun does not enable off-peak request auth");
}
