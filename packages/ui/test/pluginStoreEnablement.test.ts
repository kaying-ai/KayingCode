import assert from "node:assert/strict";
import { test } from "vitest";
import {
  canTogglePluginStoreItem,
  resolvePluginStoreEnablement,
} from "../src/settings/pluginStoreEnablement.js";

test("installed plugin projects its authoritative enabled state", () => {
  assert.equal(
    resolvePluginStoreEnablement({ installed: true, info: { enabled: true } }),
    "enabled",
  );
  assert.equal(
    resolvePluginStoreEnablement({ installed: true, info: { enabled: false } }),
    "disabled",
  );
});

test("uninstalled and incomplete records do not expose an enable switch", () => {
  const uninstalled = { installed: false, info: { enabled: false } };
  const incomplete = { installed: true, info: undefined };

  assert.equal(resolvePluginStoreEnablement(uninstalled), "unavailable");
  assert.equal(resolvePluginStoreEnablement(incomplete), "unavailable");
  assert.equal(canTogglePluginStoreItem(uninstalled), false);
  assert.equal(canTogglePluginStoreItem(incomplete), false);
});

test("only installed records with runtime info can be toggled", () => {
  assert.equal(canTogglePluginStoreItem({ installed: true, info: { enabled: true } }), true);
  assert.equal(canTogglePluginStoreItem({ installed: true, info: { enabled: false } }), true);
});
