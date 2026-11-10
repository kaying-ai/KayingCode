import { describe, expect, it, vi } from "vitest";
import {
  maxWindowUnreadCounts,
  parseWindowUnreadCount,
  removeWindowUnreadCount,
  resolveBadgeOverlayLabel,
  syncUnreadBadgeForPlatform,
} from "./unreadBadge.js";

describe("parseWindowUnreadCount", () => {
  it("只接受非负整数", () => {
    expect(parseWindowUnreadCount(0)).toBe(0);
    expect(parseWindowUnreadCount(3)).toBe(3);
    expect(parseWindowUnreadCount(-1)).toBeNull();
    expect(parseWindowUnreadCount(1.5)).toBeNull();
    expect(parseWindowUnreadCount("3")).toBeNull();
    expect(parseWindowUnreadCount(null)).toBeNull();
  });
});

describe("多窗口未读聚合", () => {
  it("取最大值而不是求和，避免同一棵权威树被重复计算", () => {
    expect(maxWindowUnreadCounts(new Map())).toBe(0);
    expect(
      maxWindowUnreadCounts(
        new Map([
          [1, 2],
          [2, 7],
          [3, 3],
        ]),
      ),
    ).toBe(7);
  });

  it("窗口关闭后移除该窗口计数，剩余窗口继续参与聚合", () => {
    const windowUnreadCountMap = new Map([
      [1, 2],
      [2, 7],
    ]);

    expect(removeWindowUnreadCount(windowUnreadCountMap, 2)).toBe(2);
    expect(windowUnreadCountMap.has(2)).toBe(false);
    expect(removeWindowUnreadCount(windowUnreadCountMap, 1)).toBe(0);
    expect(windowUnreadCountMap.size).toBe(0);
  });
});

describe("resolveBadgeOverlayLabel", () => {
  it("0 移除角标，大于 9 显示 9+", () => {
    expect(resolveBadgeOverlayLabel(0)).toBeNull();
    expect(resolveBadgeOverlayLabel(-1)).toBeNull();
    expect(resolveBadgeOverlayLabel(1)).toBe("1");
    expect(resolveBadgeOverlayLabel(9)).toBe("9");
    expect(resolveBadgeOverlayLabel(10)).toBe("9+");
  });
});

describe("syncUnreadBadgeForPlatform", () => {
  it("macOS/Linux 使用应用级 badge", () => {
    const setBadgeCount = vi.fn();
    const applyOverlay = vi.fn();

    syncUnreadBadgeForPlatform({
      platform: "darwin",
      totalUnreadCount: 4,
      setBadgeCount,
      applyOverlay,
    });
    expect(setBadgeCount).toHaveBeenCalledWith(4);
    expect(applyOverlay).not.toHaveBeenCalled();

    syncUnreadBadgeForPlatform({
      platform: "linux",
      totalUnreadCount: 0,
      setBadgeCount,
      applyOverlay,
    });
    expect(setBadgeCount).toHaveBeenLastCalledWith(0);
    expect(applyOverlay).not.toHaveBeenCalled();
  });

  it("Windows 使用窗口 overlay 而不是 app badge", () => {
    const setBadgeCount = vi.fn();
    const applyOverlay = vi.fn();

    syncUnreadBadgeForPlatform({
      platform: "win32",
      totalUnreadCount: 12,
      setBadgeCount,
      applyOverlay,
    });
    expect(setBadgeCount).not.toHaveBeenCalled();
    expect(applyOverlay).toHaveBeenCalledWith("9+");

    syncUnreadBadgeForPlatform({
      platform: "win32",
      totalUnreadCount: 0,
      setBadgeCount,
      applyOverlay,
    });
    expect(applyOverlay).toHaveBeenLastCalledWith(null);
  });
});
