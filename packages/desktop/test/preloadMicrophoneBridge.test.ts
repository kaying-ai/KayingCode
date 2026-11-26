import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, it } from "vitest";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");

async function loadPreloadBridge() {
  const source = await readFile(new URL("../src/preload/index.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2024 },
  });
  const calls: Array<[string, unknown]> = [];
  const ipc = new EventEmitter();
  ipc.send = () => {};
  ipc.invoke = async (channel: string, payload?: unknown) => {
    calls.push([channel, payload]);
    return undefined;
  };
  const exposed: Record<string, Record<string, unknown>> = {};
  const channels = new Proxy({}, { get: (_target, key) => String(key) });
  const shared = {
    PlatformChannels: channels,
    InternalChannels: channels,
    shouldEnableE2ETestBridge: () => false,
    formatKayingCodeRendererProcessName: (title: string) => title,
  };
  runInNewContext(outputText, {
    exports: {},
    require: (name: string) => {
      if (name === "electron")
        return {
          ipcRenderer: ipc,
          webFrame: { getZoomFactor: () => 1 },
          webUtils: {},
          contextBridge: {
            exposeInMainWorld: (key: string, value: Record<string, unknown>) => {
              exposed[key] = value;
            },
          },
        };
      if (name === "@zcode/shared") return shared;
      if (name === "@zcode/shared/preinstalled-tools")
        return {
          preinstalledToolsStateSchema: {
            parse: (value: unknown) => value,
            safeParse: (value: unknown) => ({ success: true, data: value }),
          },
          preinstalledToolsCommandSchema: { parse: (value: unknown) => value },
        };
      if (name === "../shared/armsRumBridgeForward.js")
        return { installArmsRumBridgeIpcForward: () => {}, scheduleArmsEventBridgePatch: () => {} };
      if (name === "./oauthCallbackBridge.js")
        return { createOAuthCallbackHandler: () => () => {} };
      if (name === "./pluginSandbox/hostBridge.js")
        return { installPluginSandboxHostBridge: () => {} };
      if (name === "./remoteWorkspaceBindBridge.js")
        return { unwrapRemoteWorkspaceBindResult: (result: unknown) => result };
      throw new Error(`Unexpected preload dependency: ${name}`);
    },
    process: { argv: [], env: {}, platform: "win32" },
    window: { addEventListener: () => {}, postMessage: () => {} },
    document: { title: "test" },
  });
  return { bridge: exposed.kayingcode, calls };
}

describe("preload microphone bridge", () => {
  it("forwards the three microphone operations to their product IPC channels", async () => {
    const { bridge, calls } = await loadPreloadBridge();
    assert.ok(bridge);
    await (bridge.ensureMicrophoneAccess as () => Promise<unknown>)();
    await (bridge.resetMicrophoneAccess as () => Promise<unknown>)();
    await (bridge.openMicrophoneSettings as (target: string) => Promise<unknown>)("sound");

    assert.deepEqual(calls, [
      ["MicrophoneAccess", undefined],
      ["ResetMicrophoneAccess", undefined],
      ["OpenMicrophoneSettings", "sound"],
    ]);
  });
});
