import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as shared from "@zcode/shared";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");
const modules = new Map();
async function load(name) {
  if (modules.has(name)) return modules.get(name);
  const source = await readFile(
    new URL(`../src/main/browserView/${name}.ts`, import.meta.url),
    "utf8",
  );
  const dependencies = {};
  if (name === "browserGuestManager")
    dependencies["./browserTabResidencyCoordinator.js"] = await load(
      "browserTabResidencyCoordinator",
    );
  if (name === "browserTabResidencyCoordinator")
    dependencies["./browserTabResidencyPolicy.js"] = await load("browserTabResidencyPolicy");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2024 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    Buffer,
    URL,
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout,
    require(name) {
      if (name.startsWith("node:")) return require(name);
      if (name === "@zcode/shared") return shared;
      if (dependencies[name]) return dependencies[name];
      // 关闭 logical tab 不应访问 guest/CDP/截图等依赖；意外触碰时直接失败。
      return new Proxy(
        {},
        {
          get: (_, key) => {
            throw new Error(`unexpected guest dependency ${name}.${String(key)}`);
          },
        },
      );
    },
  });
  modules.set(name, exports);
  return exports;
}

test("direct close keeps Main ownership and durable-delete boundaries without restoring a guest", async () => {
  const { BrowserGuestManager } = await load("browserGuestManager");
  const events = [];
  let failRemoval = true;
  let finishRemoval;
  const removal = new Promise((resolve) => {
    finishRemoval = resolve;
  });
  const record = {
    schemaVersion: 1,
    tabId: "stale-tab",
    windowBindingId: null,
    workspaceKey: "workspace-identity",
    sessionId: "session",
    remoteSessionId: "remote-session",
    browserId: "iab",
    browserGeneration: 1,
    origin: "agent",
    lifecycle: "active",
    restoreUrl: "http://localhost/scene",
    title: "Scene",
    faviconUrl: null,
    viewport: null,
    openedAt: 1,
    lastSelectedAt: null,
    updatedAt: 1,
  };
  const store = {
    listShells: async () => [record],
    remove: async (id) => {
      events.push(`remove:${id}`);
      if (failRemoval) throw new Error("disk unavailable");
      await removal;
      events.push("persisted");
    },
  };
  const manager = new BrowserGuestManager(
    undefined,
    1,
    () => events.push("closed"),
    () => {
      throw new Error("must not rebuild guest");
    },
    undefined,
    undefined,
    undefined,
    undefined,
    { recoveryStore: store },
  );
  const context = {
    requestId: "request",
    browserId: "iab",
    browserGeneration: 1,
    windowId: 1,
    workspaceKey: record.workspaceKey,
    sessionId: record.sessionId,
    remoteSessionId: record.remoteSessionId,
    clientMode: "desktop-continuous",
  };
  try {
    await manager.restoreTabs({
      windowId: 1,
      workspaceKey: record.workspaceKey,
      sessionId: record.sessionId,
    });
    for (const patch of [
      { sessionId: "other" },
      { workspaceKey: "other" },
      { windowId: 2 },
      { remoteSessionId: "other" },
      { browserId: "other" },
      { browserGeneration: 2 },
    ]) {
      const result = await manager.execute(
        { ...context, ...patch },
        { method: "close", tabId: record.tabId },
      );
      assert.equal(result.ok, false);
    }
    assert.equal(events.length, 0);
    await assert.rejects(
      manager.execute(context, { method: "close", tabId: record.tabId }),
      /disk unavailable/,
    );
    assert.equal((await manager.execute(context, { method: "list" })).tabs.length, 1);
    assert.equal(events.includes("closed"), false);
    failRemoval = false;
    const closing = manager.execute(context, { method: "close", tabId: record.tabId });
    await Promise.resolve();
    assert.equal(events.includes("closed"), false);
    finishRemoval();
    assert.equal((await closing).ok, true);
    assert.deepEqual(events.slice(-2), ["persisted", "closed"]);
    assert.equal((await manager.execute(context, { method: "list" })).tabs.length, 0);
  } finally {
    finishRemoval();
    manager.disposeAll();
  }
});
