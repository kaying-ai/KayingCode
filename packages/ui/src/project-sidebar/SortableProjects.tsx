import { createPortal } from "react-dom";
import { Cloud, Folder } from "lucide-react";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import type { ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  useDndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { VirtualProject } from "@/project-sidebar/contract.js";
import {
  PINNED_PROJECT_DROP_ZONE_ID,
  REGULAR_PROJECT_DROP_ZONE_ID,
} from "@/lib/workspaceProjectPinning.js";
import { projectKey } from "@/project-sidebar/view.js";

const pointerOptions = { activationConstraint: { distance: 6 } };
const keyboardOptions = { coordinateGetter: sortableKeyboardCoordinates };
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });
const previewOffset: Modifier = ({ transform, activatorEvent, activeNodeRect }) => {
  const pointer = activatorEvent instanceof MouseEvent ? activatorEvent : null;
  return {
    ...transform,
    x: transform.x + (pointer && activeNodeRect ? pointer.clientX - activeNodeRect.left : 20) + 12,
    y: transform.y + (pointer && activeNodeRect ? pointer.clientY - activeNodeRect.top : 0) + 12,
  };
};
// 修复原因：置顶/普通项目曾各自持有 DndContext，跨区落点永远不可见。
const collision: CollisionDetection = (args) => {
  const projectDrag = args.active.data.current?.type === "workspace-project";
  const droppableContainers = args.droppableContainers.filter((container) => {
    if (projectDrag && container.id === args.active.id) return false;
    const type = container.data.current?.type;
    return projectDrag
      ? ["workspace-project", "project-section", "project-pin-zone"].includes(type)
      : type === "purpose-section";
  });
  const scoped = { ...args, droppableContainers };
  const hits = args.pointerCoordinates ? pointerWithin(scoped) : closestCenter(scoped);
  // 行优先于包含它的分区；空分区标题仍是有效目标，区域外不猜落点。
  const rows = hits.filter(
    (hit) => hit.data?.droppableContainer.data.current?.type === "workspace-project",
  );
  return projectDrag && rows.length ? rows : hits;
};

export function ProjectDragContext({
  children,
  onDrop,
}: {
  children: ReactNode;
  onDrop(active: string, over: string): void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, pointerOptions),
    useSensor(KeyboardSensor, keyboardOptions),
  );
  return (
    <DndContext
      sensors={sensors}
      modifiers={[verticalOnly]}
      collisionDetection={collision}
      onDragEnd={({ active, over }) => {
        if (active.data.current?.type === "workspace-project" && over && active.id !== over.id)
          onDrop(String(active.id), String(over.id));
      }}
    >
      {children}
      <ProjectDragPreview />
    </DndContext>
  );
}

export function SortableProjects({
  projects,
  renderProject,
}: {
  projects: VirtualProject[];
  renderProject(project: VirtualProject): ReactNode;
}) {
  return (
    <SortableContext items={projects.map(projectKey)} strategy={verticalListSortingStrategy}>
      {projects.map(renderProject)}
    </SortableContext>
  );
}

/** Host+project key 决定跨区写入目标；区域外和陈旧 ID 不产生操作。 */
export function resolveProjectDrop(projects: VirtualProject[], active: string, over: string) {
  const source = projects.find((item) => projectKey(item) === active);
  const target = projects.find((item) => projectKey(item) === over);
  const pinned =
    over === PINNED_PROJECT_DROP_ZONE_ID
      ? true
      : over === REGULAR_PROJECT_DROP_ZONE_ID
        ? false
        : target?.pinned;
  return source && pinned !== undefined ? { source, target, pinned } : undefined;
}

/** 临时预览只读同一个 active/over，不复制拖动或持久化状态。 */
function ProjectDragPreview() {
  const { active, over } = useDndContext();
  const { intl } = useKayingCodeIntl();
  const data = active?.data.current;
  const dragging = data?.type === "workspace-project";
  const targetPinned =
    over?.id === PINNED_PROJECT_DROP_ZONE_ID
      ? true
      : over?.id === REGULAR_PROJECT_DROP_ZONE_ID
        ? false
        : over?.data.current?.pinned;
  const hint =
    targetPinned === undefined
      ? "project.dragOutside"
      : targetPinned !== data?.pinned
        ? targetPinned
          ? "project.dragPin"
          : "project.dragUnpin"
        : "project.dragReorder";
  const Icon = data?.hostId === "local" ? Folder : Cloud;
  // 修复原因：原先拖整棵展开节点会被滚动容器裁切，portal 浮层保持项目名始终可见。
  return createPortal(
    <DragOverlay modifiers={[previewOffset]} dropAnimation={null} zIndex={1000}>
      {dragging ? (
        <div
          data-testid="project-drag-overlay"
          className="pointer-events-none flex flex-col gap-1 rounded-lg border border-icon-blue bg-popover px-3 py-2 text-ui-base text-foreground shadow-lg"
          style={{ width: Math.min(active?.rect.current.initial?.width ?? 280, 280) }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="size-3.5 shrink-0 text-foreground-subtle" />
            <span className="min-w-0 flex-1 truncate font-medium">{data?.name}</span>
            {data?.deviceLabel && (
              <span className="max-w-24 truncate text-ui-xs text-foreground-subtle">
                {data.deviceLabel}
              </span>
            )}
          </div>
          <span className="text-ui-sm text-foreground-subtle">
            {intl.formatMessage({ id: hint })}
          </span>
        </div>
      ) : null}
    </DragOverlay>,
    document.body,
  );
}
