import assert from "node:assert/strict";
import { test } from "vitest";
import type { BrowserViewScreenshotSurfacePreparePayload } from "@zcode/shared";
import { findScreenshotSurfaceTabForRender } from "../src/browser-use/useBrowserScreenshotSurfaceRequest.js";
import type {
  PluginBrowserCompareSidePaneTab,
  TapTapPreviewSidePaneTab,
} from "../src/lib/workspaceSidePane.js";

const taptapTab: TapTapPreviewSidePaneTab = {
  id: "taptap-preview:task-1",
  type: "taptap-preview",
  ownerTaskId: "task-1",
  workspaceKey: "workspace-a",
  workspacePath: "/workspace/a",
  sessionId: "task-1",
  tabId: "taptap-preview:task-1",
  title: "游戏预览",
};

const compareTab: PluginBrowserCompareSidePaneTab = {
  id: "plugin-compare:fixture:compare:task-1",
  type: "plugin-browser-compare",
  ownerTaskId: "task-1",
  workspaceKey: "workspace-a",
  workspacePath: "/workspace/a",
  sessionId: "task-1",
  pluginId: "fixture@marketplace",
  contribution: {
    contractVersion: 1,
    id: "compare",
    kind: "browser-compare",
    title: "Compare",
    publicationFile: ".maker/compare.v1.json",
    views: [
      { id: "source", label: "Source", profile: "standard-web" },
      { id: "target", label: "Target", profile: "taptap-preview" },
    ],
  },
  sourceTabId: "plugin-compare:fixture:compare:task-1:source:one",
  targetTabId: "plugin-compare:fixture:compare:task-1:target:two",
  title: "Compare",
};

function createPrepare(
  overrides: Partial<BrowserViewScreenshotSurfacePreparePayload> = {},
): BrowserViewScreenshotSurfacePreparePayload {
  return {
    requestId: "request-1",
    workspaceKey: "workspace-a",
    sessionId: "task-1",
    browserId: "iab-1",
    browserGeneration: 2,
    tabId: "taptap-preview:task-1",
    webContentsId: 7,
    viewport: { width: 1280, height: 720 },
    ...overrides,
  };
}

test("TapTap preview receives screenshot surface requests without duplicating browser identity", () => {
  assert.equal(findScreenshotSurfaceTabForRender([taptapTab], createPrepare()), taptapTab);
});

test("TapTap screenshot surface request cannot cross session or tab scope", () => {
  assert.equal(
    findScreenshotSurfaceTabForRender([taptapTab], createPrepare({ sessionId: "task-2" })),
    undefined,
  );
  assert.equal(
    findScreenshotSurfaceTabForRender(
      [taptapTab],
      createPrepare({ tabId: "taptap-preview:task-2" }),
    ),
    undefined,
  );
});

test("browser compare routes screenshot preparation to either child guest through one parent", () => {
  assert.equal(
    findScreenshotSurfaceTabForRender(
      [compareTab],
      createPrepare({ tabId: compareTab.sourceTabId }),
    ),
    compareTab,
  );
  assert.equal(
    findScreenshotSurfaceTabForRender(
      [compareTab],
      createPrepare({ tabId: compareTab.targetTabId }),
    ),
    compareTab,
  );
  assert.equal(
    findScreenshotSurfaceTabForRender(
      [compareTab],
      createPrepare({ tabId: "plugin-compare:fixture:compare:task-2:target:other" }),
    ),
    undefined,
  );
});
