import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveOpenTabLauncherItemIds } from "../src/app-shell/animatedSidePanePanelModel.js";
import { resolvePluginBrowserCompareViewportPreference } from "../src/plugin-browser-compare/pluginBrowserCompareViewport.js";
import { resolvePluginBrowserCompareTargetPublication } from "../src/plugin-browser-compare/pluginBrowserCompareTargetPublication.js";
import {
  getActiveSidePaneTab,
  isSidePaneTabVisibleForParent,
  openTapTapPreviewSidePane,
  openPluginBrowserCompareSidePane,
  getPluginBrowserCompareTabGroup,
  getPluginBrowserCompareNavigationRequestId,
  getSidePaneGuestTabIds,
  PLUGIN_BROWSER_COMPARE_LAYOUT_PANEL_IDS,
  shouldMountSidePaneContent,
} from "../src/lib/workspaceSidePane.js";

const compareContribution = {
  contractVersion: 1 as const,
  id: "transcription-compare",
  kind: "browser-compare" as const,
  title: "转写对比",
  publicationFile: ".maker/threejs-to-taptapmaker/compare-publication.v1.json",
  views: [
    { id: "source" as const, label: "原版 Web", profile: "standard-web" as const },
    { id: "target" as const, label: "TapTap 预览", profile: "taptap-preview" as const },
  ] as const,
};

test("TapTap preview side pane is idempotent per workspace owner", () => {
  const first = openTapTapPreviewSidePane(null, {
    ownerTaskId: "task-1",
    workspaceKey: "identity-a",
    workspacePath: "/workspace/a",
    title: "TapTap Maker",
  });
  const second = openTapTapPreviewSidePane(first, {
    ownerTaskId: "task-1",
    workspaceKey: "identity-a",
    workspacePath: "/workspace/a",
    title: "TapTap Maker Preview",
  });

  assert.equal(second.tabs.length, 1);
  assert.equal(second.tabs[0]?.tabId, first.tabs[0]?.tabId);
  assert.equal(getActiveSidePaneTab(second)?.type, "taptap-preview");
  assert.equal(getActiveSidePaneTab(second)?.title, "TapTap Maker Preview");
  assert.equal(shouldMountSidePaneContent(false, second.tabs), true);
  assert.equal(isSidePaneTabVisibleForParent(second.tabs[0]!, "task-1"), true);
  assert.equal(isSidePaneTabVisibleForParent(second.tabs[0]!, "task-2"), false);

  const reopened = openTapTapPreviewSidePane(null, {
    ownerTaskId: "task-1",
    workspaceKey: "identity-a",
    workspacePath: "/workspace/a",
    title: "TapTap Maker Preview",
  });
  assert.notEqual(reopened.tabs[0]?.tabId, first.tabs[0]?.tabId);
  assert.match(reopened.tabs[0]?.tabId ?? "", /^taptap-preview:task-1:/u);
});

test("TapTap preview launcher follows embedded browser availability", () => {
  assert.equal(
    resolveOpenTabLauncherItemIds({
      developerToolsEnabled: false,
      hasReviewTab: false,
      supportsEmbeddedBrowser: true,
    }).includes("taptap-preview"),
    true,
  );
  assert.equal(
    resolveOpenTabLauncherItemIds({
      developerToolsEnabled: false,
      hasReviewTab: false,
      supportsEmbeddedBrowser: false,
    }).includes("taptap-preview"),
    false,
  );
  assert.equal(
    resolveOpenTabLauncherItemIds({
      developerToolsEnabled: false,
      hasReviewTab: false,
      supportsEmbeddedBrowser: true,
      tapTapPreviewEnabled: false,
    }).includes("taptap-preview"),
    false,
  );
});

test("a background publication preserves the current task's active tab", () => {
  const first = openTapTapPreviewSidePane(null, {
    ownerTaskId: "task-current",
    workspaceKey: "identity-a",
    workspacePath: "/workspace/a",
    title: "",
  });
  const next = openTapTapPreviewSidePane(first, {
    ownerTaskId: "task-background",
    workspaceKey: "identity-a",
    workspacePath: "/workspace/a",
    title: "",
    activate: false,
  });
  assert.equal(next.activeTabId, first.activeTabId);
  assert.equal(next.tabs.length, 2);
  assert.equal(isSidePaneTabVisibleForParent(next.tabs[1]!, "task-current"), false);
});

test("plugin browser compare keeps a stable shell and two replaceable guest identities", () => {
  const options = {
    ownerTaskId: "task-1",
    workspaceKey: "identity-a",
    workspacePath: "/workspace/a",
    pluginId: "fixture@fixture-marketplace",
    contribution: compareContribution,
  };
  const first = openPluginBrowserCompareSidePane(null, options);
  const second = openPluginBrowserCompareSidePane(first, options);
  const firstTab = first.tabs[0];
  const secondTab = second.tabs[0];
  assert.equal(firstTab?.type, "plugin-browser-compare");
  assert.equal(secondTab?.type, "plugin-browser-compare");
  if (firstTab?.type !== "plugin-browser-compare" || secondTab?.type !== "plugin-browser-compare") {
    assert.fail("expected plugin compare tabs");
  }
  assert.equal(second.tabs.length, 1);
  assert.deepEqual(getSidePaneGuestTabIds(secondTab), [firstTab.sourceTabId, firstTab.targetTabId]);
  assert.equal(
    getPluginBrowserCompareTabGroup(secondTab),
    "plugin-compare:fixture@fixture-marketplace:transcription-compare:task-1",
  );
  assert.equal(shouldMountSidePaneContent(false, second.tabs), true);

  const reopened = openPluginBrowserCompareSidePane(null, options);
  const reopenedTab = reopened.tabs[0];
  assert.equal(reopenedTab?.type, "plugin-browser-compare");
  if (reopenedTab?.type !== "plugin-browser-compare") assert.fail("expected compare tab");
  assert.notEqual(reopenedTab.sourceTabId, firstTab.sourceTabId);
  assert.notEqual(reopenedTab.targetTabId, firstTab.targetTabId);
  assert.deepEqual(PLUGIN_BROWSER_COMPARE_LAYOUT_PANEL_IDS, ["source", "target"]);
  assert.equal(
    PLUGIN_BROWSER_COMPARE_LAYOUT_PANEL_IDS.some((panelId) => panelId === firstTab.sourceTabId),
    false,
  );
});

test("target publication revisions do not reload an unchanged source", () => {
  const publication = {
    schemaVersion: 1 as const,
    pluginId: "fixture@fixture-marketplace",
    contributionId: "transcription-compare",
    operationId: "compare-1",
    workspaceKey: "identity-a",
    sessionId: "task-1",
    projectRoot: "/workspace/a/dest",
    sourceUrl: "https://example.com/game",
    targetUrl: "https://maker.taptap.cn/app/demo?localDev=1&tab=preview",
    viewport: { width: 1280, height: 720 },
    targetPublication: { operationId: "publish-1", revision: 1 },
    publishedAt: "2026-09-28T00:00:00.000Z",
    revision: 1,
  };
  const nextPublication = {
    ...publication,
    operationId: "compare-2",
    targetPublication: { operationId: "publish-2", revision: 2 },
    revision: 2,
  };
  assert.equal(
    getPluginBrowserCompareNavigationRequestId({
      publication,
      refreshNonce: 0,
      role: "source",
    }),
    getPluginBrowserCompareNavigationRequestId({
      publication: nextPublication,
      refreshNonce: 0,
      role: "source",
    }),
  );
  assert.notEqual(
    getPluginBrowserCompareNavigationRequestId({
      publication,
      refreshNonce: 0,
      role: "target",
    }),
    getPluginBrowserCompareNavigationRequestId({
      publication: nextPublication,
      refreshNonce: 0,
      role: "target",
    }),
  );
});

test("plugin browser compare follows a newer publication for the same workspace project", () => {
  const publication = {
    schemaVersion: 1 as const,
    pluginId: "fixture@fixture-marketplace",
    contributionId: "transcription-compare",
    operationId: "compare-1",
    workspaceKey: "identity-a",
    sessionId: "task-1",
    projectRoot: "/workspace/a/dest",
    sourceUrl: "https://example.com/game",
    targetUrl: "https://maker.taptap.cn/app/demo?localDev=1&tab=preview",
    viewport: { width: 1280, height: 720 },
    targetPublication: { operationId: "publish-1", revision: 1 },
    publishedAt: "2026-09-28T00:00:00.000Z",
    revision: 1,
  };
  const latestPublication = {
    schemaVersion: 1 as const,
    previewMode: "transcription-compare" as const,
    operationId: "publish-2",
    workspaceKey: "identity-a",
    projectRoot: "/workspace/a/dest",
    previewUrl: "https://maker.taptap.cn/app/demo?localDev=1",
    publishedAt: "2026-09-30T00:00:00.000Z",
    revision: 2,
  };

  const resolved = resolvePluginBrowserCompareTargetPublication(publication, latestPublication);

  assert.equal(resolved.targetUrl, "https://maker.taptap.cn/app/demo?localDev=1&tab=preview");
  assert.deepEqual(resolved.targetPublication, { operationId: "publish-2", revision: 2 });
  assert.equal(
    getPluginBrowserCompareNavigationRequestId({
      publication: resolved,
      refreshNonce: 0,
      role: "source",
    }),
    getPluginBrowserCompareNavigationRequestId({
      publication,
      refreshNonce: 0,
      role: "source",
    }),
  );
  assert.notEqual(
    getPluginBrowserCompareNavigationRequestId({
      publication: resolved,
      refreshNonce: 0,
      role: "target",
    }),
    getPluginBrowserCompareNavigationRequestId({
      publication,
      refreshNonce: 0,
      role: "target",
    }),
  );
});

test("plugin browser compare rejects unrelated or stale publication receipts", () => {
  const publication = {
    schemaVersion: 1 as const,
    pluginId: "fixture@fixture-marketplace",
    contributionId: "transcription-compare",
    operationId: "compare-1",
    workspaceKey: "identity-a",
    sessionId: "task-1",
    projectRoot: "/workspace/a/dest",
    sourceUrl: "https://example.com/game",
    targetUrl: "https://maker.taptap.cn/app/demo?localDev=1&tab=preview",
    viewport: { width: 1280, height: 720 },
    targetPublication: { operationId: "publish-2", revision: 2 },
    publishedAt: "2026-09-30T00:00:00.000Z",
    revision: 2,
  };
  const unrelatedPublication = {
    schemaVersion: 1 as const,
    operationId: "publish-3",
    workspaceKey: "identity-b",
    projectRoot: "/workspace/a/other",
    previewUrl: "https://maker.taptap.cn/app/other?localDev=1",
    publishedAt: "2026-09-30T01:00:00.000Z",
    revision: 3,
  };
  const stalePublication = {
    ...unrelatedPublication,
    operationId: "publish-1",
    workspaceKey: "identity-a",
    projectRoot: "/workspace/a/dest",
    revision: 1,
  };

  assert.equal(resolvePluginBrowserCompareTargetPublication(publication, null), publication);
  assert.equal(
    resolvePluginBrowserCompareTargetPublication(publication, unrelatedPublication),
    publication,
  );
  assert.equal(
    resolvePluginBrowserCompareTargetPublication(publication, stalePublication),
    publication,
  );
});

test("plugin browser compare fills each visible pane and reserves fixed viewport for capture", () => {
  const publicationViewport = { width: 1280, height: 720 };
  assert.deepEqual(
    resolvePluginBrowserCompareViewportPreference({
      captureMode: false,
      publicationViewport,
      screenshotViewport: null,
    }),
    {
      mode: "normal",
      viewport: publicationViewport,
      zoom: "fit",
    },
  );
  assert.deepEqual(
    resolvePluginBrowserCompareViewportPreference({
      captureMode: true,
      publicationViewport,
      screenshotViewport: { width: 960, height: 540 },
    }),
    {
      mode: "responsive",
      viewport: { width: 960, height: 540 },
      zoom: "fit",
    },
  );
});
