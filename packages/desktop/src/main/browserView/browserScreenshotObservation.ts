import type {
  BrowserErrorCode,
  BrowserPoint as BrowserInputPoint,
  BrowserScreenshotObservation,
  BrowserViewportSize,
} from "@zcode/shared";
import type { BrowserPoint } from "./browserCommandTypes.js";

export class BrowserScreenshotInputError extends Error {
  constructor(
    readonly code: Extract<BrowserErrorCode, "input_out_of_bounds" | "observation_stale">,
    message: string,
  ) {
    super(message);
    this.name = "BrowserScreenshotInputError";
  }
}

export interface StoredBrowserScreenshotObservation {
  observation: BrowserScreenshotObservation;
  guestGeneration: number;
  url: string;
  actionSequence: number;
}

interface CurrentBrowserScreenshotTarget {
  observationId: string;
  tabId: string;
  guestGeneration: number;
  url: string;
  actionSequence: number;
  viewportCss: BrowserViewportSize;
}

function sameViewport(left: BrowserViewportSize, right: BrowserViewportSize): boolean {
  return left.width === right.width && left.height === right.height;
}

export function validateBrowserScreenshotObservation(
  stored: StoredBrowserScreenshotObservation | undefined,
  current: CurrentBrowserScreenshotTarget,
): asserts stored is StoredBrowserScreenshotObservation {
  if (
    !stored ||
    stored.observation.observationId !== current.observationId ||
    stored.observation.tabId !== current.tabId ||
    stored.guestGeneration !== current.guestGeneration ||
    stored.url !== current.url ||
    stored.actionSequence !== current.actionSequence ||
    !sameViewport(stored.observation.viewportCss, current.viewportCss)
  ) {
    // 截图后的导航、缩放、guest 换代或其它输入都会让旧坐标失去含义，必须重新截图。
    throw new BrowserScreenshotInputError(
      "observation_stale",
      "Screenshot observation is stale; take a new screenshot before tapping",
    );
  }
}

function inRange(value: number, upperBound: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < upperBound;
}

export function resolveScreenshotTapPoint(
  observation: BrowserScreenshotObservation,
  input: { coordinateSpace: "image" | "normalized"; point: BrowserInputPoint },
): BrowserPoint {
  const { x, y } = input.point;
  let point: BrowserPoint;
  if (input.coordinateSpace === "image") {
    if (!inRange(x, observation.imagePixels.width) || !inRange(y, observation.imagePixels.height)) {
      throw new BrowserScreenshotInputError(
        "input_out_of_bounds",
        "Screenshot image point is outside the captured raster",
      );
    }
    point = {
      cx: observation.clipCss.x + (x / observation.imagePixels.width) * observation.clipCss.width,
      cy: observation.clipCss.y + (y / observation.imagePixels.height) * observation.clipCss.height,
    };
  } else {
    if (!inRange(x, 1) || !inRange(y, 1)) {
      throw new BrowserScreenshotInputError(
        "input_out_of_bounds",
        "Normalized screenshot point must be inside [0, 1)",
      );
    }
    point = {
      cx: x * observation.viewportCss.width,
      cy: y * observation.viewportCss.height,
    };
  }
  if (
    !inRange(point.cx, observation.viewportCss.width) ||
    !inRange(point.cy, observation.viewportCss.height)
  ) {
    throw new BrowserScreenshotInputError(
      "input_out_of_bounds",
      "Mapped screenshot point is outside the current viewport",
    );
  }
  return point;
}
