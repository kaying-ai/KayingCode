import {
  TAPTAP_PREVIEW_BLINK_FEATURES,
  TAPTAP_PREVIEW_WEBVIEW_PARTITION,
} from "@zcode/shared";

interface MutableTapTapGuestPreferences {
  enableBlinkFeatures?: string;
  partition?: string;
}

interface TapTapGuestAttachParams {
  partition?: string;
}

export function resolveTapTapPreviewGuestPartition(
  webPreferences: MutableTapTapGuestPreferences,
  params: TapTapGuestAttachParams,
): boolean {
  return (params.partition ?? webPreferences.partition) === TAPTAP_PREVIEW_WEBVIEW_PARTITION;
}

export function applyTapTapPreviewGuestPreferences(
  webPreferences: MutableTapTapGuestPreferences,
  params: TapTapGuestAttachParams,
): boolean {
  if (!resolveTapTapPreviewGuestPartition(webPreferences, params)) return false;

  // 修复依据：Electron guest 不会仅凭远端 COOP/COEP 暴露 SharedArrayBuffer，
  // TapTap 的 worker/WASM shared-memory runtime 会因此误判为“不支持的浏览器”。
  webPreferences.partition = TAPTAP_PREVIEW_WEBVIEW_PARTITION;
  webPreferences.enableBlinkFeatures = TAPTAP_PREVIEW_BLINK_FEATURES;
  params.partition = TAPTAP_PREVIEW_WEBVIEW_PARTITION;
  return true;
}
