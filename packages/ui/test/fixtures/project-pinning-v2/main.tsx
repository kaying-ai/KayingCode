import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ProjectDragContext,
  SortableProjects,
  resolveProjectDrop,
} from "@/project-sidebar/SortableProjects.js";
import { ProjectSidebarListHeader } from "@/project-sidebar/ProjectSidebarListHeader.js";
import { PurposeSections } from "@/project-sidebar/PurposeSections.js";
import { ProjectNode } from "@/project-sidebar/ProjectNode.js";
import { ProjectTaskListContext } from "@/project-sidebar/ProjectTaskListContext.js";
import { projectKey } from "@/project-sidebar/view.js";
import "@/styles.css";

const initial = [
  { id: "one", hostId: "local", name: "alpha-game", pinned: false, roots: [] },
  { id: "one", hostId: "remote", name: "alpha-game", pinned: false, roots: [] },
  { id: "two", hostId: "local", name: "beta-game", pinned: false, roots: [] },
];
function Fixture() {
  const [projects, update] = useState(() =>
    JSON.parse(localStorage.getItem("fixture-projects") || JSON.stringify(initial)),
  );
  const save = (next) => {
    localStorage.setItem("fixture-projects", JSON.stringify(next));
    update(next);
  };
  const [mobile, setMobile] = useState(false);
  const render = (project) => (
    <ProjectNode
      key={projectKey(project)}
      project={project}
      expanded={false}
      onExpandedChange={() => {}}
      onMove={() => {}}
      onPin={() =>
        save(
          projects.map((p) =>
            projectKey(p) === projectKey(project) ? { ...p, pinned: !p.pinned } : p,
          ),
        )
      }
    />
  );
  return (
    <main className="w-80 bg-sidebar text-foreground">
      <button onClick={() => setMobile(!mobile)}>mobile</button>
      <ProjectTaskListContext.Provider value={{ isWebRemoteControl: mobile }}>
        <ProjectDragContext
          onDrop={(active, over) => {
            const drop = resolveProjectDrop(projects, active, over);
            if (!drop) return;
            if (drop.source.pinned !== drop.pinned)
              save(
                projects.map((p) => (projectKey(p) === active ? { ...p, pinned: drop.pinned } : p)),
              );
            else if (drop.target) {
              const next = [...projects];
              const from = next.indexOf(drop.source);
              const to = next.indexOf(drop.target);
              next.splice(to, 0, ...next.splice(from, 1));
              save(next);
            }
          }}
        >
          <ProjectSidebarListHeader
            view="projects"
            onViewChange={() => {}}
            onOpenCommandCenter={() => {}}
          />
          <div data-testid="pinned-projects">
            <SortableProjects projects={projects.filter((p) => p.pinned)} renderProject={render} />
          </div>
          <PurposeSections
            projects={
              <SortableProjects
                projects={projects.filter((p) => !p.pinned)}
                renderProject={render}
              />
            }
            tasks={null}
            onAdd={() => {}}
            onCreate={() => {}}
            hasExpandedProjects={false}
            canToggleProjects={false}
            onToggleProjects={() => {}}
          />
        </ProjectDragContext>
      </ProjectTaskListContext.Provider>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
