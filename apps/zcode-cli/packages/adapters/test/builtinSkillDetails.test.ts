import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "vitest";
import { kayingcodePluginStoreListingSchema } from "@zcode/shared";
import { enumeratePluginComponents } from "../src/plugins/plugin-components.js";
import { parseEntryStoreListing } from "../src/plugins/marketplace.js";

test("every shipped skill has matching display metadata and cannot be invented by the catalog", async () => {
  // test/ → adapters → packages → zcode-cli → apps → 仓库根。
  const root = resolve(import.meta.dirname, "../../../../..");
  const catalog = JSON.parse(await readFile(resolve(root, "config/official-plugins.json"), "utf8"));
  for (const plugin of catalog.plugins) {
    const pluginRoot = resolve(root, plugin.sourceRoot);
    const manifest = await readFile(resolve(pluginRoot, ".zcode-plugin/plugin.json"), "utf8")
      .then(JSON.parse)
      .catch(() =>
        readFile(resolve(pluginRoot, ".kayingcode-plugin/plugin.json"), "utf8")
          .then(JSON.parse)
          .catch(() => null),
      );
    // 组件枚举已改为异步 material loader；这里必须 await 后再按 kind 取分组。
    const skills =
      (await enumeratePluginComponents(pluginRoot, manifest)).find(
        (group) => group.kind === "skill",
      )?.items ?? [];
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
