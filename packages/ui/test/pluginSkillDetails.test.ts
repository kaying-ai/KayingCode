import assert from "node:assert/strict";
import { test } from "vitest";
import { enrichPluginSkillGroups } from "../src/settings/pluginSkillDetails.js";

const groups = [
  { kind: "skill" as const, count: 1, items: [{ name: "blender", description: "Original" }] },
];
const listing = {
  skillDetails: [
    {
      name: "blender",
      title: { "en-US": "Blender workflow", "zh-CN": "Blender 场景工作流" },
      description: { "en-US": "Full description", "zh-CN": "完整说明" },
      subskills: [
        {
          id: "scene",
          title: { "en-US": "Scene design", "zh-CN": "场景搭建" },
          description: { "en-US": "Inspect and build", "zh-CN": "检查并搭建场景" },
        },
      ],
    },
  ],
};
test("enrichment preserves true skill identity and count while localizing subskills", () => {
  const result = enrichPluginSkillGroups(groups, listing, "zh-CN");
  assert.equal(result[0].count, 1);
  assert.equal(result[0].items[0].name, "blender");
  assert.equal(result[0].items[0].displayName, "Blender 场景工作流");
  assert.equal(result[0].items[0].subskills?.[0].displayName, "场景搭建");
  assert.equal(groups[0].items[0].description, "Original");
});
test("absent or stale listing cannot invent skills and unrelated components stay intact", () => {
  assert.deepEqual(enrichPluginSkillGroups(groups, undefined, "zh-CN"), groups);
  assert.deepEqual(enrichPluginSkillGroups([], listing, "zh-CN"), []);
  const staleGroups = [
    {
      kind: "skill" as const,
      count: 1,
      items: [{ name: "another-skill", description: "Original" }],
    },
  ];
  assert.deepEqual(enrichPluginSkillGroups(staleGroups, listing, "zh-CN"), staleGroups);
  assert.deepEqual(
    enrichPluginSkillGroups(
      [{ kind: "mcp", count: 1, items: [{ name: "blender" }] }],
      listing,
      "zh-CN",
    ),
    [{ kind: "mcp", count: 1, items: [{ name: "blender" }] }],
  );
  assert.equal(
    enrichPluginSkillGroups(groups, listing, "en-US")[0].items[0].subskills?.[0].displayName,
    "Scene design",
  );
});
