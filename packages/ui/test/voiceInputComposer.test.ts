// @vitest-environment jsdom
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LexicalChatInputHandle } from "../src/LexicalChatInput.js";
import type { ComposerVoiceInput } from "../src/voice-input/contract.js";
import { useComposerVoiceInput } from "../src/voice-input/ui/useComposerVoiceInput.js";

const mockState = vi.hoisted(() => ({
  platform: null as null | {
    microphone: {
      ensureAccess: () => Promise<"granted" | "denied" | "unsupported">;
      resetAccess: () => Promise<"granted" | "denied" | "unsupported">;
      openSettings: (target: "privacy" | "sound") => Promise<boolean>;
    };
  },
  service: null as null | ReturnType<typeof createVoiceService>,
  loggedIn: true,
  capture: {
    stop: vi.fn(async () => ({ peak: 0.2, durationMs: 900, bytes: 6400 })),
    abort: vi.fn(),
  },
}));

vi.mock("@/hooks/usePlatform.js", () => ({
  useOptionalPlatform: () => mockState.platform,
}));

vi.mock("@/hooks/useWorkspaceServices.js", () => ({
  useBaseWorkspaceServices: () => ({ voiceInputService: mockState.service ?? undefined }),
}));

vi.mock("@/i18n/IntlProvider.js", () => ({
  useKayingCodeIntl: () => ({
    intl: { formatMessage: ({ id }: { id: string }) => id },
    locale: "en-US",
  }),
}));

vi.mock("@/store/StoreProvider.js", () => ({
  useKayingCodeStore: (selector: (state: { user: object | null }) => unknown) =>
    selector({ user: mockState.loggedIn ? { id: "u1" } : null }),
}));

vi.mock("@/components/ui/toast.js", () => ({
  toast: vi.fn(),
}));

vi.mock("@/voice-input/adapters/pcmCapture.js", () => ({
  startPcmCapture: vi.fn(async () => mockState.capture),
}));

vi.mock("@/voice-input/ui/useMicrophonePermissionGuide.js", () => ({
  useMicrophonePermissionGuide: () => ({
    phase: null,
    os: "mac",
    available: true,
    busy: false,
    show: vi.fn(),
    close: vi.fn(),
    openSettings: vi.fn(),
    reauthorize: vi.fn(),
    relaunch: vi.fn(),
  }),
}));

interface VoiceEvent {
  attemptId: string;
  type: "started" | "result" | "completed" | "error";
  text?: string;
  code?: string;
}

function createVoiceService() {
  const listeners = new Set<(event: VoiceEvent) => void>();
  return {
    onEvent: vi.fn((listener: (event: VoiceEvent) => void) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    }),
    start: vi.fn(async () => {}),
    sendAudio: vi.fn(async () => {}),
    finish: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    emit(event: VoiceEvent) {
      for (const listener of listeners) listener(event);
    },
  };
}

function createEditorHandle() {
  const state = { voiceText: "", voiceActive: false, written: [] as string[] };
  const handle = {
    beginVoiceText: vi.fn(() => {
      state.voiceText = "";
      state.voiceActive = true;
    }),
    setVoiceText: vi.fn((text: string) => {
      state.voiceText = text;
      state.written.push(text);
      return true;
    }),
    endVoiceText: vi.fn((options: { remove: boolean }) => {
      if (options.remove) state.voiceText = "";
      state.voiceActive = false;
    }),
    focus: vi.fn(),
  };
  return { state, handle: handle as unknown as LexicalChatInputHandle, spies: handle };
}

const microphone = {
  ensureAccess: vi.fn(async () => "granted" as const),
  resetAccess: vi.fn(async () => "granted" as const),
  openSettings: vi.fn(async () => true),
};

let container: HTMLDivElement;
let root: Root;
let latest: ComposerVoiceInput | null = null;

function Probe(props: {
  inputApiRef: { current: LexicalChatInputHandle | null };
  service: ReturnType<typeof createVoiceService>;
  sessionId: string | null;
  blocked?: boolean;
}): null {
  latest = useComposerVoiceInput({
    inputApiRef: props.inputApiRef,
    sessionId: props.sessionId,
    enabled: true,
    blocked: props.blocked ?? false,
  });
  return null;
}

async function mount(options: {
  inputApiRef: { current: LexicalChatInputHandle | null };
  service: ReturnType<typeof createVoiceService>;
  sessionId?: string | null;
  blocked?: boolean;
}): Promise<void> {
  await act(async () => {
    root.render(
      createElement(Probe, {
        inputApiRef: options.inputApiRef,
        service: options.service,
        sessionId: options.sessionId ?? "s1",
        blocked: options.blocked ?? false,
      }),
    );
  });
}

async function flush(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
  }
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("crypto", { randomUUID: () => "attempt-1" });
  mockState.loggedIn = true;
  mockState.platform = { microphone };
  mockState.capture = {
    stop: vi.fn(async () => ({ peak: 0.2, durationMs: 900, bytes: 6400 })),
    abort: vi.fn(),
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  latest = null;
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  mockState.platform = null;
  mockState.service = null;
  vi.unstubAllGlobals();
});

describe("useComposerVoiceInput", () => {
  it("is unavailable and a no-op when the platform has no microphone capability", async () => {
    const service = createVoiceService();
    mockState.service = service;
    mockState.platform = null;
    const editor = createEditorHandle();
    const inputApiRef = { current: editor.handle };

    await mount({ inputApiRef, service });

    expect(latest?.available).toBe(false);
    await act(async () => {
      latest?.toggle();
    });
    await flush();
    expect(service.start).not.toHaveBeenCalled();
    expect(editor.spies.beginVoiceText).not.toHaveBeenCalled();
  });

  it("stays unavailable without the host voice-input service", async () => {
    const service = createVoiceService();
    mockState.service = null;
    const editor = createEditorHandle();
    const inputApiRef = { current: editor.handle };

    await mount({ inputApiRef, service });
    expect(latest?.available).toBe(false);

    await act(async () => {
      latest?.toggle();
    });
    await flush();
    expect(service.start).not.toHaveBeenCalled();
  });

  it("writes the final transcript into the editor voice region and clears it on completion", async () => {
    const service = createVoiceService();
    mockState.service = service;
    const editor = createEditorHandle();
    const inputApiRef = { current: editor.handle };

    await mount({ inputApiRef, service });

    await act(async () => {
      latest?.toggle();
    });
    await flush();
    expect(service.start).toHaveBeenCalledWith({ attemptId: "attempt-1", language: "en-US" });
    expect(editor.spies.beginVoiceText).toHaveBeenCalled();

    await act(async () => {
      service.emit({ attemptId: "attempt-1", type: "started" });
    });
    expect(latest?.state).toBe("recording");

    let settled: Promise<void> | undefined;
    await act(async () => {
      settled = latest?.settle("submit");
      await Promise.resolve();
    });
    // 发送路径先等最终文本：finish 已发出，但 completed 之前不写编辑器。
    expect(service.finish).toHaveBeenCalledWith({ attemptId: "attempt-1" });
    expect(editor.spies.setVoiceText).not.toHaveBeenCalled();
    expect(settled).toBeInstanceOf(Promise);

    await act(async () => {
      service.emit({ attemptId: "attempt-1", type: "completed", text: "  hello world  " });
      await settled;
    });

    // 最终文本替换语音文字；语音文字区域结束（endVoiceText）后由编辑器/发送流程清空。
    expect(editor.spies.setVoiceText).toHaveBeenCalledWith("hello world", {
      preserveSelection: false,
    });
    expect(editor.spies.endVoiceText).toHaveBeenCalled();
    expect(editor.state.voiceActive).toBe(false);
    expect(latest?.state).toBe("idle");
  });

  it("cancels on Escape and drops late results", async () => {
    const service = createVoiceService();
    mockState.service = service;
    const editor = createEditorHandle();
    const inputApiRef = { current: editor.handle };

    await mount({ inputApiRef, service });
    await act(async () => {
      latest?.toggle();
    });
    await flush();
    await act(async () => {
      service.emit({ attemptId: "attempt-1", type: "started" });
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(service.cancel).toHaveBeenCalledWith({ attemptId: "attempt-1" });
    expect(editor.spies.endVoiceText).toHaveBeenCalledWith({ remove: true });

    await act(async () => {
      service.emit({ attemptId: "attempt-1", type: "completed", text: "late" });
    });
    expect(editor.spies.setVoiceText).not.toHaveBeenCalled();
    expect(latest?.state).toBe("idle");
  });
});
