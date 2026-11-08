/**
 * user tab 可发现性与 claim 判定的纯逻辑。
 *
 * 修复依据（2026-09-30 letter-stack 转写实测）：
 * 1. `hasDiscoverableUserPage` 用 live URL 过滤 `about:blank`，而 compare/taptap-preview
 *    双 guest 在首帧导航前、capture 换挂或 guest rebind 后会短暂回到空白页，导致
 *    `browser.user.openTabs()` 为空，Agent 无法 claim，截图/点击整条链路失效。
 * 2. `claimTab` 对「同一 scope 已认领」返回失败，而 visual-repair 流程要求可重复
 *    reclaim 续预算，表现为“接上一次，下次又掉”。
 */

/** 产品壳层 guest：转写对比 source/target 与 TapTap 游戏预览。 */
const PRODUCT_SHELL_TAB_ID_PREFIXES = ["plugin-compare:", "taptap-preview:"] as const;
const PRODUCT_SHELL_TAB_GROUP_PREFIX = "plugin-compare:" as const;

export type UserTabClaimDenialCode =
  | "tab_not_found"
  | "tab_closed"
  | "tab_claimed_elsewhere"
  | "tab_scope_mismatch"
  | "tab_not_ready";

export interface UserTabIdentity {
  tabId: string;
  tabGroup?: string | undefined;
  lifecycle: "active" | "deliverable" | "handoff" | "closed";
  origin: "agent" | "user";
  claimable: boolean;
  owner: UserTabOwnerScope;
  /** guest live URL；guest 未挂载时可为空。 */
  liveUrl?: string | undefined;
  /** 最近一次已知 URL（attach 的 initialUrl 或上次 getURL）。 */
  cachedUrl?: string | undefined;
}

export interface UserTabClaimScope {
  windowId: number;
  workspaceKey: string;
  sessionId: string;
  remoteSessionId?: string | undefined;
}

export interface UserTabOwnerScope {
  windowId: number;
  workspaceKey: string;
  sessionId: string;
  remoteSessionId?: string | undefined;
}

export function isProductShellTabId(tabId: string): boolean {
  return PRODUCT_SHELL_TAB_ID_PREFIXES.some((prefix) => tabId.startsWith(prefix));
}

export function isProductShellTab(tab: Pick<UserTabIdentity, "tabId" | "tabGroup">): boolean {
  if (isProductShellTabId(tab.tabId)) return true;
  return (tab.tabGroup ?? "").startsWith(PRODUCT_SHELL_TAB_GROUP_PREFIX);
}

function normalizeUrl(url: string | undefined): string {
  return (url ?? "").trim();
}

function isBlankUrl(url: string): boolean {
  return url.length === 0 || url === "about:blank";
}

/**
 * user.openTabs 是否应列出该 tab。
 *
 * 产品壳层 guest 即使 live URL 仍为 about:blank 也可被认领：它们有 receipt/initialUrl
 * 语义目标，空白只是导航窗口；普通 human tab 仍要求真实页面 URL，避免把 UI 占位态
 * 交给 Agent 当可操作页。
 */
export function isDiscoverableUserPage(tab: UserTabIdentity): boolean {
  if (tab.lifecycle === "closed") return false;
  const live = normalizeUrl(tab.liveUrl);
  if (!isBlankUrl(live)) return true;
  const cached = normalizeUrl(tab.cachedUrl);
  if (!isBlankUrl(cached)) return true;
  return isProductShellTab(tab);
}

export function resolveUserTabDisplayUrl(tab: UserTabIdentity): string {
  const live = normalizeUrl(tab.liveUrl);
  if (!isBlankUrl(live)) return live;
  const cached = normalizeUrl(tab.cachedUrl);
  return isBlankUrl(cached) ? "" : cached;
}

function sameRemoteSession(
  left: string | undefined | null,
  right: string | undefined | null,
): boolean {
  return (left ?? "") === (right ?? "");
}

export interface UserTabClaimDecision {
  ok: boolean;
  code?: UserTabClaimDenialCode;
  /** 已由同一 scope 认领时为 true：claim 幂等成功，可直接续用。 */
  alreadyOwnedByCaller?: boolean;
  message?: string;
}

/**
 * claim 判定。同一 scope 重复 claim 必须成功（幂等），否则 visual-repair 的
 * “reclaim 续预算”会在第二次调用时把已控制 tab 打成 backend_unavailable。
 */
export function evaluateUserTabClaim(
  tab: UserTabIdentity,
  scope: UserTabClaimScope,
  options?: { alreadyOwnedByCaller?: boolean },
): UserTabClaimDecision {
  if (tab.lifecycle === "closed") {
    return {
      ok: false,
      code: "tab_closed",
      message: `browser tab '${tab.tabId}' is closed`,
    };
  }
  if (options?.alreadyOwnedByCaller) {
    return { ok: true, alreadyOwnedByCaller: true };
  }
  if (tab.origin !== "user" || !tab.claimable) {
    return {
      ok: false,
      code: "tab_claimed_elsewhere",
      message: `browser tab '${tab.tabId}' is unavailable or already claimed`,
    };
  }
  if (
    tab.owner.windowId !== scope.windowId ||
    tab.owner.workspaceKey !== scope.workspaceKey ||
    tab.owner.sessionId !== scope.sessionId ||
    !sameRemoteSession(tab.owner.remoteSessionId, scope.remoteSessionId)
  ) {
    return {
      ok: false,
      code: "tab_scope_mismatch",
      message: `browser tab '${tab.tabId}' is not visible in the current context`,
    };
  }
  if (!isDiscoverableUserPage(tab)) {
    return {
      ok: false,
      code: "tab_not_ready",
      message: `browser tab '${tab.tabId}' has no page URL yet (still blank)`,
    };
  }
  return { ok: true };
}

export function isSameClaimScope(left: UserTabOwnerScope, right: UserTabClaimScope): boolean {
  return (
    left.windowId === right.windowId &&
    left.workspaceKey === right.workspaceKey &&
    left.sessionId === right.sessionId &&
    sameRemoteSession(left.remoteSessionId, right.remoteSessionId)
  );
}
