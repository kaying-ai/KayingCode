import type { BrowserMouseButton } from "@zcode/shared";
import type { BrowserPoint, ControlledView } from "./browserCommandTypes.js";

/** 在给定坐标发一次 CDP 真实鼠标点击（mouseMoved→mousePressed→mouseReleased）。 */
export async function dispatchClickAt(
  view: ControlledView,
  center: BrowserPoint,
  button: BrowserMouseButton,
  doubleClick: boolean,
  modifiers = 0,
): Promise<void> {
  const clickCount = doubleClick ? 2 : 1;
  const mod = modifiers > 0 ? { modifiers } : {};
  await view.cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: center.cx,
    y: center.cy,
    ...mod,
  });
  await view.cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: center.cx,
    y: center.cy,
    button,
    clickCount,
    ...mod,
  });
  await view.cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: center.cx,
    y: center.cy,
    button,
    clickCount,
    ...mod,
  });
}

/** 游戏画布触摸点击：只派发一组 touchStart/touchEnd，避免与 mouse click 重复触发。 */
export async function dispatchTouchTapAt(
  view: ControlledView,
  center: BrowserPoint,
  durationMs = 50,
): Promise<void> {
  let started = false;
  try {
    await view.cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: center.cx, y: center.cy, id: 0 }],
    });
    started = true;
    if (durationMs > 0) await new Promise((resolve) => setTimeout(resolve, durationMs));
    await view.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    started = false;
  } catch (error) {
    if (started) {
      try {
        await view.cdp.send("Input.dispatchTouchEvent", {
          type: "touchCancel",
          touchPoints: [],
        });
      } catch {
        // guest 已换代或 CDP 已断开时无法清理；保留原始错误让上层标记本次输入不确定。
      }
    }
    throw error;
  }
}
