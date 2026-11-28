/**
 * 工作区级自动收起判定。
 *
 * 只使用整个 workspace shell 的宽度，不读 conversation 面板宽度：
 * conversation 宽度会随右侧面板开合变化，用它判定会在“打开面板后窗口 resize”时形成
 * “面板变窄 → 收起面板”的反馈。工作区宽度只由窗口尺寸决定，语义更稳定。
 *
 * 阈值按原行为换算（右侧面板默认 45%，侧栏默认 264px）：
 * - 原“conversation < 480”约等于“workspace < 1136”，取 1120；
 * - 原“conversation < 360”约等于“workspace < 624”，取 640。
 * 每个收起阈值配一条滞回带：宽度超过“收起阈值 + 滞回带”才自动恢复，避免临界宽度反复开合。
 */

/** 工作区宽度低于该值时自动收起右侧面板。 */
export const WORKSPACE_AUTO_COLLAPSE_SIDE_PANE_WIDTH_PX = 1120;
/** 工作区宽度低于该值时自动收起左侧栏。 */
export const WORKSPACE_AUTO_COLLAPSE_SIDEBAR_WIDTH_PX = 640;
/** 滞回带：恢复阈值 = 对应收起阈值 + 该值。 */
export const WORKSPACE_AUTO_COLLAPSE_HYSTERESIS_PX = 120;

export interface WorkspaceAutoCollapseInput {
  widthPx: number;
  isSidePaneOpen: boolean;
  isSidebarVisible: boolean;
  /** 右侧面板是否由本策略自动收起；用户手动开关会清除该归属。 */
  sidePaneAutoCollapsed: boolean;
  /** 左侧栏是否由本策略自动收起。 */
  sidebarAutoCollapsed: boolean;
}

export interface WorkspaceAutoCollapseDecision {
  collapseSidePane: boolean;
  restoreSidePane: boolean;
  collapseSidebar: boolean;
  restoreSidebar: boolean;
  nextSidePaneAutoCollapsed: boolean;
  nextSidebarAutoCollapsed: boolean;
}

const NO_OP_DECISION: Omit<
  WorkspaceAutoCollapseDecision,
  "nextSidePaneAutoCollapsed" | "nextSidebarAutoCollapsed"
> = {
  collapseSidePane: false,
  collapseSidebar: false,
  restoreSidebar: false,
  restoreSidePane: false,
};

export function resolveWorkspaceAutoCollapse(
  input: WorkspaceAutoCollapseInput,
): WorkspaceAutoCollapseDecision {
  if (!Number.isFinite(input.widthPx) || input.widthPx <= 0) {
    return {
      ...NO_OP_DECISION,
      nextSidePaneAutoCollapsed: input.sidePaneAutoCollapsed,
      nextSidebarAutoCollapsed: input.sidebarAutoCollapsed,
    };
  }

  const collapseSidePane =
    input.isSidePaneOpen && input.widthPx < WORKSPACE_AUTO_COLLAPSE_SIDE_PANE_WIDTH_PX;
  const restoreSidePane =
    !input.isSidePaneOpen &&
    input.sidePaneAutoCollapsed &&
    input.widthPx >=
      WORKSPACE_AUTO_COLLAPSE_SIDE_PANE_WIDTH_PX + WORKSPACE_AUTO_COLLAPSE_HYSTERESIS_PX;
  const collapseSidebar =
    input.isSidebarVisible && input.widthPx < WORKSPACE_AUTO_COLLAPSE_SIDEBAR_WIDTH_PX;
  const restoreSidebar =
    !input.isSidebarVisible &&
    input.sidebarAutoCollapsed &&
    input.widthPx >=
      WORKSPACE_AUTO_COLLAPSE_SIDEBAR_WIDTH_PX + WORKSPACE_AUTO_COLLAPSE_HYSTERESIS_PX;

  return {
    collapseSidePane,
    collapseSidebar,
    restoreSidebar,
    restoreSidePane,
    nextSidePaneAutoCollapsed: collapseSidePane
      ? true
      : restoreSidePane
        ? false
        : input.sidePaneAutoCollapsed,
    nextSidebarAutoCollapsed: collapseSidebar
      ? true
      : restoreSidebar
        ? false
        : input.sidebarAutoCollapsed,
  };
}
