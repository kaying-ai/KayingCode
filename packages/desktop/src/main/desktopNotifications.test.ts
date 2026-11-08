import { beforeEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
const mocks = vi.hoisted(() => ({
  focused: false,
  notify: vi.fn(),
  send: vi.fn(),
  senderSend: vi.fn(),
  focus: vi.fn(),
}));
vi.mock("electron", () => ({
  app: { dock: { show: vi.fn() }, show: vi.fn(), focus: vi.fn() },
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, isFocused: () => mocks.focused }],
    fromWebContents: () => ({
      isMinimized: () => false,
      isVisible: () => true,
      isDestroyed: () => false,
      focus: mocks.focus,
      webContents: { send: mocks.send },
    }),
  },
  Notification: class extends EventEmitter {
    static isSupported() {
      return true;
    }
    constructor(options: unknown) {
      super();
      mocks.notify(options, this);
    }
    show() {}
  },
}));
import {
  dispatchTaskNotification,
  resetActiveTaskNotificationsForTest,
  getActiveTaskNotificationCountForTest,
} from "./desktopNotifications.js";
import type { IpcMainEvent } from "electron";
import { PlatformChannels } from "@zcode/shared";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.focused = false;
  resetActiveTaskNotificationsForTest();
});
const options = () => ({
  iconPath: "/brand/icon.png",
  event: { sender: { send: mocks.senderSend } } as unknown as IpcMainEvent,
  payload: { taskId: "qa", status: "completed", title: "Task completed", body: "QA brand check" },
  logger: { info: vi.fn(), warn: vi.fn() },
});
it("uses the Main application icon and retains task notification click routing", () => {
  expect(dispatchTaskNotification(options())).toBe(true);
  expect(mocks.notify.mock.calls[0]?.[0]).toMatchObject({
    title: "Task completed",
    silent: true,
  });
  expect(getActiveTaskNotificationCountForTest()).toBe(1);
  mocks.notify.mock.calls[0]?.[1].emit("click");
  expect(mocks.send).toHaveBeenCalledWith(PlatformChannels.TaskNotificationClick, "qa");
  expect(mocks.focus).toHaveBeenCalledOnce();
  expect(getActiveTaskNotificationCountForTest()).toBe(0);
});
it.each(["darwin", "win32", "linux"])(
  "uses the correct notification icon surface on %s",
  (platform) => {
    const descriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
    try {
      Object.defineProperty(process, "platform", { value: platform });
      dispatchTaskNotification(options());
      expect(mocks.notify.mock.calls[0]?.[0].icon).toBe(
        platform === "darwin" ? undefined : "/brand/icon.png",
      );
    } finally {
      Object.defineProperty(process, "platform", descriptor);
    }
  },
);
it("keeps foreground suppression and dedupe before constructing a notification", () => {
  mocks.focused = true;
  expect(dispatchTaskNotification(options())).toBe(false);
  expect(mocks.notify).not.toHaveBeenCalled();
  mocks.focused = false;
  expect(dispatchTaskNotification(options())).toBe(true);
  expect(dispatchTaskNotification(options())).toBe(false);
  expect(mocks.notify).toHaveBeenCalledOnce();
});
