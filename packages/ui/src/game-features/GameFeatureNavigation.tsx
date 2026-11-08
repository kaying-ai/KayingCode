import { Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { DEFAULT_GAME_FEATURE_PAGE, type GameFeaturePage } from "@/lib/gameFeaturePages.js";

export function GameFeatureNavigation({
  page,
  onNavigate,
}: {
  page: GameFeaturePage | null;
  onNavigate: (page: GameFeaturePage) => void;
}) {
  const { intl } = useKayingCodeIntl();
  return (
    <Button
      type="button"
      variant="ghost"
      size="lg"
      onClick={() => onNavigate(DEFAULT_GAME_FEATURE_PAGE)}
      data-testid="game-center-sidebar-open"
      aria-pressed={page !== null}
      data-icon="inline-start"
      className={cn(
        "w-full justify-start gap-2 text-foreground hover:bg-surface-hover hover:text-foreground",
        page !== null && "bg-selected",
      )}
    >
      <Gamepad2 className="size-4 shrink-0" />
      <span>{intl.formatMessage({ id: "gameFeatures.sidebarCenter" })}</span>
    </Button>
  );
}
