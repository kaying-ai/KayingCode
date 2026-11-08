import assert from "node:assert/strict";
import { test } from "vitest";
import { pluginSkillDetailsSchema } from "../src/plugin-skill-details.js";
import { kayingcodePluginStoreListingSchema } from "../src/kayingcode-protocol/index.js";

const text = { "en-US": "Scene workflow", "zh-CN": "场景工作流" };
const detail = {
  name: "blender",
  title: text,
  description: text,
  subskills: [{ id: "scene", title: text, description: text }],
};
test("skill details round trip through listing while legacy listings remain compatible", () => {
  assert.deepEqual(
    kayingcodePluginStoreListingSchema.parse({ skillDetails: [detail] }).skillDetails,
    [detail],
  );
  assert.deepEqual(kayingcodePluginStoreListingSchema.parse({}), {});
});
test("skill and subskill identity, localization and unknown fields are validated", () => {
  for (const input of [
    [detail, detail],
    [{ ...detail, subskills: [detail.subskills[0], detail.subskills[0]] }],
    [{ ...detail, extra: true }],
    [{ ...detail, title: {} }],
    [{ ...detail, name: "" }],
  ]) {
    assert.equal(pluginSkillDetailsSchema.safeParse(input).success, false);
  }
});
