import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import { KayingCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { PluginStoreListView } from "@/settings/PluginStoreListView.js";
import { PluginStoreManageButton } from "@/settings/PluginStoreManageButton.js";
import { createSettingsPageConfig } from "@/settings/settingsPageConfig.js";
import "./styles.css";

function Fixture() {
  const [enabled, setEnabled] = useState(false);
  const [opened, setOpened] = useState(0);
  const [managed, setManaged] = useState(0);
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState("public");
  const [gameFilters, setGameFilters] = useState({ engine: "all", stage: "all" });
  const item = useMemo(
    () => ({
      id: "computer-use@kayingcode-plugins-official",
      name: "computer-use",
      marketplace: "kayingcode-plugins-official",
      installed: true,
      restorable: false,
      orphaned: false,
      listing: {
        displayName: "电脑控制",
        description: "自动化桌面应用",
      },
      info: {
        id: "computer-use@kayingcode-plugins-official",
        name: "computer-use",
        marketplace: "kayingcode-plugins-official",
        enabled,
        components: [],
      },
    }),
    [enabled],
  );
  const actions = useMemo(
    () => ({
      onOpenDetail: () => setOpened((value) => value + 1),
      onInstall: () => {},
      onUninstall: () => {},
      onUpdate: () => {},
      onSetEnabled: (_pluginId, nextEnabled) => setEnabled(nextEnabled),
      operationId: null,
      togglingPluginId: null,
    }),
    [],
  );

  return (
    <KayingCodeIntlProvider initialLocale="zh-CN">
      <TooltipProvider>
        <output data-testid="legacy-computer-use-section">
          {String(
            createSettingsPageConfig({ isDesktop: true }).settingsSections.some(
              (section) => section.id === "computerUse",
            ),
          )}
        </output>
        <div className="mb-4 flex justify-end">
          <PluginStoreManageButton onClick={() => setManaged((value) => value + 1)} />
        </div>
        <PluginStoreListView
          items={[item]}
          marketplaces={[]}
          actions={actions}
          loading={false}
          query={query}
          onQueryChange={setQuery}
          segment={segment}
          onSegmentChange={setSegment}
          gameFilters={gameFilters}
          onGameFiltersChange={setGameFilters}
        />
        <output data-testid="opened-count">{opened}</output>
        <output data-testid="managed-count">{managed}</output>
      </TooltipProvider>
    </KayingCodeIntlProvider>
  );
}

createRoot(document.getElementById("root")).render(<Fixture />);
