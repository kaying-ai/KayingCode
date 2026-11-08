import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { useTapTapPreviewAutoOpen } from "../../../src/hooks/useTapTapPreviewAutoOpen.ts";
import {
  openPluginBrowserCompareSidePane,
  openTapTapPreviewSidePane,
} from "../../../src/lib/workspaceSidePane.ts";
import { TapTapPreviewSidePaneContent } from "../../../src/taptap-maker/TapTapPreviewSidePaneContent.tsx";
import { Tabs } from "../../../src/components/ui/tabs.tsx";

const listeners = new Map();
const files = new Map();
let nextWatch = 0;
window.previewTest = {
  opened: [],
  reads: 0,
  watched: [],
  deferred: null,
  get subscriptions() {
    return listeners.size;
  },
  write(receipt, path = "/workspace") {
    files.set(path, receipt);
    for (const listener of listeners.values()) listener();
  },
  services: {
    fileService: {
      async readTextFile({ path }) {
        window.previewTest.reads++;
        const receipt = files.get(path.split("/.maker/")[0]);
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
        return { id: String(++nextWatch) };
      },
      onDynamicChange: (id) => (listener) => {
        listeners.set(id, listener);
        return { dispose: () => listeners.delete(id) };
      },
      async unwatch({ id }) {
        listeners.delete(id);
      },
    },
  },
};

function Fixture({
  workspacePath = "/workspace",
  workspaceKey = "identity-a",
  task = "task-a",
  enabled = true,
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
  window.previewTest.state = state;
  return (
    <main>
      <button
        onClick={() =>
          setState((current) =>
            openPluginBrowserCompareSidePane(current, {
              ownerTaskId: task,
              workspaceKey,
              workspacePath,
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
            }),
          )
        }
      >
        打开转写对比
      </button>
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
