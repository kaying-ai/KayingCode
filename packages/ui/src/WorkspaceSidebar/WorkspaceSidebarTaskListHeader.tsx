import type { ReactNode } from "react";
import {
  Clock3,
  Folder,
  Hash,
  ListFilter,
  MessageCircleCheck,
  MessageCirclePlus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { formatCommandShortcutLabel } from "@/lib/keyboardShortcuts.js";
import type { SidebarTaskSortBy } from "@/lib/sidebarTaskPreferences.js";
import type { WorkspaceSidebarTaskListView } from "@/WorkspaceSidebar/workspaceSidebarTaskListView.js";

interface WorkspaceSidebarTaskListHeaderProps {
  view: WorkspaceSidebarTaskListView;
  onViewChange(view: WorkspaceSidebarTaskListView): void;
  sortBy: SidebarTaskSortBy;
  onSortByChange(sortBy: SidebarTaskSortBy): void;
  onOpenCommandCenter?: () => void;
  showSortOptions?: boolean;
  /** 分组视图的全部展开/收起、新建分组等按视图变化的操作。 */
  actions?: ReactNode;
}

/**
 * 侧栏任务列表头部：标题、视图切换、搜索与排序。
 * 视图状态由 WorkspaceSidebar 的 organizeBy 偏好唯一持有，这里只投影与发出命令。
 */
export function WorkspaceSidebarTaskListHeader({
  view,
  onViewChange,
  sortBy,
  onSortByChange,
  onOpenCommandCenter,
  showSortOptions = true,
  actions,
}: WorkspaceSidebarTaskListHeaderProps) {
  const { intl } = useKayingCodeIntl();
  return (
    <div
      className="flex min-w-0 shrink-0 items-center gap-1 px-2 pb-2"
      data-testid="sidebar-search-toolbar"
    >
      <span
        data-testid="sidebar-list-title"
        className="min-w-0 flex-1 truncate px-2.5 text-ui-base font-medium text-foreground-subtle"
      >
        {intl.formatMessage({ id: "taskList.title" })}
      </span>
      {actions}
      {onOpenCommandCenter ? (
        <ControlHintTooltip
          title={intl.formatMessage({ id: "commandCenter.open" })}
          shortcut={formatCommandShortcutLabel("k")}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-foreground-subtle hover:text-foreground"
            data-testid="sidebar-search-open"
            aria-label={intl.formatMessage({ id: "commandCenter.open" })}
            onClick={onOpenCommandCenter}
          >
            <Search className="size-3.5" />
          </Button>
        </ControlHintTooltip>
      ) : null}
      <DropdownMenu>
        <ControlHintTooltip title={intl.formatMessage({ id: "project.view" })}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-foreground-subtle hover:text-foreground"
              data-testid="sidebar-view-menu"
              aria-label={intl.formatMessage({ id: "project.view" })}
            >
              <ListFilter className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </ControlHintTooltip>
        <DropdownMenuContent align="end" className="w-48 min-w-48">
          <DropdownMenuRadioGroup
            value={view}
            onValueChange={(value) => {
              if (value === "projects" || value === "grouped" || value === "timeline") {
                onViewChange(value);
              }
            }}
          >
            <DropdownMenuRadioItem data-testid="sidebar-view-projects" value="projects">
              <Folder className="size-4" />
              {intl.formatMessage({ id: "project.viewByProject" })}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem data-testid="sidebar-view-grouped" value="grouped">
              <Hash className="size-4" />
              {intl.formatMessage({ id: "taskGroup.view" })}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem data-testid="sidebar-view-timeline" value="timeline">
              <Clock3 className="size-4" />
              {intl.formatMessage({ id: "project.viewRecentlyUpdated" })}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          {showSortOptions ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>
                {intl.formatMessage({ id: "workspaceSidebar.sortBy" })}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={sortBy}
                onValueChange={(value) => {
                  if (value === "created" || value === "updated") {
                    onSortByChange(value);
                  }
                }}
              >
                <DropdownMenuRadioItem value="updated">
                  <MessageCircleCheck className="size-4" />
                  {intl.formatMessage({ id: "workspaceSidebar.sortByUpdated" })}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="created">
                  <MessageCirclePlus className="size-4" />
                  {intl.formatMessage({ id: "workspaceSidebar.sortByCreated" })}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
