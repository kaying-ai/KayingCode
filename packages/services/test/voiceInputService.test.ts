import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@zcode/shared";
import type { WebSocket } from "undici";
import {
  createVoiceInputService,
  mapAsrErrorCode,
} from "../src/voice-input/voiceInputService.js";
import type { VoiceInputEvent } from "../src/voice-input/contract.js";

const ORIGIN = "https://asr.test";

class FakeSocket {
  readyState = 0;
  binaryType = "blob";
  readonly sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; wasClean: boolean; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closeCalls = 0;

  send(data: unknown) {
    this.sent.push(data);
  }

  close(code?: number) {
    this.closeCalls += 1;
    this.readyState = 3;
    this.onclose?.({ code: code ?? 1000, wasClean: true, reason: "" });
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  message(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  drop(code = 1006, wasClean = false) {
    this.readyState = 3;
    this.onclose?.({ code, wasClean, reason: "dropped" });
  }

  error() {
    this.onerror?.();
  }
}

function asWebSocket(socket: FakeSocket): WebSocket {
  return socket as unknown as WebSocket;
}

interface Harness {
  service: ReturnType<typeof createVoiceInputService>;
  events: VoiceInputEvent[];
  sockets: FakeSocket[];
  api: { request: ReturnType<typeof vi.fn> };
  dispose: () => void;
}

function createHarness(
  options: {
    origin?: string;
    token?: string | null;
    response?: () => Promise<Response>;
    viaProxy?: boolean;
    createSocketError?: Error;
  } = {},
): Harness {
  const sockets: FakeSocket[] = [];
  const events: VoiceInputEvent[] = [];
  const response =
    options.response ??
    (async () =>
      new Response(
        JSON.stringify({ code: 0, data: { ticket: "ticket-1", ws_path: "/asr/stream?lng=en" } }),
        { status: 200 },
      ));
  const api = { request: vi.fn(response) };
  const service = createVoiceInputService({
    apiClient: api as unknown as ApiClient,
    getToken: async () => (options.token === undefined ? "jwt-token" : options.token),
    resolveOrigin: async () => options.origin ?? ORIGIN,
    createSocket: async () => {
      if (options.createSocketError) throw options.createSocketError;
      const socket = new FakeSocket();
      sockets.push(socket);
      return { socket: asWebSocket(socket), viaProxy: options.viaProxy ?? false };
    },
  });
  service.onEvent((event) => events.push(event));
  return { service, events, sockets, api, dispose: () => service.dispose() };
}

async function flush(turns = 4): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("mapAsrErrorCode", () => {
  it("maps server error codes and HTTP statuses to UI failure codes", () => {
    expect(mapAsrErrorCode("unauthorized")).toBe("unauthorized");
    expect(mapAsrErrorCode("rate_limited")).toBe("rate_limited");
    expect(mapAsrErrorCode("upstream_unavailable")).toBe("unavailable");
    expect(mapAsrErrorCode("upstream_timeout")).toBe("upstream_timeout");
    expect(mapAsrErrorCode("audio_limit_exceeded")).toBe("audio_limit_exceeded");
    expect(mapAsrErrorCode("empty_audio")).toBe("audio_too_short");
    expect(mapAsrErrorCode(undefined, 401)).toBe("unauthorized");
    expect(mapAsrErrorCode(undefined, 429)).toBe("rate_limited");
    expect(mapAsrErrorCode(undefined, 503)).toBe("unavailable");
    expect(mapAsrErrorCode(undefined, 500)).toBe("failed");
    expect(mapAsrErrorCode("unknown")).toBe("failed");
  });
});

describe("createVoiceInputService", () => {
  it("requests a realtime ticket with the login token and opens a ws:// stream", async () => {
    const harness = createHarness();
    await harness.service.start({ attemptId: "a1", language: "zh-CN" });
    await flush();

    expect(harness.api.request).toHaveBeenCalledTimes(1);
    const [url, init] = harness.api.request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}/api/v1/asr/tickets`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-token");
    expect(init.body).toBe(JSON.stringify({ mode: "realtime" }));

    expect(harness.sockets).toHaveLength(1);
    const socket = harness.sockets[0];
    socket.open();
    expect(socket.sent).toEqual([
      JSON.stringify({
        type: "start",
        audio: { encoding: "pcm_s16le", sample_rate: 16000, channels: 1 },
        language: "zh-CN",
        options: { punctuation: true, itn: true },
      }),
    ]);
  });

  it("buffers audio before started, flushes in order, and emits result/completed", async () => {
    const harness = createHarness();
    await harness.service.start({ attemptId: "a1", language: "en-US" });
    await flush();
    const socket = harness.sockets[0];

    // started 之前：音频只进 Host 缓冲
    await harness.service.sendAudio({ attemptId: "a1", chunk: new Uint8Array([1, 2]) });
    await harness.service.sendAudio({ attemptId: "a1", chunk: new Uint8Array([3, 4]) });
    socket.open();
    expect(socket.sent).toHaveLength(1);

    socket.message({ type: "started", session_id: "server-1", provider: "test" });
    expect(harness.events).toEqual([{ attemptId: "a1", type: "started" }]);
    expect(socket.sent.slice(1)).toEqual([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);

    // started 之后直接转发
    await harness.service.sendAudio({ attemptId: "a1", chunk: new Uint8Array([5]) });
    expect(socket.sent.at(-1)).toEqual(new Uint8Array([5]));

    socket.message({ type: "result", text: "hello" });
    socket.message({ type: "result", text: "hello world" });
    socket.message({ type: "completed", text: "hello world" });

    expect(harness.events).toEqual([
      { attemptId: "a1", type: "started" },
      { attemptId: "a1", type: "result", text: "hello" },
      { attemptId: "a1", type: "result", text: "hello world" },
      { attemptId: "a1", type: "completed", text: "hello world" },
    ]);
    expect(socket.closeCalls).toBeGreaterThan(0);
  });

  it("finish waits for started and cancels without emitting further events", async () => {
    const harness = createHarness();
    await harness.service.start({ attemptId: "a1", language: "en-US" });
    await flush();
    const socket = harness.sockets[0];
    socket.open();

    // started 前 finish：记录后由 started 补发
    await harness.service.finish({ attemptId: "a1" });
    socket.message({ type: "started" });
    expect(socket.sent.at(-1)).toBe(JSON.stringify({ type: "finish" }));

    await harness.service.cancel({ attemptId: "a1" });
    expect(socket.sent.at(-1)).toBe(JSON.stringify({ type: "cancel" }));
    socket.message({ type: "result", text: "late" });
    socket.message({ type: "completed", text: "late" });
    expect(harness.events).toEqual([{ attemptId: "a1", type: "started" }]);
  });

  it("replaces the previous attempt and drops its late events", async () => {
    const harness = createHarness();
    await harness.service.start({ attemptId: "a1", language: "en-US" });
    await flush();
    const first = harness.sockets[0];
    first.open();
    first.message({ type: "started" });

    await harness.service.start({ attemptId: "a2", language: "zh-CN" });
    await flush();
    const second = harness.sockets[1];
    expect(first.closeCalls).toBeGreaterThan(0);

    first.message({ type: "result", text: "stale" });
    first.message({ type: "completed", text: "stale" });
    expect(harness.events).toEqual([{ attemptId: "a1", type: "started" }]);

    second.open();
    second.message({ type: "started" });
    second.message({ type: "completed", text: "fresh" });
    expect(harness.events.slice(1)).toEqual([
      { attemptId: "a2", type: "started" },
      { attemptId: "a2", type: "completed", text: "fresh" },
    ]);
  });

  it("classifies ticket failures (401, 429, empty endpoint, network)", async () => {
    const unauthorized = createHarness({
      response: async () => new Response("", { status: 401 }),
    });
    await unauthorized.service.start({ attemptId: "a1", language: "en-US" });
    await flush();
    expect(unauthorized.events).toEqual([{ attemptId: "a1", type: "error", code: "unauthorized" }]);

    const limited = createHarness({ response: async () => new Response("", { status: 429 }) });
    await limited.service.start({ attemptId: "a1", language: "en-US" });
    await flush();
    expect(limited.events).toEqual([{ attemptId: "a1", type: "error", code: "rate_limited" }]);

    const noEndpoint = createHarness({ origin: "" });
    await noEndpoint.service.start({ attemptId: "a1", language: "en-US" });
    await flush();
    expect(noEndpoint.api.request).not.toHaveBeenCalled();
    expect(noEndpoint.events).toEqual([{ attemptId: "a1", type: "error", code: "unavailable" }]);

    const offline = createHarness({
      response: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await offline.service.start({ attemptId: "a1", language: "en-US" });
    await flush();
    expect(offline.events).toEqual([{ attemptId: "a1", type: "error", code: "network" }]);

    const missingToken = createHarness({ token: null });
    await missingToken.service.start({ attemptId: "a1", language: "en-US" });
    await flush();
    expect(missingToken.api.request).not.toHaveBeenCalled();
    expect(missingToken.events).toEqual([{ attemptId: "a1", type: "error", code: "unauthorized" }]);
  });

  it("classifies socket failures: handshake error, proxy close, server error frame", async () => {
    const handshake = createHarness();
    await handshake.service.start({ attemptId: "a1", language: "en-US" });
    await flush();
    handshake.sockets[0].error();
    expect(handshake.events).toEqual([{ attemptId: "a1", type: "error", code: "failed" }]);

    const proxy = createHarness({ viaProxy: true });
    await proxy.service.start({ attemptId: "a1", language: "en-US" });
    await flush();
    proxy.sockets[0].open();
    proxy.sockets[0].drop();
    expect(proxy.events).toEqual([{ attemptId: "a1", type: "error", code: "proxy" }]);

    const directClose = createHarness();
    await directClose.service.start({ attemptId: "a1", language: "en-US" });
    await flush();
    directClose.sockets[0].open();
    directClose.sockets[0].drop();
    expect(directClose.events).toEqual([{ attemptId: "a1", type: "error", code: "failed" }]);

    const serverError = createHarness();
    await serverError.service.start({ attemptId: "a1", language: "en-US" });
    await flush();
    serverError.sockets[0].open();
    serverError.sockets[0].message({ type: "error", code: "audio_limit_exceeded" });
    expect(serverError.events).toEqual([
      { attemptId: "a1", type: "error", code: "audio_limit_exceeded" },
    ]);

    const createFailed = createHarness({ createSocketError: new Error("invalid proxy") });
    await createFailed.service.start({ attemptId: "a1", language: "en-US" });
    await flush();
    expect(createFailed.events).toEqual([{ attemptId: "a1", type: "error", code: "network" }]);
  });

  it("ignores audio and finish for other or unknown attempts", async () => {
    const harness = createHarness();
    await harness.service.start({ attemptId: "a1", language: "en-US" });
    await flush();
    const socket = harness.sockets[0];
    socket.open();
    socket.message({ type: "started" });
    const sentBefore = socket.sent.length;

    await harness.service.sendAudio({ attemptId: "other", chunk: new Uint8Array([9]) });
    await harness.service.finish({ attemptId: "other" });
    await harness.service.cancel({ attemptId: "other" });
    expect(socket.sent).toHaveLength(sentBefore);
    expect(socket.closeCalls).toBe(0);
  });
});
