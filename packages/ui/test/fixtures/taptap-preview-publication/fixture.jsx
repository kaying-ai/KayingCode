import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { useTapTapPreviewAutoOpen } from "../../../src/hooks/useTapTapPreviewAutoOpen.ts";
import { usePluginBrowserCompareAutoOpen } from "../../../src/hooks/usePluginBrowserCompareAutoOpen.ts";
import {
  openPluginBrowserCompareSidePane,
  openTapTapPreviewSidePane,
} from "../../../src/lib/workspaceSidePane.ts";
import { TapTapPreviewSidePaneContent } from "../../../src/taptap-maker/TapTapPreviewSidePaneContent.tsx";
import { Tabs } from "../../../src/components/ui/tabs.tsx";

const listeners = new Map();
const files = new Map();
const watches = new Map();
const previewFile = ".maker/kaying-for-taptap/preview-publication.v1.json";
const compareEntries = [
  {
    pluginId: "kaying-for-taptap@builtin",
    contribution: {
      contractVersion: 1,
      id: "transcription-compare",
      kind: "browser-compare",
      title: "转写对比",
      publicationFile: ".maker/threejs-to-taptapmaker/compare-publication.v1.json",
      views: [
        { id: "source", label: "原版 Web", profile: "standard-web" },
        { id: "target", label: "TapTap 预览", profile: "taptap-preview" },
      ],
    },
  },
];
let nextWatch = 0;
window.previewTest = {
  opened: [],
  comparisons: [],
  reads: 0,
  watched: [],
  deferred: null,
  get subscriptions() {
    return listeners.size;
  },
  write(receipt, path = "/workspace", file = previewFile) {
    files.set(`${path}/${file}`, receipt);
    for (const [id, listener] of listeners) {
      const watch = watches.get(id);
      if (watch.path === path && watch.recursive) listener();
    }
  },
  writeComparison(receipt, path) {
    this.write(receipt, path, compareEntries[0].contribution.publicationFile);
  },
  services: {
    fileService: {
      async readTextFile({ path }) {
        window.previewTest.reads++;
        const receipt = files.get(path);
        if (window.previewTest.defer) {
          window.previewTest.defer = false;
          await new Promise((resolve) => {
            window.previewTest.deferred = resolve;
          });
        }
        if (!receipt) throw new Error("ENOENT");
        return { content: JSON.stringify(receipt) };
      },
    },
    fileWatcherService: {
      async watch(options) {
        window.previewTest.watched.push(options);
        const id = String(++nextWatch);
        watches.set(id, options);
        const pending = window.previewTest.comparisonBeforeSubscribe;
        if (pending?.path === options.path) {
          delete window.previewTest.comparisonBeforeSubscribe;
          window.previewTest.writeComparison(pending.receipt, pending.path);
        }
        return { id };
      },
      onDynamicChange: (id) => (listener) => {
        listeners.set(id, listener);
        return { dispose: () => listeners.delete(id) };
      },
      async unwatch({ id }) {
        listeners.delete(id);
        watches.delete(id);
      },
    },
  },
};

function Fixture({
  workspacePath = "/workspace",
  workspaceKey = "identity-a",
  task = "task-a",
  enabled = true,
  compare = false,
  showPane = false,
  capture = null,
}) {
  const [state, setState] = useState(null);
  useTapTapPreviewAutoOpen({
    enabled,
    workspacePath,
    workspaceKey,
    onPublication(publication) {
      window.previewTest.opened.push(publication);
      setState((current) =>
        openTapTapPreviewSidePane(current, {
          ownerTaskId: publication.sessionId,
          workspacePath,
          workspaceKey,
          title: "",
          activate: publication.sessionId === task,
        }),
      );
    },
  });
  usePluginBrowserCompareAutoOpen({
    enabled: compare,
    contributions: compareEntries,
    workspacePath,
    workspaceKey,
    onPublication(entry, publication) {
      window.previewTest.comparisons.push(publication);
      setState((current) =>
        openPluginBrowserCompareSidePane(current, {
          ...entry,
          ownerTaskId: publication.sessionId,
          workspacePath,
          workspaceKey,
          activate: publication.sessionId === task,
        }),
      );
    },
  });
  window.previewTest.state = state;
  return (
    <main>
      <button onClick={() => setState(null)}>关闭预览</button>
      <output>{JSON.stringify(state)}</output>
      {showPane && (
        <div data-testid="preview-panel">
          <Tabs defaultValue="preview-test">
            <TapTapPreviewSidePaneContent
              isPanelVisible
              isSelected
              screenshotSurfaceRequest={capture}
              tab={{
                id: "preview-test",
                tabId: "taptap-preview:task-a:test",
                type: "taptap-preview",
                workspacePath,
                workspaceKey,
                sessionId: task,
                ownerTaskId: task,
                title: "",
                openedAt: 0,
              }}
            />
          </Tabs>
        </div>
      )}
    </main>
  );
}
const root = createRoot(document.getElementById("root"));
window.previewTest.render = (props = {}) => root.render(<Fixture {...props} />);
window.previewTest.render();
