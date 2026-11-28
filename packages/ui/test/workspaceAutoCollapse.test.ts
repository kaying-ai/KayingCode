import assert from "node:assert/strict";
import { test } from "vitest";
import {
  resolveWorkspaceAutoCollapse,
  WORKSPACE_AUTO_COLLAPSE_HYSTERESIS_PX,
  WORKSPACE_AUTO_COLLAPSE_SIDE_PANE_WIDTH_PX,
  WORKSPACE_AUTO_COLLAPSE_SIDEBAR_WIDTH_PX,
} from "../src/app-shell/workspaceAutoCollapse.js";

const WIDE = 1440;

test("工作区低于阈值时自动收起右侧面板并记录归属", () => {
  const decision = resolveWorkspaceAutoCollapse({
    widthPx: WORKSPACE_AUTO_COLLAPSE_SIDE_PANE_WIDTH_PX - 1,
    isSidePaneOpen: true,
    isSidebarVisible: true,
    sidePaneAutoCollapsed: false,
    sidebarAutoCollapsed: false,
  });
  assert.equal(decision.collapseSidePane, true);
  assert.equal(decision.nextSidePaneAutoCollapsed, true);
  assert.equal(decision.collapseSidebar, false);
});

test("迟滞带内保持收起，不因临界宽度抖动反复开合", () => {
  const decision = resolveWorkspaceAutoCollapse({
    widthPx: WORKSPACE_AUTO_COLLAPSE_SIDE_PANE_WIDTH_PX + WORKSPACE_AUTO_COLLAPSE_HYSTERESIS_PX - 1,
    isSidePaneOpen: false,
    isSidebarVisible: true,
    sidePaneAutoCollapsed: true,
    sidebarAutoCollapsed: false,
  });
  assert.equal(decision.collapseSidePane, false);
  assert.equal(decision.restoreSidePane, false);
  assert.equal(decision.nextSidePaneAutoCollapsed, true);
});

test("超过恢复阈值后自动展开此前由策略收起的右侧面板", () => {
  const decision = resolveWorkspaceAutoCollapse({
    widthPx: WORKSPACE_AUTO_COLLAPSE_SIDE_PANE_WIDTH_PX + WORKSPACE_AUTO_COLLAPSE_HYSTERESIS_PX,
    isSidePaneOpen: false,
    isSidebarVisible: true,
    sidePaneAutoCollapsed: true,
    sidebarAutoCollapsed: false,
  });
  assert.equal(decision.restoreSidePane, true);
  assert.equal(decision.nextSidePaneAutoCollapsed, false);
});

test("用户手动关闭的面板不会被自动展开", () => {
  const decision = resolveWorkspaceAutoCollapse({
    widthPx: WIDE,
    isSidePaneOpen: false,
    isSidebarVisible: true,
    sidePaneAutoCollapsed: false,
    sidebarAutoCollapsed: false,
  });
  assert.equal(decision.restoreSidePane, false);
  assert.equal(decision.collapseSidePane, false);
});

test("宽屏且面板已打开时不做任何动作", () => {
  const decision = resolveWorkspaceAutoCollapse({
    widthPx: WIDE,
    isSidePaneOpen: true,
    isSidebarVisible: true,
    sidePaneAutoCollapsed: false,
    sidebarAutoCollapsed: false,
  });
  assert.deepEqual(decision, {
    collapseSidePane: false,
    collapseSidebar: false,
    restoreSidebar: false,
    restoreSidePane: false,
    nextSidePaneAutoCollapsed: false,
    nextSidebarAutoCollapsed: false,
  });
});

test("左侧栏使用独立阈值与迟滞带", () => {
  const narrow = resolveWorkspaceAutoCollapse({
    widthPx: WORKSPACE_AUTO_COLLAPSE_SIDEBAR_WIDTH_PX - 1,
    isSidePaneOpen: false,
    isSidebarVisible: true,
    sidePaneAutoCollapsed: false,
    sidebarAutoCollapsed: false,
  });
  assert.equal(narrow.collapseSidebar, true);
  assert.equal(narrow.nextSidebarAutoCollapsed, true);

  const band = resolveWorkspaceAutoCollapse({
    widthPx: WORKSPACE_AUTO_COLLAPSE_SIDEBAR_WIDTH_PX + WORKSPACE_AUTO_COLLAPSE_HYSTERESIS_PX - 1,
    isSidePaneOpen: false,
    isSidebarVisible: false,
    sidePaneAutoCollapsed: false,
    sidebarAutoCollapsed: true,
  });
  assert.equal(band.restoreSidebar, false);
  assert.equal(band.nextSidebarAutoCollapsed, true);

  const restored = resolveWorkspaceAutoCollapse({
    widthPx: WORKSPACE_AUTO_COLLAPSE_SIDEBAR_WIDTH_PX + WORKSPACE_AUTO_COLLAPSE_HYSTERESIS_PX,
    isSidePaneOpen: false,
    isSidebarVisible: false,
    sidePaneAutoCollapsed: false,
    sidebarAutoCollapsed: true,
  });
  assert.equal(restored.restoreSidebar, true);
  assert.equal(restored.nextSidebarAutoCollapsed, false);
});

test("极窄工作区在同一次判定里同时收起右侧面板与左侧栏", () => {
  const decision = resolveWorkspaceAutoCollapse({
    widthPx: WORKSPACE_AUTO_COLLAPSE_SIDEBAR_WIDTH_PX - 100,
    isSidePaneOpen: true,
    isSidebarVisible: true,
    sidePaneAutoCollapsed: false,
    sidebarAutoCollapsed: false,
  });
  assert.equal(decision.collapseSidePane, true);
  assert.equal(decision.collapseSidebar, true);
  assert.equal(decision.nextSidePaneAutoCollapsed, true);
  assert.equal(decision.nextSidebarAutoCollapsed, true);
});

test("无法测量宽度时不改变任何状态", () => {
  for (const widthPx of [0, Number.NaN]) {
    const decision = resolveWorkspaceAutoCollapse({
      widthPx,
      isSidePaneOpen: true,
      isSidebarVisible: true,
      sidePaneAutoCollapsed: true,
      sidebarAutoCollapsed: false,
    });
    assert.equal(decision.collapseSidePane, false);
    assert.equal(decision.collapseSidebar, false);
    assert.equal(decision.restoreSidePane, false);
    assert.equal(decision.restoreSidebar, false);
    assert.equal(decision.nextSidePaneAutoCollapsed, true);
    assert.equal(decision.nextSidebarAutoCollapsed, false);
  }
});
