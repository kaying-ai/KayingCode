import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import enUS from "../src/i18n/locales/en-US.js";
import zhCN from "../src/i18n/locales/zh-CN.js";
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
} from "../src/lib/workspaceProjectPinning.js";
import {
  persistSidebarPurposeSectionPreferences,
  readSidebarPurposeSectionPreferences,
  resolveConversationSectionExpanded,
} from "../src/lib/sidebarPurposeSectionPreferences.js";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}

test("project pinning uses workspace identity and persists a normalized set", () => {
  const local = { workspacePath: "C:/games/local" };
  const remote = { workspacePath: "/games/shared", workspaceIdentity: " ssh://host/games/shared " };
  assert.equal(getWorkspaceProjectKey(local), "C:/games/local");
  assert.equal(getWorkspaceProjectKey(remote), "ssh://host/games/shared");

  const storage = memoryStorage();
  persistPinnedProjectKeys(new Set(["", "C:/games/local", "C:/games/local"]), storage);
  assert.deepEqual([...readPinnedProjectKeys(storage)], ["C:/games/local"]);
  assert.deepEqual([...readPinnedProjectKeys(memoryStorage('{"bad":true}'))], []);
});

test("pinned projects are removed from the regular project partition", () => {
  const tabs = [
    { id: "one", workspacePath: "C:/games/one" },
    { id: "two", workspacePath: "C:/games/two", workspaceIdentity: "remote:two" },
  ];
  const result = partitionProjectTabsByPin(tabs, new Set(["remote:two"]));
  assert.deepEqual(
    result.pinnedProjectTabs.map((tab) => tab.id),
    ["two"],
  );
  assert.deepEqual(
    result.regularProjectTabs.map((tab) => tab.id),
    ["one"],
  );
});

test("project drag targets resolve from section zones and project rows", () => {
  const input = {
    pinnedProjectIds: ["pinned-one"],
    regularProjectIds: ["regular-one"],
  };
  assert.equal(
    resolveProjectPinDropTarget({ ...input, overId: PINNED_PROJECT_DROP_ZONE_ID }),
    "pinned",
  );
  assert.equal(resolveProjectPinDropTarget({ ...input, overId: "pinned-one" }), "pinned");
  assert.equal(
    resolveProjectPinDropTarget({ ...input, overId: PINNED_PROJECT_SECTION_ID }),
    "pinned",
  );
  assert.equal(
    resolveProjectPinDropTarget({ ...input, overId: REGULAR_PROJECT_DROP_ZONE_ID }),
    "regular",
  );
  assert.equal(resolveProjectPinDropTarget({ ...input, overId: "regular-one" }), "regular");
  assert.equal(
    resolveProjectPinDropTarget({ ...input, overId: REGULAR_PROJECT_SECTION_ID }),
    "regular",
  );
  assert.equal(resolveProjectPinDropTarget({ ...input, overId: "conversations" }), null);
  assert.equal(resolveProjectPinDropTarget({ ...input, overId: null }), null);
});

test("empty task sections collapse and expand when their first task appears", () => {
  assert.equal(
    resolveConversationSectionExpanded({
      currentExpanded: true,
      previousHasItems: null,
      loading: false,
      hasItems: false,
    }),
    false,
  );
  assert.equal(
    resolveConversationSectionExpanded({
      currentExpanded: false,
      previousHasItems: false,
      loading: false,
      hasItems: true,
    }),
    true,
  );
  assert.equal(
    resolveConversationSectionExpanded({
      currentExpanded: false,
      previousHasItems: true,
      loading: false,
      hasItems: true,
    }),
    false,
  );
});

test("existing sidebar preferences migrate with the pinned project section expanded", () => {
  const storage = memoryStorage(
    JSON.stringify({
      projectsExpanded: true,
      conversationsExpanded: false,
      sectionOrder: ["projects", "conversations"],
    }),
  );
  const preferences = readSidebarPurposeSectionPreferences(storage);
  assert.equal(preferences.pinnedProjectsExpanded, true);
  persistSidebarPurposeSectionPreferences(
    { ...preferences, pinnedProjectsExpanded: false },
    storage,
  );
  assert.equal(readSidebarPurposeSectionPreferences(storage).pinnedProjectsExpanded, false);
});

test("historically pinned sessions use the ordinary active task projection", async () => {
  const [workspaceLists, timeline, grouped] = await Promise.all([
    readFile(new URL("../src/hooks/useWorkspaceTaskLists.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/WorkspaceTimelineTasksSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/buildGroupedTaskViewFromSessions.ts", import.meta.url), "utf8"),
  ]);
  assert.match(workspaceLists, /kind:\s*"active"/u);
  assert.match(timeline, /kind:\s*"active"/u);
  assert.doesNotMatch(grouped, /pinnedIds\.has\(task\.taskId\)\s*\|\|/u);
});

test("sidebar presentation switches pinning to projects and updates the product tagline", async () => {
  const [sidebar, taskMenu] = await Promise.all([
    readFile(new URL("../src/WorkspaceSidebar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/TaskActionMenuContent.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(sidebar, /WorkspacePinnedTasksSection/u);
  assert.doesNotMatch(taskMenu, /taskList\.(?:pin|unpin)/u);
  assert.equal(zhCN["workspaceSidebar.pinnedProjectsSection"], "置顶");
  assert.equal(zhCN["workspaceSidebar.pinProject"], "置顶项目");
  assert.equal(zhCN["workspaceSidebar.unpinProject"], "取消置顶项目");
  assert.equal(zhCN["sidebar.profile.notLoggedIn"], "游戏开发Harness");
  assert.equal(enUS["sidebar.profile.notLoggedIn"], "Game Development Harness");
});
