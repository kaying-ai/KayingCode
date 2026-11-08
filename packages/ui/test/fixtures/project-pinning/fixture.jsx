import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { WorkspacePurposeSection } from "../../../src/WorkspaceSidebar/WorkspacePurposeSection.js";
import {
  getWorkspaceProjectKey,
  PINNED_PROJECT_DROP_ZONE_ID,
  PINNED_PROJECT_SECTION_ID,
  partitionProjectTabsByPin,
  persistPinnedProjectKeys,
  readPinnedProjectKeys,
  REGULAR_PROJECT_DROP_ZONE_ID,
  REGULAR_PROJECT_SECTION_ID,
  resolveProjectPinDropTarget,
} from "../../../src/lib/workspaceProjectPinning.js";
import { resolveConversationSectionExpanded } from "../../../src/lib/sidebarPurposeSectionPreferences.js";
import { restrictSidebarDrag } from "../../../src/lib/restrictVerticalDragWithinContainer.js";
import "./styles.css";

const projects = [
  { id: "one", label: "alpha-game", workspacePath: "C:/games/alpha" },
  { id: "two", label: "beta-game", workspacePath: "C:/games/beta" },
];

function SortableProjectRow({ project, pinned, onToggle }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: project.id,
    data: { type: "workspace-project" },
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid={`project-row-${project.id}`}
      className="flex items-center justify-between rounded-lg bg-card px-3 py-2"
    >
      <span
        data-testid={`project-drag-${project.id}`}
        className="flex-1 touch-none"
        {...attributes}
        {...listeners}
      >
        {project.label}
      </span>
      <button type="button" onClick={() => onToggle(project)}>
        {pinned ? "取消置顶项目" : "置顶项目"}
      </button>
    </li>
  );
}

function ProjectRows({ items, pinned, onToggle, dropZoneTestId }) {
  return (
    <ul data-testid={dropZoneTestId} className="min-h-12 space-y-1 px-2 pb-3">
      {items.map((project) => (
        <SortableProjectRow
          key={project.id}
          project={project}
          pinned={pinned}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}

function Fixture() {
  const [pinnedKeys, setPinnedKeys] = useState(readPinnedProjectKeys);
  const [hasTasks, setHasTasks] = useState(false);
  const [tasksExpanded, setTasksExpanded] = useState(true);
  const previousHasTasks = useRef(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const { pinnedProjectTabs, regularProjectTabs } = partitionProjectTabsByPin(projects, pinnedKeys);
  useEffect(() => {
    setTasksExpanded((current) =>
      resolveConversationSectionExpanded({
        currentExpanded: current,
        previousHasItems: previousHasTasks.current,
        loading: false,
        hasItems: hasTasks,
      }),
    );
    previousHasTasks.current = hasTasks;
  }, [hasTasks]);
  const setPinned = useCallback((project, pinned) => {
    const key = getWorkspaceProjectKey(project);
    setPinnedKeys((current) => {
      if (current.has(key) === pinned) return current;
      const next = new Set(current);
      if (pinned) next.add(key);
      else next.delete(key);
      persistPinnedProjectKeys(next);
      return next;
    });
  }, []);
  const toggle = (project) => setPinned(project, !pinnedKeys.has(getWorkspaceProjectKey(project)));
  const handleDragEnd = ({ active, over }) => {
    const project = projects.find((item) => item.id === String(active.id));
    if (!project) return;
    const target = resolveProjectPinDropTarget({
      overId: over ? String(over.id) : null,
      pinnedProjectIds: pinnedProjectTabs.map((item) => item.id),
      regularProjectIds: regularProjectTabs.map((item) => item.id),
    });
    if (target) setPinned(project, target === "pinned");
  };
  return (
    <main className="h-screen w-80 bg-sidebar p-3 text-foreground">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictSidebarDrag]}
        onDragEnd={handleDragEnd}
      >
        <WorkspacePurposeSection
          title="置顶"
          open
          onOpenChange={() => {}}
          action={null}
          testId="pinned-project-section"
          sortableId={PINNED_PROJECT_SECTION_ID}
          dragHandleLabel="置顶"
          sortable={false}
          projectDropZoneId={PINNED_PROJECT_DROP_ZONE_ID}
        >
          <SortableContext
            items={pinnedProjectTabs.map((project) => project.id)}
            strategy={verticalListSortingStrategy}
          >
            <ProjectRows
              items={pinnedProjectTabs}
              pinned
              onToggle={toggle}
              dropZoneTestId="pinned-project-drop-area"
            />
          </SortableContext>
        </WorkspacePurposeSection>
        <WorkspacePurposeSection
          title="项目"
          open
          onOpenChange={() => {}}
          action={null}
          testId="project-section"
          sortableId={REGULAR_PROJECT_SECTION_ID}
          dragHandleLabel="项目"
          sortable={false}
          projectDropZoneId={REGULAR_PROJECT_DROP_ZONE_ID}
        >
          <SortableContext
            items={regularProjectTabs.map((project) => project.id)}
            strategy={verticalListSortingStrategy}
          >
            <ProjectRows
              items={regularProjectTabs}
              pinned={false}
              onToggle={toggle}
              dropZoneTestId="regular-project-drop-area"
            />
          </SortableContext>
        </WorkspacePurposeSection>
        <WorkspacePurposeSection
          title="任务"
          open={tasksExpanded}
          onOpenChange={setTasksExpanded}
          action={
            <button
              type="button"
              aria-label="新建任务"
              onClick={() => {
                setTasksExpanded(true);
                setHasTasks(true);
              }}
            >
              +
            </button>
          }
          testId="task-section"
          sortableId="tasks"
          dragHandleLabel="任务"
          sortable={false}
        >
          {hasTasks ? <div className="px-3 py-2">第一个任务</div> : null}
        </WorkspacePurposeSection>
      </DndContext>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Fixture />);
