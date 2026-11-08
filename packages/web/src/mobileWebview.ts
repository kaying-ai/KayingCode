/** 外壳只接收项目元数据，网页与 Host 继续拥有所有业务状态。 */
export function notifyMobileProject(bridge: {
  workspacePath: string;
  workspaceIdentity?: string;
  deviceSid?: string;
}): void {
  const params = new URLSearchParams(location.search);
  if (params.get("kayingShell") !== "1") return;
  const message = {
    type: "kayingcode.project-opened.v1",
    workspacePath: bridge.workspacePath,
    ...(bridge.deviceSid ? { deviceSid: bridge.deviceSid } : {}),
    ...(bridge.workspaceIdentity ? { workspaceIdentity: bridge.workspaceIdentity } : {}),
  };
  const host = window as unknown as {
    KayingProjects?: { postMessage(value: string): void };
    chrome?: { webview?: { postMessage(value: unknown): void } };
    wx?: { miniProgram?: { postMessage(value: { data: unknown }): void } };
  };
  host.KayingProjects?.postMessage(JSON.stringify(message));
  host.chrome?.webview?.postMessage(message);
  if (params.get("kayingPlatform") === "weapp" && !host.wx?.miniProgram) {
    let sdk = document.querySelector<HTMLScriptElement>("script[data-kaying-wechat]");
    if (!sdk) {
      sdk = document.createElement("script");
      sdk.dataset.kayingWechat = "1";
      sdk.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
      document.head.appendChild(sdk);
    }
    sdk.addEventListener("load", () => host.wx?.miniProgram?.postMessage({ data: message }), {
      once: true,
    });
  } else host.wx?.miniProgram?.postMessage({ data: message });
  const parentOrigin = params.get("kayingParentOrigin");
  if (parentOrigin && window.parent !== window) {
    try {
      window.parent.postMessage(message, new URL(parentOrigin).origin);
    } catch {
      /* 非浏览器外壳无 parent。 */
    }
  }
}
export function readMobileShellProjectKey(search: string): string | undefined {
  const params = new URLSearchParams(search);
  if (params.get("kayingShell") !== "1") return;
  return params.get("kayingWorkspace")?.trim() || undefined;
}

export function isFlutterMobileShell(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.get("kayingShell") === "1" && params.get("kayingPlatform") === "flutter";
}
