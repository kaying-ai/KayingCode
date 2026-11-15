import type { AppSessionControl, AppTrustedContext } from "@zcode/session-control/contracts";
import { SessionControlError } from "@zcode/session-control/contracts";
import type { ExtensionGrant } from "@zcode/shared/extension-host";
import { describe, expect, it, vi } from "vitest";
import type {
  AppControlClientBinding,
  AppControlServiceHandle,
} from "../../src/app-control/contract.js";
import { createSessionsBackend } from "../../src/extensions/sessionsBackend.js";

const PLUGIN_ID = "demo@inline";
const context = {
  caller: "client",
  callerId: `local:client:extension:${PLUGIN_ID}`,
  rootSession: null,
  scopes: [],
  grants: [],
} as unknown as AppTrustedContext;

function createHandle(bindings: AppControlClientBinding[]): AppControlServiceHandle {
  return {
    sourceServerId: "local",
    service: {
      async bindClient(binding: AppControlClientBinding) {
        bindings.push(binding);
        return context;
      },
      control: {} as AppSessionControl,
    },
  } as unknown as AppControlServiceHandle;
}

function createBackend(input?: {
  appControl?: AppControlServiceHandle;
  currentGen?: () => number | null;
  covers?: (pluginId: string, grant: ExtensionGrant) => boolean;
  audit?: { append: (entry: unknown) => Promise<void> };
}) {
  return createSessionsBackend({
    appControl: input?.appControl,
    currentGen: input?.currentGen ?? (() => 1),
    covers: input?.covers ?? (() => true),
    ...(input?.audit ? { audit: input.audit as never } : {}),
    logger: { warn: vi.fn() },
  });
}

describe("extension sessions backend", () => {
  it("rejects a result that arrives after the extension host generation changed", async () => {
    const bindings: AppControlClientBinding[] = [];
    let gen = 1;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const backend = createBackend({
      appControl: createHandle(bindings),
      currentGen: () => gen,
    });

    const pending = backend.run(
      { pluginId: PLUGIN_ID, gen: 1 },
      "sessions.readSession",
      async () => {
        await gate;
        return "late-result";
      },
      {},
    );
    gen = 2;
    release();

    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    expect(bindings[0]).toMatchObject({
      clientId: `extension:${PLUGIN_ID}`,
      connectionId: `extension-host:1:${PLUGIN_ID}`,
    });
  });

  it("aborts in-flight calls when the extension host disconnects", async () => {
    const bindings: AppControlClientBinding[] = [];
    const backend = createBackend({ appControl: createHandle(bindings) });

    const pending = backend.run(
      { pluginId: PLUGIN_ID, gen: 1 },
      "sessions.readSession",
      async () =>
        await new Promise((_resolve, reject) => {
          bindings[0]!.signal.addEventListener(
            "abort",
            () => reject(new SessionControlError("cancelled", "aborted by disconnect")),
            { once: true },
          );
        }),
      {},
    );
    // bindClient 是 async：等 run 进入 invoke 并挂上 abort listener 后再模拟断开。
    await new Promise((resolve) => setImmediate(resolve));
    backend.abortAll();

    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  });

  it("rejects when the plugin grant was revoked", async () => {
    const backend = createBackend({
      appControl: createHandle([]),
      covers: () => false,
    });

    await expect(
      backend.run(
        { pluginId: PLUGIN_ID, gen: 1 },
        "sessions.readSession",
        async () => "ok",
        {},
      ),
    ).rejects.toMatchObject({ code: "not-granted" });
  });

  it("limits concurrent waitSessions calls per plugin", async () => {
    const gates: Array<() => void> = [];
    const backend = createBackend({ appControl: createHandle([]) });
    const wait = () =>
      backend.run(
        { pluginId: PLUGIN_ID, gen: 1 },
        "sessions.waitSessions",
        async () =>
          await new Promise<void>((resolve) => {
            gates.push(resolve);
          }),
        {},
      );

    const pending = [wait(), wait(), wait(), wait()];
    await expect(wait()).rejects.toMatchObject({ code: "limit-exceeded" });
    for (const release of gates) release();
    await Promise.all(pending);
  });

  it("writes one audit row after a session write", async () => {
    const append = vi.fn<(entry: unknown) => Promise<void>>(async () => undefined);
    const backend = createBackend({
      appControl: createHandle([]),
      audit: { append },
    });

    await expect(
      backend.run(
        { pluginId: PLUGIN_ID, gen: 1 },
        "sessions.sendToSession",
        async () => "ok",
        { sessionId: "sess_1" },
      ),
    ).resolves.toBe("ok");
    await new Promise((resolve) => setImmediate(resolve));

    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0]?.[0]).toMatchObject({
      pluginId: PLUGIN_ID,
      gen: 1,
      capability: "sessions.sendToSession",
    });
  });
});
