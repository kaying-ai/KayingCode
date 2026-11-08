import { ChevronDown, FolderOpen, Loader2, Plus, Sparkles } from "lucide-react";
import type { ComponentProps } from "react";
import type { CreateTaskRequest } from "@/app-shell/types.js";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { usePluginCreator } from "@/hooks/usePluginCreator.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";

export function PluginAddMenu({
  onCreateTask,
  onAddMarketplace,
  onInstallLocal,
  testId,
  variant = "default",
}: {
  onCreateTask?: (request?: CreateTaskRequest) => void;
  onAddMarketplace: () => void;
  onInstallLocal?: () => void;
  testId: string;
  /** 市场页顶部把主按钮让给“管理已安装”，添加菜单使用弱化描边样式。 */
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  const { intl } = useKayingCodeIntl();
  const creator = usePluginCreator(onCreateTask);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={variant} data-testid={testId}>
          {creator.busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
          {intl.formatMessage({ id: "pluginCreator.add" })}
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-testid="plugin-add-menu">
        <DropdownMenuItem
          data-testid="plugin-create-menu-item"
          disabled={creator.busy || !creator.available}
          onSelect={() => void creator.create()}
        >
          <Sparkles className="size-4" aria-hidden="true" />
          {intl.formatMessage({ id: "pluginCreator.create" })}
        </DropdownMenuItem>
        {onInstallLocal ? (
          <DropdownMenuItem data-testid="plugin-install-local-menu-item" onSelect={onInstallLocal}>
            <FolderOpen className="size-4" aria-hidden="true" />
            {intl.formatMessage({ id: "pluginCreator.installLocal" })}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          data-testid="plugin-store-add-source-menu-item"
          onSelect={onAddMarketplace}
        >
          <Plus className="size-4" aria-hidden="true" />
          {intl.formatMessage({ id: "pluginCreator.addMarketplace" })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
