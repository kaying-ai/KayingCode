import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { kayingcodePluginStoreListingSchema } from "@zcode/shared";
import { enumeratePluginComponents } from "../src/plugins/plugin-components.js";
import { parseEntryStoreListing } from "../src/plugins/marketplace.js";

test("every shipped skill has matching display metadata and cannot be invented by the catalog", async () => {
  const root = resolve(import.meta.dirname, "../../..");
  const catalog = JSON.parse(await readFile(resolve(root, "config/official-plugins.json"), "utf8"));
  for (const plugin of catalog.plugins) {
    const pluginRoot = resolve(root, plugin.sourceRoot);
    const manifest = await readFile(resolve(pluginRoot, ".kayingcode-plugin/plugin.json"), "utf8")
      .then(JSON.parse)
      .catch(() => null);
    const skills =
      enumeratePluginComponents(pluginRoot, manifest).find((group) => group.kind === "skill")
        ?.items ?? [];
    const listing = parseEntryStoreListing(plugin.listing ?? {});
    const details = listing?.skillDetails ?? [];
    assert.deepEqual(
      details.map((item) => item.name).toSorted(),
      skills.map((item) => item.name).toSorted(),
      plugin.name,
    );
    if (listing) kayingcodePluginStoreListingSchema.parse(listing);
    if (plugin.name === "blender") {
      assert.equal(skills.length, 1);
      assert.equal(details[0].subskills?.length, 10);
    }
    if (plugin.name === "kaying-for-taptap") assert.equal(skills.length, 7);
  }
});

test("invalid skill details do not discard the plugin listing", () => {
  assert.deepEqual(
    parseEntryStoreListing({ displayName: "Blender", skillDetails: [{ name: "blender" }] }),
    { displayName: "Blender" },
  );
});
