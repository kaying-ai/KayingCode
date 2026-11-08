import { ArrowLeft, ExternalLink, Gamepad2, Trophy, Zap } from "lucide-react";
import { lazy, Suspense, useState, type KeyboardEvent } from "react";
import { createUuid } from "@zcode/shared";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { GAME_FEATURE_PAGES, type GameFeaturePage } from "@/lib/gameFeaturePages.js";
import { AutomationsMainBreadcrumbFrame } from "@/settings/AutomationsMainBreadcrumbFrame.js";
import { SettingsBreadcrumbReporter } from "@/settings/SettingsHeaderBreadcrumb.js";

const Browser = lazy(() =>
  import("@/browser-use/UnifiedBrowserView.js").then((module) => ({
    default: module.UnifiedBrowserView,
  })),
);
const Projects = lazy(() =>
  import("./TapMakerProjectsPage.js").then((module) => ({ default: module.TapMakerProjectsPage })),
);

const TAB_ICONS = { "tapmaker-projects": Gamepad2, "game-ranking": Trophy, "free-token": Zap };

export function GameFeatureMainView({
  page,
  isDesktop,
  supportsEmbeddedBrowser,
  onNavigate,
  onOpenProject,
  onBack,
}: {
  page: GameFeaturePage;
  isDesktop: boolean;
  supportsEmbeddedBrowser: boolean;
  onNavigate: (page: GameFeaturePage) => void;
  onOpenProject: (path: string) => void;
  onBack: () => void;
}) {
  const { intl } = useKayingCodeIntl();
  const current = GAME_FEATURE_PAGES.find((item) => item.id === page)!;
  const title = intl.formatMessage({ id: current.titleKey });
  const t = (key: string) => intl.formatMessage({ id: `gameFeatures.${key}` });
  return (
    // 原因：游戏中心与其他 workspace 主区共用同一导航所有者，避免侧栏与 Tab 形成两份页状态。
    <main
      className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground"
      data-testid="game-feature-main"
    >
      <AutomationsMainBreadcrumbFrame
        isDesktop={isDesktop}
        sectionLabel={t("navigation")}
        ariaLabel={t("navigation")}
      >
        <SettingsBreadcrumbReporter items={[{ label: title }]} />
        <div className="shrink-0 border-b border-border" data-testid="game-center-navigation">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap sm:px-4">
            {/* 修复依据：返回、总标题、说明和 Tab 纵向堆叠会重复桌面面包屑并挤压内容区。
                这里把导航职责收进一条紧凑横栏；返回动作使用稳定填充面，保持最清晰的逃生层级。 */}
            <Button
              variant="secondary"
              size="lg"
              onClick={onBack}
              data-icon="inline-start"
              className="border border-border font-medium shadow-xs hover:border-border-hover"
            >
              <ArrowLeft className="transition-transform group-hover/button:-translate-x-0.5 motion-reduce:transition-none" />
              {t("back")}
            </Button>
            <div aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-border sm:block" />
            <h1 className="min-w-0 shrink-0 truncate text-ui-base font-semibold">{t("center")}</h1>
            <GameCenterTabs page={page} onNavigate={onNavigate} />
          </div>
        </div>
        <div
          id="game-center-panel"
          role="tabpanel"
          aria-labelledby={`game-center-tab-${page}`}
          className="min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          <Suspense
            fallback={
              <p role="status" className="p-6 text-ui-sm text-foreground-subtle">
                {t("loading")}
              </p>
            }
          >
            {page === "tapmaker-projects" ? (
              <div className="mx-auto h-full w-full max-w-6xl">
                <Projects isDesktop={isDesktop} onOpenProject={onOpenProject} />
              </div>
            ) : current.url ? (
              <GameExternalFeatureContent
                key={page}
                title={title}
                description={intl.formatMessage({ id: current.descriptionKey })}
                url={current.url}
                supportsEmbeddedBrowser={supportsEmbeddedBrowser}
              />
            ) : null}
          </Suspense>
        </div>
      </AutomationsMainBreadcrumbFrame>
    </main>
  );
}

function GameCenterTabs({
  page,
  onNavigate,
}: {
  page: GameFeaturePage;
  onNavigate: (page: GameFeaturePage) => void;
}) {
  const { intl } = useKayingCodeIntl();
  const focusTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + GAME_FEATURE_PAGES.length) % GAME_FEATURE_PAGES.length;
    } else if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % GAME_FEATURE_PAGES.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = GAME_FEATURE_PAGES.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextPage = GAME_FEATURE_PAGES[nextIndex] ?? GAME_FEATURE_PAGES[0];
    onNavigate(nextPage.id);
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]");
    tabs?.[nextIndex]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={intl.formatMessage({ id: "gameFeatures.tabsLabel" })}
      className="order-3 flex w-full min-w-0 gap-1 overflow-x-auto sm:order-none sm:ml-auto sm:w-auto"
    >
      {GAME_FEATURE_PAGES.map((item, index) => {
        const Icon = TAB_ICONS[item.id];
        const selected = page === item.id;
        return (
          <Button
            key={item.id}
            id={`game-center-tab-${item.id}`}
            type="button"
            role="tab"
            variant="ghost"
            size="default"
            aria-controls="game-center-panel"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            data-testid={`game-center-tab-${item.id}`}
            onClick={() => onNavigate(item.id)}
            onKeyDown={(event) => focusTab(event, index)}
            className={cn(
              "relative rounded-b-none border-b-2 border-transparent px-3 text-foreground-subtle hover:bg-surface-hover hover:text-foreground",
              selected && "border-foreground bg-selected text-foreground",
            )}
          >
            <Icon className="size-4" />
            {intl.formatMessage({ id: item.labelKey })}
          </Button>
        );
      })}
    </div>
  );
}

function GameExternalFeatureContent({
  title,
  description,
  url,
  supportsEmbeddedBrowser,
}: {
  title: string;
  description: string;
  url: string;
  supportsEmbeddedBrowser: boolean;
}) {
  const platform = usePlatform();
  const { intl } = useKayingCodeIntl();
  // 修复依据：Main 会保留已关闭 guest 的身份；每次挂载使用新 key，避免重开命中旧 guest。
  const [browserKey] = useState(() => `game-feature:${createUuid()}`);
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden p-3 sm:p-4">
      <div className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-ui-base font-medium">{title}</h2>
          <p className="mt-1 text-ui-sm text-foreground-subtle">{description}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => platform.openExternal(url)}>
          <ExternalLink />
          {intl.formatMessage({ id: "gameFeatures.openBrowser" })}
        </Button>
      </div>
      {/* 修复依据：宿主只约束 WebView 的剩余 viewport，不额外承接网页滚动；
          内容溢出继续由 Chromium guest 按页面实际高度显示内部滚动条。 */}
      {supportsEmbeddedBrowser ? (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-card-border bg-card">
          <Browser browserKey={browserKey} initialUrl={url} isVisible showToolbar />
        </div>
      ) : (
        <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-card-border bg-card p-6 text-center">
          <ExternalLink className="size-8 text-foreground-subtle" />
          <p className="text-ui-base font-medium">{title}</p>
          <p className="max-w-md text-ui-sm text-foreground-subtle">
            {intl.formatMessage({ id: "gameFeatures.externalDescription" })}
          </p>
        </div>
      )}
    </div>
  );
}
