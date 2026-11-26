import { GitFork, Sparkles } from "lucide-react";
import type { GamePluginInstaller } from "@zcode/shared";
import { cn } from "@/components/lib/utils.js";
import { PluginIcon } from "@/components/PluginIcon.js";
import { Button } from "@/components/ui/button.js";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import {
  PluginStoreEnabledControl,
  PluginStoreItemMenu,
  PluginStoreUpdateButton,
  type PluginStoreActions,
} from "@/settings/PluginStoreCard.js";
import {
  resolveInstallerDescription,
  resolveInstallerDisplayName,
} from "@/settings/gamePluginInstallers.js";
import type { StorePluginItem } from "@/settings/pluginStoreListing.js";

/**
 * 社区游戏插件卡：未安装时只把安装指令交给 Agent；已安装时复用内置卡片的
 * 已启用控件与菜单，避免“看着没装、详情却是已安装”的状态割裂
 * （packages/ui/spec/game-development-plugin-installers.md）。
 */
export function GamePluginInstallerCard({
  installer,
  locale,
  installedItem,
  actions,
  onInstall,
}: {
  installer: GamePluginInstaller;
  locale: string;
  /** 任意 marketplace 已安装的同名插件；存在时卡片展示标准已安装控件。 */
  installedItem: StorePluginItem | null;
  actions: PluginStoreActions;
  onInstall: (installer: GamePluginInstaller) => void;
}) {
  const { intl } = useKayingCodeIntl();
  const platform = useOptionalPlatform();
  const message = (key: string) => intl.formatMessage({ id: `settings.plugins.game.${key}` });
  const name = resolveInstallerDisplayName(installer, locale);
  const description = resolveInstallerDescription(installer, locale);
  const repositoryUrl =
    installer.source.kind === "open-source" ? installer.source.repositoryUrl : undefined;
  const sourceLabel =
    installer.source.kind === "open-source"
      ? message(
          installer.source.tier === "official"
            ? "installer.sourceOfficial"
            : "installer.sourceCommunity",
        )
      : null;
  const primaryAction = () => {
    if (installedItem) {
      actions.onOpenDetail(installedItem.id);
      return;
    }
    onInstall(installer);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="game-plugin-installer-card"
      data-plugin-name={installer.name}
      data-installed={installedItem ? "true" : undefined}
      className={cn(
        "relative flex min-w-0 cursor-pointer flex-col gap-2.5 rounded-xl border border-card-border bg-card px-4 pb-2 transition-colors hover:border-border-hover hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused",
        repositoryUrl ? "pt-8" : "pt-3",
      )}
      onClick={primaryAction}
      onKeyDown={(event) => {
        // 交互控件负责自己的键盘事件，避免源码链接与主操作误触整卡。
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          primaryAction();
        }
      }}
    >
      {repositoryUrl ? (
        <a
          href={repositoryUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="game-plugin-installer-banner"
          aria-label={intl.formatMessage(
            { id: "settings.plugins.game.installer.sourceLabel" },
            { plugin: name },
          )}
          className="absolute top-0 right-0 inline-flex items-center gap-1.5 rounded-tr-xl rounded-bl-lg bg-selected px-2.5 py-1 text-ui-xs font-medium text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused"
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            if (platform) {
              event.preventDefault();
              void platform.openExternal(repositoryUrl);
            }
          }}
        >
          <GitFork className="size-3" aria-hidden="true" />
          {sourceLabel}
        </a>
      ) : null}
      <div className="flex min-w-0 items-start gap-2.5">
        <PluginIcon
          pluginId={installer.name}
          label={name}
          className="size-8 rounded-lg"
          iconClassName="size-4"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="min-w-0 truncate text-ui-base leading-tight font-semibold text-foreground"
              title={name}
            >
              {name}
            </span>
          </div>
          {description ? (
            <p className="mt-1 line-clamp-2 text-ui-sm leading-snug text-foreground-subtle">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 border-t border-card-border pt-1.5">
        {installedItem ? (
          <>
            <PluginStoreEnabledControl item={installedItem} actions={actions} />
            <div className="ml-auto flex items-center gap-1.5">
              <PluginStoreUpdateButton item={installedItem} actions={actions} />
              <PluginStoreItemMenu item={installedItem} actions={actions} />
            </div>
          </>
        ) : (
          <Button
            type="button"
            data-testid="game-plugin-installer-action"
            data-plugin-name={installer.name}
            variant="secondary"
            size="sm"
            className="rounded-full"
            aria-label={intl.formatMessage(
              { id: "settings.plugins.game.installer.actionLabel" },
              { plugin: name },
            )}
            onClick={(event) => {
              event.stopPropagation();
              onInstall(installer);
            }}
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            {message("installer.action")}
          </Button>
        )}
      </div>
    </div>
  );
}
