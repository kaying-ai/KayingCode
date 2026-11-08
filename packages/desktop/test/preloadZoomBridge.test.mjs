import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");

test("preload starts and retains initial and updated zoom/window metrics", async () => {
  const source = await readFile(new URL("../src/preload/index.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2024 },
  });
  const ipc = new EventEmitter();
  ipc.send = () => {};
  ipc.invoke = async () => undefined;
  const exposed = {};
  const channels = new Proxy({}, { get: (_target, key) => String(key) });
  const shared = {
    PlatformChannels: channels,
    InternalChannels: channels,
    shouldEnableE2ETestBridge: () => false,
    formatKayingCodeRendererProcessName: (title) => title,
  };
  runInNewContext(outputText, {
    exports: {},
    require: (name) => {
      if (name === "electron")
        return {
          ipcRenderer: ipc,
          webFrame: { getZoomFactor: () => 1.1 },
          webUtils: {},
          contextBridge: {
            exposeInMainWorld: (name, value) => {
              exposed[name] = value;
            },
          },
        };
      if (name === "@zcode/shared") return shared;
      if (name === "../shared/armsRumBridgeForward.js")
        return { installArmsRumBridgeIpcForward: () => {}, scheduleArmsEventBridgePatch: () => {} };
      if (name === "./oauthCallbackBridge.js")
        return { createOAuthCallbackHandler: () => () => {} };
      if (name === "./pluginSandbox/hostBridge.js")
        return { installPluginSandboxHostBridge: () => {} };
      if (name === "./remoteWorkspaceBindBridge.js")
        return { unwrapRemoteWorkspaceBindResult: (result) => result };
      throw new Error(`Unexpected preload dependency: ${name}`);
    },
    process: { argv: [], env: {}, platform: "win32" },
    window: { addEventListener: () => {}, postMessage: () => {} },
    document: { title: "test" },
  });
  const bridge = exposed.kayingcode;
  assert.ok(bridge);
  assert.equal((await bridge.getDesktopZoomLevel()).zoomLevel, 1);
  assert.equal(bridge.getWindowControlsOverlayMetrics().titleBarHeightPx, 53);
  ipc.emit("DesktopZoomLevelChanged", {}, { zoomLevel: 3 });
  ipc.emit("WindowControlsOverlayChanged", {}, { rightPaddingPx: 80 });
  assert.equal((await bridge.getDesktopZoomLevel()).zoomLevel, 3);
  assert.equal(bridge.getWindowControlsOverlayMetrics().rightPaddingPx, 80);
});
