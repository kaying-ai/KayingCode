import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { KAYING_FOR_TAPTAP_VERSION } from "../src/version.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the built-in manifest owns transcription content, MCP and comparison contribution", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, ".kayingcode-plugin", "plugin.json"), "utf8"),
  ) as {
    name: string;
    version: string;
    skills?: string;
    commands?: string;
    mcpServers?: Record<string, unknown>;
    uiContributions?: {
      sidePanes?: Array<{ id?: string; publicationFile?: string }>;
    };
  };

  assert.equal(manifest.name, "kaying-for-taptap");
  assert.equal(manifest.version, KAYING_FOR_TAPTAP_VERSION);
  assert.equal(manifest.skills, "./skills");
  assert.equal(manifest.commands, "./commands");
  assert.deepEqual(Object.keys(manifest.mcpServers ?? {}), ["kaying_for_taptap"]);
  assert.deepEqual(manifest.uiContributions?.sidePanes, [
    {
      contractVersion: 1,
      id: "transcription-compare",
      kind: "browser-compare",
      title: "转写对比",
      publicationFile: ".maker/threejs-to-taptapmaker/compare-publication.v1.json",
      views: [
        { id: "source", label: "原版 Web", profile: "standard-web" },
        { id: "target", label: "TapTap 预览", profile: "taptap-preview" },
      ],
    },
  ]);
});
