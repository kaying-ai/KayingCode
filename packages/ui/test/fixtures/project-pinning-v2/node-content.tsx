// 只隔离任务行/服务消费；拖动注册使用真实 ProjectNode。
export function ProjectNodeContent({
  project,
  attributes,
  listeners,
  setActivatorNodeRef,
  dragEnabled,
  onPin,
}) {
  return (
    <div className="flex h-12 items-center gap-2 px-4">
      <button
        ref={setActivatorNodeRef}
        {...(dragEnabled ? attributes : {})}
        {...(dragEnabled ? listeners : {})}
        data-testid={`drag-${project.hostId}-${project.id}`}
      >
        {project.name}
      </button>
      <button aria-label={`pin-${project.hostId}-${project.id}`} onClick={() => onPin(project)}>
        pin
      </button>
    </div>
  );
}
