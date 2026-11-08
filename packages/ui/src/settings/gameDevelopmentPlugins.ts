import {
  KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID,
  type GameDevelopmentEngine,
  type GameDevelopmentStage,
} from "@zcode/shared";
import {
  resolveItemDisplayName,
  storeItemMatches,
  type StorePluginItem,
} from "@/settings/pluginStoreListing.js";

export interface GameDevelopmentFilters {
  engine: GameDevelopmentEngine | "all";
  stage: GameDevelopmentStage | "all";
}

export const DEFAULT_GAME_DEVELOPMENT_FILTERS: GameDevelopmentFilters = {
  engine: "all",
  stage: "all",
};

export function filterGameDevelopmentPlugins(
  items: readonly StorePluginItem[],
  filters: GameDevelopmentFilters,
  query: string,
  locale: string,
): StorePluginItem[] {
  const keyword = query.trim().toLocaleLowerCase();
  return items
    .filter((item) => {
      const game = item.listing?.gameDevelopment;
      if (item.marketplace !== KAYINGCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID || !game) return false;
      return (
        (filters.engine === "all" ||
          game.engines.length === 0 ||
          game.engines.includes(filters.engine)) &&
        (filters.stage === "all" || game.stages.includes(filters.stage)) &&
        (!keyword || storeItemMatches(item, keyword, locale))
      );
    })
    .toSorted((a, b) =>
      resolveItemDisplayName(a, locale).localeCompare(resolveItemDisplayName(b, locale), locale),
    );
}
