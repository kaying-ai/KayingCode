import React from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import { PlatformProvider } from "@/hooks/usePlatform.js";
import { KayingCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { PluginStoreDetailView } from "@/settings/PluginStoreDetailView.js";
import { StoreProvider } from "@/store/StoreProvider.js";
import data from "virtual:plugin-detail-data";
import "./styles.css";

const params = new URLSearchParams(location.search);
const plugin =
  data.find((item) => item.name === params.get("plugin")) ??
  data.find((item) => item.name === "blender");
const installed = params.get("mode") !== "describe";
document.documentElement.className = params.get("theme") ?? "theme-zai-dark";
localStorage.setItem(
  "kayingcode-theme",
  params.get("theme") === "theme-zai-light" ? "zai-light" : "zai-dark",
);
const item = {
  id: `${plugin.name}@kayingcode-plugins-official`,
  name: plugin.name,
  marketplace: "kayingcode-plugins-official",
  installed,
  restorable: !installed,
  orphaned: false,
  listing: params.has("legacy") ? { displayName: plugin.name } : plugin.listing,
  ...(installed
    ? {
        info: {
          name: plugin.name,
          enabled: !params.has("disabled"),
          components: plugin.components,
        },
      }
    : {}),
};
const actions = {
  onOpenDetail() {},
  onInstall() {},
  onUninstall() {},
  onUpdate() {},
  onSetEnabled() {},
  operationId: null,
  togglingPluginId: null,
};
const broadcastService = {
  send() {},
  onMessage() {
    return () => {};
  },
};
createRoot(document.getElementById("root")).render(
  <KayingCodeIntlProvider initialLocale={params.get("locale") ?? "zh-CN"}>
    <PlatformProvider platform={{ openExternal: async () => {} }}>
      <StoreProvider broadcastService={broadcastService}>
        <TooltipProvider>
          <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
            <PluginStoreDetailView
              item={item}
              actions={actions}
              describeEntry={{
                status: "loaded",
                data: { components: plugin.components, metadata: {} },
              }}
              onRetryDescribe={() => {}}
              onUsePrompt={() => {}}
            />
          </main>
        </TooltipProvider>
      </StoreProvider>
    </PlatformProvider>
  </KayingCodeIntlProvider>,
);
