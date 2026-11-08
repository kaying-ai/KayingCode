import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserViewportToolbar } from "../../../src/browser-use/BrowserViewportToolbar.tsx";
import { ResponsiveBrowserViewport } from "../../../src/browser-use/ResponsiveBrowserViewport.tsx";
import { useResponsiveBrowserViewportControl } from "../../../src/browser-use/useResponsiveBrowserViewportControl.ts";
import { TooltipProvider } from "../../../src/components/ui/tooltip.tsx";
import "../../../src/styles.css";

window.viewportTest = {
  calls: [],
  locale: "zh",
  platform: {
    browserViewUpdateViewport(payload) {
      window.viewportTest.calls.push(payload);
      return Promise.resolve();
    },
  },
};
const attachment = {},
  noop = () => {};
const preference = { mode: "responsive", viewport: { width: 1280, height: 720 }, zoom: "fit" };
function Fixture() {
  const [, redraw] = useState(0);
  const view = useResponsiveBrowserViewportControl({
    browserKey: "preview",
    guestAttachment: attachment,
    desktopZoomFactor: 1,
    onAgentViewportChange: noop,
    onViewportSynchronized: noop,
    onViewportResize: noop,
    initialHumanViewportPreference: preference,
  });
  window.viewportTest.setSize = view.updateResponsiveViewportSize;
  window.viewportTest.setLocale = (locale) => {
    window.viewportTest.locale = locale;
    redraw((n) => n + 1);
  };
  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-2 text-ui-sm">
          <span>浏览器视口交互验证</span>
          <button data-testid="enter-fixed" onClick={view.toggleResponsiveMode}>
            自由尺寸
          </button>
        </div>
        {view.isResponsiveMode ? (
          <BrowserViewportToolbar
            isVisible
            onFillPanel={view.toggleResponsiveMode}
            onViewportSizeChange={view.updateResponsiveViewportSize}
            onZoomChange={view.setResponsiveViewportZoom}
            viewportSize={view.responsiveViewportSize}
            zoom={view.responsiveViewportZoom}
          />
        ) : null}
        <div className="flex min-h-0 flex-1" data-testid="available-panel">
          <ResponsiveBrowserViewport
            active={view.isResponsiveMode}
            desktopZoomFactor={1}
            isComposed
            onResize={noop}
            onViewportSizeChange={view.updateResponsiveViewportSize}
            viewportSize={view.responsiveViewportSize}
            zoom={view.responsiveViewportZoom}
          >
            <iframe
              title="Stateful test page"
              className="h-full w-full border-0"
              srcDoc={
                '<!doctype html><html><body style="margin:0;font:14px system-ui;background:#bdd5df"><div style="padding:16px"><h3>同一网页 · 保留文档状态</h3><input aria-label="文档标记" value="scene-kept"/><p>横竖屏切换只改变视口，填满面板使用真实容器尺寸。</p></div></body></html>'
              }
            />
          </ResponsiveBrowserViewport>
        </div>
      </div>
    </TooltipProvider>
  );
}
document.documentElement.className = "theme-zai-dark";
document.documentElement.style.setProperty("--ui-font-size", "14px");
document.body.style.margin = "0";
createRoot(document.getElementById("root")).render(<Fixture />);
