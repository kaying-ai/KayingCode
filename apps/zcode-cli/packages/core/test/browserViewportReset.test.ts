import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import {
  Tab,
  loadBrowserApiManifest,
  BrowserApiPolicy,
  BrowserCommandError,
} from "../src/browser-client/index.js";

test("fixed viewport can be reset on the same tab, including repeated reset", async () => {
  const calls: unknown[] = [];
  const tab = new Tab(async (command) => {
    calls.push(command);
    return { ok: true };
  }, "scene-tab");
  await tab.setViewportSize({ width: 720, height: 1280 });
  assert.deepEqual(tab.viewportSize(), { width: 720, height: 1280 });
  await tab.resetViewportSize();
  assert.equal(tab.viewportSize(), null);
  await tab.resetViewportSize();
  assert.deepEqual(calls, [
    { method: "browserViewportSet", width: 720, height: 1280, tabId: "scene-tab" },
    { method: "browserViewportReset", tabId: "scene-tab" },
    { method: "browserViewportReset", tabId: "scene-tab" },
  ]);
});

test("failed reset preserves the last confirmed size and propagates failure", async () => {
  const tab = new Tab(
    async (command) =>
      command.method === "browserViewportReset"
        ? { ok: false, error: { code: "execution_error", message: "guest unavailable" } }
        : { ok: true },
    "scene-tab",
  );
  await tab.setViewportSize({ width: 720, height: 1280 });
  await assert.rejects(() => tab.resetViewportSize(), BrowserCommandError);
  assert.deepEqual(tab.viewportSize(), { width: 720, height: 1280 });
});

test("fallback and shipped manifests expose the same natural viewport command", () => {
  for (const root of [
    undefined,
    resolve(import.meta.dirname, "../../../apps/zcode-cli/packages/browser-use-plugin/docs"),
  ]) {
    const manifest = loadBrowserApiManifest(root);
    const member = manifest.objects.Tab.members.find(
      (member) => member.name === "resetViewportSize",
    );
    assert.equal(member?.command, "browserViewportReset");
    const descriptor = {
      id: "iab",
      generation: 1,
      type: "iab" as const,
      name: "Browser",
      capabilities: {},
    };
    assert.equal(
      new BrowserApiPolicy(manifest, descriptor).supports("Tab", "resetViewportSize"),
      true,
    );
    assert.equal(
      new BrowserApiPolicy(manifest, {
        ...descriptor,
        apiSupportOverrides: { "Tab.resetViewportSize": false },
      }).supports("Tab", "resetViewportSize"),
      false,
    );
  }
});
