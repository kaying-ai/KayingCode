import assert from "node:assert/strict";
import { test } from "vitest";
import {
  resolveSidebarTaskOrganizeByForView,
  resolveWorkspaceSidebarTaskListView,
} from "../src/WorkspaceSidebar/workspaceSidebarTaskListView.ts";

test("organizeBy 映射到侧栏视图", () => {
  assert.equal(resolveWorkspaceSidebarTaskListView("project"), "projects");
  assert.equal(resolveWorkspaceSidebarTaskListView("grouped"), "grouped");
  assert.equal(resolveWorkspaceSidebarTaskListView("chronological"), "timeline");
});

test("侧栏视图映射回唯一 organizeBy", () => {
  assert.equal(resolveSidebarTaskOrganizeByForView("projects"), "project");
  assert.equal(resolveSidebarTaskOrganizeByForView("grouped"), "grouped");
  assert.equal(resolveSidebarTaskOrganizeByForView("timeline"), "chronological");
});

test("视图与 organizeBy 往返稳定", () => {
  for (const view of ["projects", "grouped", "timeline"] as const) {
    assert.equal(
      resolveWorkspaceSidebarTaskListView(resolveSidebarTaskOrganizeByForView(view)),
      view,
    );
  }
});
