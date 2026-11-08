export function useKayingCodeIntl() {
  return {
    intl: {
      formatMessage: ({ id }: { id: string }) =>
        ({
          "workspaceSidebar.pinnedProjectsSection": "置顶",
          "taskList.title": "任务",
          "project.dragPin": "松开置顶",
          "project.dragUnpin": "松开取消置顶",
          "project.dragReorder": "松开放在此处",
          "project.dragOutside": "移到目标区域",
          "project.projects": "项目",
          "project.tasks": "任务",
        })[id] ?? id,
    },
  };
}
export function ControlHintTooltip({ children }: { children: React.ReactNode }) {
  return children;
}
