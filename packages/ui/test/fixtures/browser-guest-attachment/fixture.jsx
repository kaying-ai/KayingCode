import React from "react";
import { createRoot } from "react-dom/client";
import { UnifiedBrowserView } from "../../../src/browser-use/UnifiedBrowserView.tsx";

const calls = [];
const pending = [];
window.attachmentTest = {
  calls,
  pending,
  guestId: 0,
  realGuest: new URLSearchParams(location.search).has("native"),
  platform: {
    browserViewDetachGuest(payload) {
      calls.push({ kind: "detach", payload });
      return Promise.resolve(true);
    },
    browserViewAttachGuest(payload) {
      calls.push({ kind: "attach", payload });
      if (window.attachmentTest.realGuest) return Promise.resolve({ ok: true });
      return new Promise((resolve) => pending.push(resolve));
    },
    browserViewUpdateViewport(payload) {
      calls.push({ kind: "viewport", payload });
      return Promise.resolve();
    },
    browserViewReportResidency(payload) {
      calls.push({ kind: "residency", payload });
      return Promise.resolve();
    },
  },
};
let root = createRoot(document.getElementById("root"));
let props = {
  browserKey: "compare",
  workspaceKey: "workspace",
  sessionId: "session",
  isVisible: true,
  showToolbar: false,
  controlledHumanViewportPreference: {
    mode: "responsive",
    viewport: { width: 800, height: 600 },
    zoom: "100",
  },
};
window.attachmentTest.render = (patch = {}) => {
  props = { ...props, ...patch };
  root.render(<UnifiedBrowserView {...props} />);
};
window.attachmentTest.unmount = () => root.unmount();
window.attachmentTest.remount = (patch = {}) => {
  root = createRoot(document.getElementById("root"));
  window.attachmentTest.render(patch);
};
window.attachmentTest.render();
