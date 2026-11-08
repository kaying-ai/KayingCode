import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import { PlatformProvider } from "@/hooks/usePlatform.js";
import { KayingCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { PluginStoreListView } from "@/settings/PluginStoreListView.js";
import catalog from "../../../../../config/official-plugins.json";
import "./styles.css";

const params = new URLSearchParams(location.search);
const locale = params.get("locale") ?? "zh-CN";
document.documentElement.className = params.get("theme") ?? "theme-zai-dark";
const examples = params.has("examples")
  ? [
      {
        name: "open-unity-fixture",
        listing: {
          displayName: "Unity 示例工具",
          gameDevelopment: {
            engines: ["unity"],
            stages: ["development", "testing"],
            source: {
              kind: "open-source",
              repositoryUrl: "https://github.com/example/game-plugin",
            },
          },
        },
      },
      {
        name: "closed-godot-fixture",
        listing: {
          displayName: "Godot 示例工具",
          gameDevelopment: {
            engines: ["godot"],
            stages: ["publishing"],
            source: { kind: "closed-source" },
          },
        },
      },
      {
        name: "local-game-fixture",
        marketplace: "local",
        listing: {
          displayName: "本地游戏工具",
          gameDevelopment: { engines: [], stages: ["assets"] },
        },
      },
    ]
  : [];

function Fixture() {
  const [segment, setSegment] = useState(
    params.get("segment") === "game-development" ? "game-development" : "public",
  );
  const [filters, setFilters] = useState({ engine: "all", stage: "all" });
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState(null);
  const [enabled, setEnabled] = useState({});
  const [restored, setRestored] = useState(false);
  const [external, setExternal] = useState("");
  const [loading, setLoading] = useState(false);
  const items = useMemo(
    () =>
      [...catalog.plugins.filter((plugin) => plugin.listing), ...examples].map((plugin) => {
        const marketplace = plugin.marketplace ?? catalog.marketplace;
        const id = `${plugin.name}@${marketplace}`;
        const restorable = plugin.name === "kaying-game-playtest" && !restored;
        return {
          id,
          name: plugin.name,
          marketplace,
          installed: !restorable,
          restorable,
          orphaned: false,
          listing: {
            ...plugin.listing,
            author: plugin.listing.author?.name,
            displayNameI18n: plugin.listing.displayName_i18n,
            descriptionI18n: plugin.listing.description_i18n,
          },
          ...(!restorable
            ? {
                info: {
                  id,
                  name: plugin.name,
                  marketplace,
                  enabled: enabled[id] ?? true,
                  components: [],
                },
              }
            : {}),
        };
      }),
    [enabled, restored],
  );
  const actions = {
    onOpenDetail: setDetail,
    onInstall: () => setRestored(true),
    onUninstall: () => {},
    onUpdate: () => {},
    onSetEnabled: (id, value) => setEnabled((current) => ({ ...current, [id]: value })),
    operationId: null,
    togglingPluginId: null,
  };
  return (
    <KayingCodeIntlProvider initialLocale={locale}>
      <PlatformProvider platform={{ openExternal: async (url) => setExternal(url) }}>
        <TooltipProvider>
          <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
            <h1 className="mb-3 text-ui-xl font-semibold">
              {locale === "zh-CN" ? "插件市场" : "Plugin marketplace"}
            </h1>
            <p className="mb-7 text-ui-sm text-foreground-subtle">
              {locale === "zh-CN"
                ? "用插件为 KayingCode 扩展技能、命令与 MCP 能力"
                : "Extend KayingCode with skills, commands, and MCP tools"}
            </p>
            <div hidden={Boolean(detail)}>
              <PluginStoreListView
                items={loading ? [] : items}
                marketplaces={[]}
                actions={actions}
                loading={loading}
                query={query}
                onQueryChange={setQuery}
                segment={segment}
                onSegmentChange={setSegment}
                gameFilters={filters}
                onGameFiltersChange={setFilters}
              />
            </div>
            {detail ? (
              <div>
                <button data-testid="back-to-market" onClick={() => setDetail(null)}>
                  返回插件市场
                </button>
                <output data-testid="detail-id">{detail}</output>
              </div>
            ) : null}
            <footer className="mt-12 border-t border-border pt-3 text-ui-xs text-foreground-subtle">
              <span>交互验证环境 · 使用真实列表组件与发行清单</span>
              <button
                data-testid="loading-toggle"
                className="ml-3"
                onClick={() => setLoading((value) => !value)}
              >
                切换加载态
              </button>
              <output data-testid="external-url">{external}</output>
            </footer>
          </main>
        </TooltipProvider>
      </PlatformProvider>
    </KayingCodeIntlProvider>
  );
}

createRoot(document.getElementById("root")).render(<Fixture />);
