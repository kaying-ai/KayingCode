import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ScrollFadeViewport } from "@/components/ui/scroll-fade-viewport.js";
import type { ProjectSidebarProps, ProjectTask } from "@/project-sidebar/contract.js";
import { ProjectTaskRows } from "@/project-sidebar/ProjectTaskRows.js";

export function MobileProjectSessions({
  name,
  title,
  status,
  tasks,
  taskCountLabel,
  createLabel,
  onCreate,
  onSelect,
  refresh,
}: {
  name?: string;
  title: string;
  status?: string;
  tasks?: ProjectTask[];
  taskCountLabel?: string;
  createLabel: string;
  onCreate(): void;
  onSelect: ProjectSidebarProps["onSelectTask"];
  refresh(): Promise<void>;
}) {
  return (
    <section
      aria-label={title}
      className="flex h-full min-h-0 flex-col text-foreground"
      data-testid="mobile-project-sessions"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-4">
        <div className="min-w-0">
          {name && <h1 className="truncate text-ui-lg font-semibold">{name}</h1>}
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-ui-caption text-foreground-subtle">
            <span>{title}</span>
            {taskCountLabel && <span>{taskCountLabel}</span>}
          </p>
        </div>
        {!status && (
          <Button className="min-h-11 shrink-0" onClick={onCreate}>
            <Plus aria-hidden="true" className="size-4" />
            {createLabel}
          </Button>
        )}
      </header>
      <ScrollFadeViewport className="min-h-0 flex-1 overflow-x-hidden">
        {status ? (
          <p role="status" className="px-4 py-4 text-ui-base text-foreground-subtle">
            {status}
          </p>
        ) : (
          <div className="px-4 py-4 [&_[data-task-item-key]]:min-h-16 [&_[data-task-item-key]]:border [&_[data-task-item-key]]:border-card-border [&_[data-task-item-key]]:px-3 [&_[data-task-item-key]]:py-2.5">
            <ProjectTaskRows
              tasks={tasks ?? []}
              onSelect={onSelect}
              refresh={refresh}
              rowVariant="timeline"
            />
          </div>
        )}
      </ScrollFadeViewport>
    </section>
  );
}
