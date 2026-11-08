import { GitFork } from "lucide-react";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import type { StorePluginItem } from "@/settings/pluginStoreListing.js";

export function GameDevelopmentPluginBanner({ item }: { item: StorePluginItem }) {
  const platform = useOptionalPlatform();
  const { intl } = useKayingCodeIntl();
  const source = item.listing?.gameDevelopment?.source;
  if (source?.kind !== "open-source") return null;
  return (
    <a
      href={source.repositoryUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="game-plugin-github-banner"
      aria-label={intl.formatMessage(
        { id: "settings.plugins.game.githubLabel" },
        { plugin: item.listing?.displayName ?? item.name },
      )}
      className="absolute top-0 right-0 inline-flex items-center gap-1.5 rounded-tr-xl rounded-bl-lg bg-selected px-2.5 py-1 text-ui-xs font-medium text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused"
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (platform) {
          event.preventDefault();
          void platform.openExternal(source.repositoryUrl);
        }
      }}
    >
      <GitFork className="size-3" aria-hidden="true" />
      {intl.formatMessage({ id: "settings.plugins.game.github" })}
    </a>
  );
}
