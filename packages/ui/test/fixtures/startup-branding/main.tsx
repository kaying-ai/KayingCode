import { ProjectDragContext } from "@/project-sidebar/SortableProjects.js";
import { createRoot } from "react-dom/client";
import { ProjectSidebarListHeader } from "@/project-sidebar/ProjectSidebarListHeader.js";
import { PurposeSections } from "@/project-sidebar/PurposeSections.js";
import { KayingCodeStartupLogoBadge } from "@/root/RootStartupLoading.js";
import "@/styles.css";

createRoot(document.getElementById("root")!).render(
  <div className="bg-background text-foreground">
    <ProjectDragContext onDrop={() => {}}>
      <aside className="w-72">
        <ProjectSidebarListHeader
          view="projects"
          onViewChange={() => {}}
          onOpenCommandCenter={() => {}}
        />
        <PurposeSections
          projects={<p>project content</p>}
          tasks={<p>task content</p>}
          onAdd={() => {}}
          onCreate={() => {}}
          hasExpandedProjects={false}
          canToggleProjects={false}
          onToggleProjects={() => {}}
        />
      </aside>
    </ProjectDragContext>
    <div data-testid="animated-logo">
      <KayingCodeStartupLogoBadge />
    </div>
    <div data-testid="static-logo">
      <KayingCodeStartupLogoBadge animated={false} />
    </div>
  </div>,
);
