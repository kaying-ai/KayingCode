import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isTaskUnreadBadgeEnabled,
  persistTaskUnreadBadgeEnabled,
} from "@/lib/taskNotificationPreferences.js";
import { resolveTaskUnreadBadgeCount } from "@/lib/taskUnreadBadge.js";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("未读角标偏好", () => {
  it("没有存储值时默认关闭", () => {
    expect(isTaskUnreadBadgeEnabled()).toBe(false);
  });

  it("持久化后按用户选择读取", () => {
    persistTaskUnreadBadgeEnabled(true);
    expect(isTaskUnreadBadgeEnabled()).toBe(true);

    persistTaskUnreadBadgeEnabled(false);
    expect(isTaskUnreadBadgeEnabled()).toBe(false);
  });

  it("localStorage 不可用时回退为关闭", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      },
    });

    expect(isTaskUnreadBadgeEnabled()).toBe(false);
  });
});

describe("未读角标上报门控", () => {
  it("通知与角标都开启时才上报真实未读数", () => {
    expect(
      resolveTaskUnreadBadgeCount({
        notificationEnabled: true,
        badgeEnabled: true,
        unreadTaskCount: 14,
      }),
    ).toBe(14);
  });

  it("任一开关关闭都上报 0，不影响侧栏未读事实", () => {
    expect(
      resolveTaskUnreadBadgeCount({
        notificationEnabled: false,
        badgeEnabled: true,
        unreadTaskCount: 14,
      }),
    ).toBe(0);
    expect(
      resolveTaskUnreadBadgeCount({
        notificationEnabled: true,
        badgeEnabled: false,
        unreadTaskCount: 14,
      }),
    ).toBe(0);
  });

  it("非法计数归零，不把 NaN/负数写进平台角标", () => {
    expect(
      resolveTaskUnreadBadgeCount({
        notificationEnabled: true,
        badgeEnabled: true,
        unreadTaskCount: Number.NaN,
      }),
    ).toBe(0);
    expect(
      resolveTaskUnreadBadgeCount({
        notificationEnabled: true,
        badgeEnabled: true,
        unreadTaskCount: -3,
      }),
    ).toBe(0);
  });
});
