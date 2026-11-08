import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import {
  BrowserTabs,
  BrowserCommandError,
  loadBrowserApiManifest,
} from "../src/browser-client/index.js";

test("close by id never lists, activates or restores an unavailable guest", async () => {
  const commands: unknown[] = [];
  const tabs = new BrowserTabs(async (command) => {
    commands.push(command);
    assert.equal(command.method, "close");
    return { ok: true };
  });
  await tabs.close("observed-stale-tab");
  assert.deepEqual(commands, [{ method: "close", tabId: "observed-stale-tab" }]);
});

test("scope and persistence errors from the tab owner propagate to the caller", async () => {
  for (const message of ["tab belongs to another session", "recovery store unavailable"]) {
    const tabs = new BrowserTabs(async () => ({
      ok: false,
      error: { code: "backend_unavailable", message },
    }));
    await assert.rejects(
      tabs.close("observed-tab"),
      (error) => error instanceof BrowserCommandError && error.message === message,
    );
  }
});

test("an invalid explicit id cannot fall back to closing the active tab", async () => {
  const tabs = new BrowserTabs(async () => {
    throw new Error("must not dispatch");
  });
  for (const id of ["", "  ", undefined, null, 4]) {
    await assert.rejects(tabs.close(id as unknown as string), TypeError);
  }
});

test("both API manifests expose direct tab closing", () => {
  for (const root of [
    undefined,
    resolve(import.meta.dirname, "../../../apps/zcode-cli/packages/browser-use-plugin/docs"),
  ]) {
    const member = loadBrowserApiManifest(root).objects.Tabs.members.find(
      (member) => member.name === "close",
    );
    assert.equal(member?.command, "close");
  }
});
