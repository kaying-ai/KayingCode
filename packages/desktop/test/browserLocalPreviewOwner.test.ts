import type { Session, WebContents } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BROWSER_LOCAL_PREVIEW_SCHEME } from "@zcode/shared";

const mocks = vi.hoisted(() => ({
  fromId: vi.fn(),
  fromWebContents: vi.fn(),
  handle: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  ipcMain: { handle: mocks.handle },
  net: {},
  webContents: { fromId: mocks.fromId },
}));

import { installBrowserLocalPreview } from "../src/main/browser-local-preview/index.js";

function createSession(): Session {
  return { protocol: { handle: vi.fn() } } as unknown as Session;
}

function createSender(): WebContents {
  const sender = { mainFrame: null } as unknown as WebContents;
  (sender as unknown as { mainFrame: WebContents }).mainFrame = sender;
  return sender;
}

function createGuest(sender: WebContents, session: Session) {
  return {
    hostWebContents: sender,
    isDestroyed: () => false,
    loadURL: vi.fn().mockResolvedValue(undefined),
    session,
  };
}

function captureHandler(sessions: readonly Session[]) {
  installBrowserLocalPreview(sessions);
  const registration = mocks.handle.mock.calls.at(-1);
  expect(registration?.[0]).toBe("kayingcode:browser-view-load-url");
  return registration![1] as (
    event: { sender: WebContents; senderFrame: WebContents },
    payload: unknown,
  ) => Promise<void>;
}

describe("BrowserViewLoadUrl owner validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows the TapTap preview partition used by UnifiedBrowserView", async () => {
    const embedded = createSession();
    const taptap = createSession();
    const handler = captureHandler([embedded, taptap]);
    const sender = createSender();
    const guest = createGuest(sender, taptap);
    mocks.fromWebContents.mockReturnValue({ webContents: sender });
    mocks.fromId.mockReturnValue(guest);

    await handler(
      { sender, senderFrame: sender },
      { webContentsId: 7, url: "https://maker.taptap.cn/app/d3" },
    );

    expect(guest.loadURL).toHaveBeenCalledWith("https://maker.taptap.cn/app/d3");
    // 两个受控 partition 都必须安装本地预览协议，且原始 file 被封锁。
    for (const current of [embedded, taptap]) {
      expect(current.protocol.handle).toHaveBeenCalledWith("file", expect.any(Function));
      expect(current.protocol.handle).toHaveBeenCalledWith(
        BROWSER_LOCAL_PREVIEW_SCHEME,
        expect.any(Function),
      );
    }
  });

  it("still rejects guests from an unregistered session", async () => {
    const sender = createSender();
    const handler = captureHandler([createSession()]);
    mocks.fromWebContents.mockReturnValue({ webContents: sender });
    mocks.fromId.mockReturnValue(createGuest(sender, createSession()));

    await expect(
      handler({ sender, senderFrame: sender }, { webContentsId: 8, url: "https://example.com" }),
    ).rejects.toThrow("Browser navigation owner mismatch");
  });

  it("rejects guests hosted by another window", async () => {
    const session = createSession();
    const handler = captureHandler([session]);
    const sender = createSender();
    const guest = createGuest(createSender(), session);
    mocks.fromWebContents.mockReturnValue({ webContents: sender });
    mocks.fromId.mockReturnValue(guest);

    await expect(
      handler({ sender, senderFrame: sender }, { webContentsId: 9, url: "https://example.com" }),
    ).rejects.toThrow("Browser navigation owner mismatch");
  });
});
