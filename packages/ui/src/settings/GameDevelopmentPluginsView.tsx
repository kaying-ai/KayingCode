import { useMemo } from "react";
import { Gamepad2, X } from "lucide-react";
import { GAME_DEVELOPMENT_ENGINES, GAME_DEVELOPMENT_STAGES } from "@zcode/shared";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import type { PluginStoreActions } from "@/settings/PluginStoreCard.js";
import { GameDevelopmentPluginCard } from "@/settings/GameDevelopmentPluginCard.js";
import type { StorePluginItem } from "@/settings/pluginStoreListing.js";
import {
  DEFAULT_GAME_DEVELOPMENT_FILTERS,
  filterGameDevelopmentPlugins,
  type GameDevelopmentFilters,
} from "@/settings/gameDevelopmentPlugins.js";

const SOURCE_GROUPS = ["open-source", "closed-source", "unspecified"] as const;

export function GameDevelopmentPluginsView({
  items,
  actions,
  filters,
  onFiltersChange,
  query,
  onQueryChange,
  loading,
}: {
  items: StorePluginItem[];
  actions: PluginStoreActions;
  filters: GameDevelopmentFilters;
  onFiltersChange: (filters: GameDevelopmentFilters) => void;
  query: string;
  onQueryChange: (query: string) => void;
  loading: boolean;
}) {
  const { intl, locale } = useKayingCodeIntl();
  const message = (key: string) => intl.formatMessage({ id: `settings.plugins.game.${key}` });
  const results = useMemo(
    () => filterGameDevelopmentPlugins(items, filters, query, locale),
    [items, filters, query, locale],
  );
  const engineCounts = useMemo(() => {
    const stageItems = filterGameDevelopmentPlugins(
      items,
      { stage: filters.stage, engine: "all" },
      query,
      locale,
    );
    return new Map(
      ["all", ...GAME_DEVELOPMENT_ENGINES].map((engine) => [
        engine,
        stageItems.filter(
          (item) =>
            engine === "all" ||
            !item.listing?.gameDevelopment?.engines.length ||
            item.listing.gameDevelopment.engines.some((value) => value === engine),
        ).length,
      ]),
    );
  }, [items, filters.stage, query, locale]);
  const hasFilters = filters.engine !== "all" || filters.stage !== "all" || Boolean(query.trim());
  const reset = () => {
    onFiltersChange(DEFAULT_GAME_DEVELOPMENT_FILTERS);
    onQueryChange("");
  };

  return (
    <section
      data-testid="game-development-plugins"
      className="space-y-5"
      aria-label={message("title")}
    >
      <div
        data-testid="game-development-toolbar"
        className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      >
        <div className="min-w-0 shrink-0">
          <h2 className="flex items-center gap-2 text-ui-lg font-semibold text-foreground">
            <Gamepad2 className="size-5 shrink-0" aria-hidden="true" />
            {message("title")}
            <span className="rounded-md bg-surface px-1.5 py-0.5 text-ui-xs font-normal text-foreground-subtle">
              {message("builtin")}
            </span>
          </h2>
          <p className="sr-only">{message("description")}</p>
        </div>
        <div
          role="group"
          aria-label={message("lifecycle")}
          data-testid="game-lifecycle-filter"
          className="flex min-w-0 flex-wrap items-center gap-1 sm:justify-end"
        >
          {(["all", ...GAME_DEVELOPMENT_STAGES] as const).map((stage) => (
            <button
              key={stage}
              type="button"
              data-testid={`game-stage-${stage}`}
              aria-pressed={filters.stage === stage}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-ui-base whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused",
                filters.stage === stage
                  ? "bg-selected font-medium text-foreground"
                  : "text-foreground-subtle hover:bg-hover hover:text-foreground",
              )}
              onClick={() => onFiltersChange({ ...filters, stage })}
            >
              {stage === "all" ? message("allStages") : message(`stage.${stage}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 gap-5 border-t border-border pt-5 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-6">
        <aside className="min-w-0">
          <div
            role="group"
            aria-label={message("engines")}
            className="flex flex-wrap gap-1 sm:flex-col"
          >
            {(["all", ...GAME_DEVELOPMENT_ENGINES] as const).map((engine) => (
              <button
                key={engine}
                type="button"
                data-testid={`game-engine-${engine}`}
                aria-pressed={filters.engine === engine}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-ui-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused",
                  filters.engine === engine
                    ? "bg-selected font-medium text-foreground"
                    : "text-foreground-subtle hover:bg-hover hover:text-foreground",
                )}
                onClick={() => onFiltersChange({ ...filters, engine })}
              >
                <span>
                  {engine === "all" ? message("allEngines") : message(`engine.${engine}`)}
                </span>
                <span className="text-ui-xs tabular-nums text-foreground-subtlest">
                  {engineCounts.get(engine) ?? 0}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-ui-xs leading-relaxed text-foreground-subtlest">
            {message("engineHint")}
          </p>
        </aside>

        <div className="@container/game min-w-0 space-y-3">
          <div className="flex min-h-7 items-center justify-between gap-2">
            <p
              aria-live="polite"
              data-testid="game-plugin-count"
              className="text-ui-sm text-foreground-subtle"
            >
              {loading
                ? intl.formatMessage({ id: "settings.plugins.marketplace.catalogLoading" })
                : intl.formatMessage(
                    { id: "settings.plugins.game.count" },
                    { count: String(results.length) },
                  )}
            </p>
            {hasFilters ? (
              <Button variant="ghost" size="sm" data-testid="game-clear-filters" onClick={reset}>
                <X className="size-3.5" aria-hidden="true" />
                {message("clear")}
              </Button>
            ) : null}
          </div>
          {results.length === 0 ? (
            <div
              data-testid="game-plugins-empty"
              className="rounded-xl border border-dashed border-border px-5 py-10 text-center"
            >
              <Gamepad2
                className="mx-auto mb-3 size-6 text-foreground-subtlest"
                aria-hidden="true"
              />
              <p className="text-ui-base font-medium text-foreground">
                {message(loading ? "loading" : hasFilters ? "emptyFiltered" : "empty")}
              </p>
              {!loading ? (
                <p className="mt-1.5 text-ui-sm text-foreground-subtle">
                  {message(hasFilters ? "emptyFilteredHint" : "emptyHint")}
                </p>
              ) : null}
            </div>
          ) : (
            SOURCE_GROUPS.map((source) => {
              const group = results.filter(
                (item) => (item.listing?.gameDevelopment?.source?.kind ?? "unspecified") === source,
              );
              if (group.length === 0) return null;
              return (
                <section key={source} data-testid={`game-source-${source}`} className="space-y-2.5">
                  {source !== "unspecified" ? (
                    <h3 className="flex items-center gap-2 text-ui-base font-medium text-foreground">
                      {message(`source.${source}`)}
                      <span className="text-ui-xs font-normal text-foreground-subtlest">
                        {group.length}
                      </span>
                    </h3>
                  ) : null}
                  <div className="grid min-w-0 gap-3 @xl/game:grid-cols-2">
                    {group.map((item) => (
                      <GameDevelopmentPluginCard
                        key={item.id}
                        item={item}
                        actions={actions}
                        locale={locale}
                      />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
