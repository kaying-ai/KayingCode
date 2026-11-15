import { describe, expect, it } from "vitest";
import {
  EXTENSION_API_VERSION,
  isExtensionEngineCompatible,
  validateExtensionManifest,
} from "./manifest.js";
import { parseManifestSlots } from "./manifestSlots.js";
import {
  PLUGIN_MANIFEST_CANDIDATES,
  resolvePluginManifest,
  type PluginManifestSource,
} from "./staticTable.js";
import { normalizeGrants } from "./grants.js";

const source: PluginManifestSource = {
  pluginId: "demo@kayingcode-plugins-official",
  name: "demo",
  version: "1.0.0",
  rootPath: "/plugins/demo",
};

describe("extension manifest validation", () => {
  it("accepts an upstream manifest and normalizes grants", () => {
    const validation = validateExtensionManifest({
      engines: { zcode: `^${EXTENSION_API_VERSION}` },
      main: "dist/extension.js",
      grants: ["sessions.read", "sessions.write", "sessions.read"],
      contributes: {
        commands: [{ id: "open", title: "Open" }],
        views: [{ id: "panel", title: "Panel" }],
      },
    });

    expect(validation.status).toBe("ok");
    if (validation.status !== "ok") return;
    expect(normalizeGrants(validation.manifest.grants ?? [])).toEqual(["sessions.write"]);
    expect(validation.manifest.contributes?.views?.[0]?.id).toBe("panel");
  });

  it("rejects unknown fields with a field path", () => {
    const validation = validateExtensionManifest({
      engines: { zcode: `^${EXTENSION_API_VERSION}` },
      contributes: { commands: [{ id: "open", title: "Open", titel: "typo" }] },
    });

    expect(validation).toMatchObject({
      status: "invalid",
      path: "extension.contributes.commands[0].titel",
    });
  });

  it("reports incompatible engines before validating the rest", () => {
    const validation = validateExtensionManifest({
      engines: { zcode: "^99.0.0" },
      unknownField: true,
    });

    expect(validation.status).toBe("incompatible");
    expect(isExtensionEngineCompatible("^99.0.0")).toBe(false);
  });

  it("parses slots and keeps unknown slots as diagnostics", () => {
    const parsed = parseManifestSlots({
      "composer.status": [{ id: "status", target: { command: "show-status" } }],
      "future.slot": [{ id: "future", target: { view: "panel" } }],
    });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.target).toEqual({ kind: "command", id: "show-status" });
    expect(parsed.ignored).toEqual([
      { path: 'slots["future.slot"]', reason: "unknown slot: future.slot" },
    ]);
  });
});

describe("plugin manifest candidate compatibility", () => {
  it("reads .zcode-plugin before .kayingcode-plugin", () => {
    expect(PLUGIN_MANIFEST_CANDIDATES.map(([dir]) => dir)).toEqual([
      ".zcode-plugin",
      ".kayingcode-plugin",
      ".claude-plugin",
      ".codex-plugin",
    ]);
  });

  it("keeps a plain upstream MCP plugin loadable without an extension block", () => {
    const resolved = resolvePluginManifest(source, {
      status: "ok",
      manifest: { name: "demo", version: "1.0.0", mcpServers: {} },
    });

    expect(resolved.entry.extension).toBeNull();
    expect(resolved.entry.problems).toEqual([]);
    expect(resolved.declaration).toBeNull();
  });
});
