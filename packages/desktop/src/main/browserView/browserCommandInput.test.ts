import assert from "node:assert/strict";
import { test } from "vitest";
import { transformCdpInputCoordinates } from "./browserCommandInput.js";
import { resolveBrowserInputTarget } from "./browserInputTarget.js";
import { dispatchClickAt, dispatchTouchTapAt } from "./browserPointerInput.js";
import type { ControlledView } from "./browserCommandTypes.js";

function controlledView(commands: Array<{ method: string; params: unknown }>): ControlledView {
  return {
    webContents: {
      loadURL: async () => undefined,
      getURL: () => "https://maker.taptap.cn/project/demo?tab=preview",
      getTitle: () => "preview",
      canGoBack: () => false,
      canGoForward: () => false,
      goBack: () => undefined,
      goForward: () => undefined,
      reload: () => undefined,
      executeJavaScript: async () => undefined,
    },
    cdp: {
      send: async (method, params) => {
        commands.push({ method, params });
        return undefined;
      },
    },
  };
}

test("touch tap dispatches one touchStart and one touchEnd to the guest", async () => {
  const commands: Array<{ method: string; params: unknown }> = [];
  await dispatchTouchTapAt(controlledView(commands), { cx: 120, cy: 240 }, 0);
  assert.deepEqual(commands, [
    {
      method: "Input.dispatchTouchEvent",
      params: { type: "touchStart", touchPoints: [{ x: 120, y: 240, id: 0 }] },
    },
    { method: "Input.dispatchTouchEvent", params: { type: "touchEnd", touchPoints: [] } },
  ]);
});

test("screenshot mouse click dispatches one mouse sequence at the mapped CSS point", async () => {
  const commands: Array<{ method: string; params: unknown }> = [];
  await dispatchClickAt(controlledView(commands), { cx: 149, cy: 520 }, "left", false);
  assert.deepEqual(commands, [
    {
      method: "Input.dispatchMouseEvent",
      params: { type: "mouseMoved", x: 149, y: 520 },
    },
    {
      method: "Input.dispatchMouseEvent",
      params: {
        type: "mousePressed",
        x: 149,
        y: 520,
        button: "left",
        clickCount: 1,
      },
    },
    {
      method: "Input.dispatchMouseEvent",
      params: {
        type: "mouseReleased",
        x: 149,
        y: 520,
        button: "left",
        clickCount: 1,
      },
    },
  ]);
});

test("generic CDP input applies native raster scale once", () => {
  assert.deepEqual(
    transformCdpInputCoordinates(
      "Input.dispatchTouchEvent",
      { type: "touchStart", touchPoints: [{ x: 149, y: 520, id: 0 }] },
      1.5,
      "native-raster",
    ),
    { type: "touchStart", touchPoints: [{ x: 223.5, y: 780, id: 0 }] },
  );
});

test("screenshot-bound CDP input preserves mapped CSS coordinates", () => {
  assert.deepEqual(
    transformCdpInputCoordinates(
      "Input.dispatchTouchEvent",
      { type: "touchStart", touchPoints: [{ x: 149, y: 520, id: 0 }] },
      1.5,
      "viewport-css",
    ),
    { type: "touchStart", touchPoints: [{ x: 149, y: 520, id: 0 }] },
  );
  assert.deepEqual(
    transformCdpInputCoordinates(
      "Input.dispatchMouseEvent",
      { type: "mousePressed", x: 149, y: 520, button: "left" },
      1.5,
      "viewport-css",
    ),
    { type: "mousePressed", x: 149, y: 520, button: "left" },
  );
});

test("screenshot input confirms an OOPIF and dispatches through the root compositor", async () => {
  const dispatched: Array<{ method: string; params: unknown; sessionId?: string }> = [];
  const view = controlledView([]);
  view.resolveFrameSession = async (frameId) => {
    assert.equal(frameId, "game-frame");
    return "game-session";
  };
  view.cdp.send = async (method, params, sessionId) => {
    if (method === "Runtime.evaluate" && sessionId == null) {
      return { result: { objectId: "iframe-object" } };
    }
    if (method === "DOM.describeNode" && sessionId == null) {
      return { node: { nodeName: "IFRAME", frameId: "game-frame" } };
    }
    if (method === "Runtime.callFunctionOn" && sessionId == null) {
      return { result: { value: { x: 100, y: 200, clientLeft: 2, clientTop: 3 } } };
    }
    if (method === "Runtime.evaluate" && sessionId === "game-session") {
      return { result: { objectId: "button-object" } };
    }
    if (method === "DOM.describeNode" && sessionId === "game-session") {
      return { node: { nodeName: "BUTTON" } };
    }
    if (method.startsWith("Input.")) dispatched.push({ method, params, sessionId });
    return undefined;
  };

  const target = await resolveBrowserInputTarget(view, { cx: 150, cy: 300 });
  assert.deepEqual(target, {
    point: { cx: 150, cy: 300 },
    targetType: "oopif",
    frameDepth: 1,
  });
  await dispatchClickAt(view, target.point, "left", false);
  assert.equal(dispatched.length, 3);
  assert.ok(dispatched.every((command) => command.sessionId == null));
  assert.deepEqual(dispatched[1]?.params, {
    type: "mousePressed",
    x: 150,
    y: 300,
    button: "left",
    clickCount: 1,
  });
});
