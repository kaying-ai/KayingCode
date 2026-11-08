import { cn } from "@/components/lib/utils.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { PluginStoreAvatar } from "@/settings/PluginStoreAvatar.js";
import { GameDevelopmentPluginBanner } from "@/settings/GameDevelopmentPluginBanner.js";
import {
  PluginStoreEnabledControl,
  PluginStoreInstallButton,
  PluginStoreItemMenu,
  PluginStorePaidPlanBadge,
  PluginStoreUpdateBadge,
  PluginStoreUpdateButton,
  type PluginStoreActions,
} from "@/settings/PluginStoreCard.js";
import {
  resolveItemDisplayName,
  resolveItemDescription,
  type StorePluginItem,
} from "@/settings/pluginStoreListing.js";

export function GameDevelopmentPluginCard({
  item,
  actions,
  locale,
}: {
  item: StorePluginItem;
  actions: PluginStoreActions;
  locale: string;
}) {
  const { intl } = useKayingCodeIntl();
  const name = resolveItemDisplayName(item, locale);
  const description = resolveItemDescription(item, locale);
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="plugin-store-card"
      data-plugin-id={item.id}
      className={cn(
        "relative flex min-w-0 cursor-pointer flex-col gap-2.5 rounded-xl border border-card-border bg-card px-4 pb-2 transition-colors hover:border-border-hover hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused",
        item.listing?.gameDevelopment?.source?.kind === "open-source" ? "pt-8" : "pt-3",
      )}
      onClick={() => actions.onOpenDetail(item.id)}
      onKeyDown={(event) => {
        // 交互控件负责自己的键盘事件，避免 GitHub、开关和菜单误触详情。
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          actions.onOpenDetail(item.id);
        }
      }}
    >
      <GameDevelopmentPluginBanner item={item} />
      <div className="flex min-w-0 items-start gap-2.5">
        <PluginStoreAvatar item={item} className="size-8 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="min-w-0 truncate text-ui-base leading-tight font-semibold text-foreground"
              title={name}
            >
              {name}
            </span>
            <PluginStorePaidPlanBadge item={item} />
            <PluginStoreUpdateBadge item={item} />
          </div>
          {description ? (
            <p className="mt-1 line-clamp-2 text-ui-sm leading-snug text-foreground-subtle">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {item.listing?.gameDevelopment?.stages.map((stage) => (
          <span
            key={stage}
            className="rounded-md bg-surface px-1.5 py-0.5 text-ui-xs leading-tight text-foreground-subtle"
          >
            {intl.formatMessage({ id: `settings.plugins.game.stage.${stage}` })}
          </span>
        ))}
      </div>
      <div className="mt-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 border-t border-card-border pt-1.5">
        {item.installed ? (
          <>
            <PluginStoreEnabledControl item={item} actions={actions} />
            <div className="ml-auto flex items-center gap-1.5">
              <PluginStoreUpdateButton item={item} actions={actions} />
              <PluginStoreItemMenu item={item} actions={actions} />
            </div>
          </>
        ) : (
          <PluginStoreInstallButton item={item} actions={actions} />
        )}
      </div>
    </div>
  );
}
