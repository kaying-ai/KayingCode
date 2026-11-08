export const GAME_FEATURE_PAGES = [
  {
    id: "tapmaker-projects",
    labelKey: "gameFeatures.myGames",
    titleKey: "gameFeatures.myGamesTitle",
    descriptionKey: "gameFeatures.projectsDescription",
    url: null,
  },
  {
    id: "game-ranking",
    labelKey: "gameFeatures.gameRanking",
    titleKey: "gameFeatures.gameRankingTitle",
    descriptionKey: "gameFeatures.gameRankingDescription",
    url: "https://www.taptap.cn/top/download",
  },
  {
    id: "free-token",
    labelKey: "gameFeatures.freeToken",
    titleKey: "gameFeatures.freeTokenTitle",
    descriptionKey: "gameFeatures.freeTokenDescription",
    url: "https://www.kayingai.com/freellm",
  },
] as const;
export type GameFeaturePage = (typeof GAME_FEATURE_PAGES)[number]["id"];
export const DEFAULT_GAME_FEATURE_PAGE: GameFeaturePage = "tapmaker-projects";
export function isGameFeaturePage(page: string): page is GameFeaturePage {
  return GAME_FEATURE_PAGES.some((item) => item.id === page);
}
