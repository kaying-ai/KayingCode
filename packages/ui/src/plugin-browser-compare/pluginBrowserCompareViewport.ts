import type { BrowserViewportSize, EmbeddedBrowserViewportPreference } from "@zcode/shared";

export function resolvePluginBrowserCompareViewportPreference({
  captureMode,
  publicationViewport,
  screenshotViewport,
}: {
  captureMode: boolean;
  publicationViewport: BrowserViewportSize;
  screenshotViewport: BrowserViewportSize | null;
}): EmbeddedBrowserViewportPreference {
  // 修复依据：常驻面板此前始终把 1280×720 fit 到窄而高的半屏，产生大面积留白；
  // 人类视图应与单游戏预览一致自然填充，只有机器截图合成才需要固定证据 viewport。
  return {
    mode: captureMode ? "responsive" : "normal",
    viewport: screenshotViewport ?? publicationViewport,
    zoom: "fit",
  };
}
