import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mediaStatus: "not-determined" as string,
  askAllowed: true,
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  openExternal: vi.fn(async () => undefined),
  askForMediaAccess: vi.fn(async () => mocks.askAllowed),
  getMediaAccessStatus: vi.fn(() => mocks.mediaStatus),
}));

vi.mock("electron", () => ({
  app: { isPackaged: false },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    },
  },
  shell: { openExternal: mocks.openExternal },
  systemPreferences: {
    getMediaAccessStatus: mocks.getMediaAccessStatus,
    askForMediaAccess: mocks.askForMediaAccess,
  },
}));

const { PlatformChannels } = await import("@zcode/shared");
const { ensureMicrophoneAccess, registerDesktopMicrophoneIpcHandlers } =
  await import("../src/main/microphone-access/index.js");

describe("ensureMicrophoneAccess", () => {
  beforeEach(() => {
    mocks.mediaStatus = "not-determined";
    mocks.askAllowed = true;
    mocks.getMediaAccessStatus.mockClear();
    mocks.askForMediaAccess.mockClear();
  });

  it("returns granted without prompting when the system already allows the microphone", async () => {
    mocks.mediaStatus = "granted";
    await expect(ensureMicrophoneAccess("darwin")).resolves.toBe("granted");
    expect(mocks.askForMediaAccess).not.toHaveBeenCalled();
  });

  it("asks once on macOS only when the status is not-determined", async () => {
    mocks.mediaStatus = "not-determined";
    await expect(ensureMicrophoneAccess("darwin")).resolves.toBe("granted");
    expect(mocks.askForMediaAccess).toHaveBeenCalledTimes(1);
  });

  it("maps a rejected macOS prompt to denied", async () => {
    mocks.askAllowed = false;
    await expect(ensureMicrophoneAccess("darwin")).resolves.toBe("denied");
  });

  it("never re-prompts once the system reports denied", async () => {
    mocks.mediaStatus = "denied";
    await expect(ensureMicrophoneAccess("darwin")).resolves.toBe("denied");
    expect(mocks.askForMediaAccess).not.toHaveBeenCalled();
  });

  it("treats Windows denied as denied and unknown as unsupported", async () => {
    mocks.mediaStatus = "denied";
    await expect(ensureMicrophoneAccess("win32")).resolves.toBe("denied");
    mocks.mediaStatus = "unknown";
    await expect(ensureMicrophoneAccess("win32")).resolves.toBe("unsupported");
  });

  it("returns unsupported on Linux without touching systemPreferences", async () => {
    await expect(ensureMicrophoneAccess("linux")).resolves.toBe("unsupported");
    expect(mocks.getMediaAccessStatus).not.toHaveBeenCalled();
  });
});

describe("microphone IPC handlers", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.openExternal.mockClear();
    mocks.mediaStatus = "granted";
  });

  it("serializes concurrent reset requests into one main-process operation", async () => {
    registerDesktopMicrophoneIpcHandlers({ info: () => {}, warn: () => {} });
    const reset = mocks.handlers.get(PlatformChannels.ResetMicrophoneAccess);
    expect(reset).toBeDefined();
    const first = reset!({}) as Promise<string>;
    const second = reset!({}) as Promise<string>;
    expect(second).toBe(first);
    // 测试机不是 macOS：重置不可执行，但仍只创建一次 promise。
    await expect(first).resolves.toBe("failed");
    await expect(second).resolves.toBe("failed");
  });

  it("rejects unknown microphone settings targets without opening a URL", async () => {
    registerDesktopMicrophoneIpcHandlers({ info: () => {}, warn: () => {} });
    const openSettings = mocks.handlers.get(PlatformChannels.OpenMicrophoneSettings);
    await expect(openSettings!({}, "camera")).resolves.toBe(false);
    await expect(openSettings!({}, "https://example.com")).resolves.toBe(false);
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it("answers ensureAccess from the same decision function", async () => {
    registerDesktopMicrophoneIpcHandlers({ info: () => {}, warn: () => {} });
    const ensure = mocks.handlers.get(PlatformChannels.MicrophoneAccess);
    const expected =
      process.platform === "darwin" || process.platform === "win32" ? "granted" : "unsupported";
    await expect(ensure!({})).resolves.toBe(expected);
  });
});
