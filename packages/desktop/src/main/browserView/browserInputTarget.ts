import type { BrowserPoint, ControlledView } from "./browserCommandTypes.js";

export interface BrowserInputTarget {
  point: BrowserPoint;
  targetType: "root" | "oopif";
  frameDepth: number;
}

interface RuntimeRemoteObjectResponse {
  result?: { objectId?: string; value?: unknown };
}

function sendToSession(
  view: ControlledView,
  method: string,
  params: unknown,
  sessionId?: string,
): Promise<unknown> {
  return sessionId == null
    ? view.cdp.send(method, params)
    : view.cdp.send(method, params, sessionId);
}

/**
 * 确认根 viewport 截图点命中的 frame 链。来源项目证明跨进程 iframe 必须先被持续
 * auto-attach/focus，但 pointer 仍由根 target compositor 使用根 viewport 坐标派发。
 */
export async function resolveBrowserInputTarget(
  view: ControlledView,
  rootPoint: BrowserPoint,
): Promise<BrowserInputTarget> {
  let inspectionPoint = { ...rootPoint };
  let inspectionSessionId: string | undefined;
  let frameDepth = 0;
  for (let depth = 0; depth < 8; depth += 1) {
    const ownerSessionId = inspectionSessionId;
    const hit = (await sendToSession(
      view,
      "Runtime.evaluate",
      {
        expression: `document.elementFromPoint(${JSON.stringify(inspectionPoint.cx)}, ${JSON.stringify(inspectionPoint.cy)})`,
        returnByValue: false,
      },
      ownerSessionId,
    )) as RuntimeRemoteObjectResponse;
    const objectId = hit.result?.objectId;
    if (!objectId) break;
    try {
      const described = (await sendToSession(
        view,
        "DOM.describeNode",
        { objectId },
        ownerSessionId,
      )) as { node?: { frameId?: string; nodeName?: string } };
      const nodeName = described.node?.nodeName?.toUpperCase();
      const frameId = described.node?.frameId;
      if ((nodeName !== "IFRAME" && nodeName !== "FRAME") || !frameId) break;
      const childSessionId = await view.resolveFrameSession?.(frameId);
      // 同进程 iframe 继续让当前 target 的 compositor 命中；只有 OOPIF 才切换 session。
      if (!childSessionId || childSessionId === ownerSessionId) break;
      const geometry = (await sendToSession(
        view,
        "Runtime.callFunctionOn",
        {
          objectId,
          functionDeclaration: `function () {
            const rect = this.getBoundingClientRect();
            return {
              x: rect.x,
              y: rect.y,
              clientLeft: this.clientLeft || 0,
              clientTop: this.clientTop || 0
            };
          }`,
          returnByValue: true,
        },
        ownerSessionId,
      )) as RuntimeRemoteObjectResponse;
      const value = geometry.result?.value as
        | { x?: unknown; y?: unknown; clientLeft?: unknown; clientTop?: unknown }
        | undefined;
      if (
        typeof value?.x !== "number" ||
        typeof value.y !== "number" ||
        typeof value.clientLeft !== "number" ||
        typeof value.clientTop !== "number"
      ) {
        throw new Error(`browser iframe ${frameId} returned no valid input geometry`);
      }
      inspectionPoint = {
        cx: inspectionPoint.cx - value.x - value.clientLeft,
        cy: inspectionPoint.cy - value.y - value.clientTop,
      };
      inspectionSessionId = childSessionId;
      frameDepth += 1;
    } finally {
      await sendToSession(view, "Runtime.releaseObject", { objectId }, ownerSessionId).catch(
        () => undefined,
      );
    }
  }
  return {
    // 来源项目的在线 OOPIF 验收证明 pointer Input 必须由根 target compositor 使用根
    // viewport 坐标派发；子 session 只用于确认命中链和 locator/键盘，不用于 pointer。
    point: { ...rootPoint },
    targetType: inspectionSessionId ? "oopif" : "root",
    frameDepth,
  };
}
