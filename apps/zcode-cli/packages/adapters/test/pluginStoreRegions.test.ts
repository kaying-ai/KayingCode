import assert from "node:assert/strict";
import { test } from "vitest";
import { parseEntryStoreListing } from "../src/plugins/marketplace.js";

// 按地区定向展示（packages/shared/spec/plugin-store-regions.md）：只保留 cn/global 并去重；
// 未知值忽略不报错（strict 协议不能收未知值），缺省、非数组、过滤后为空都不写，表示全部区域可见。
test("keeps only known store regions and omits the field when nothing is left", () => {
  assert.deepEqual(parseEntryStoreListing({ regions: ["cn"] }), { regions: ["cn"] });
  assert.deepEqual(parseEntryStoreListing({ regions: ["global"] }), { regions: ["global"] });
  assert.deepEqual(parseEntryStoreListing({ regions: ["global", "cn", "cn"] }), {
    regions: ["cn", "global"],
  });
  assert.deepEqual(parseEntryStoreListing({ regions: ["cn", "mars", 1, null] }), {
    regions: ["cn"],
  });
  assert.equal(parseEntryStoreListing({ name: "x" }), undefined);
  assert.equal(parseEntryStoreListing({ regions: [] }), undefined);
  assert.equal(parseEntryStoreListing({ regions: ["mars"] }), undefined);
  assert.equal(parseEntryStoreListing({ regions: "cn" }), undefined);
  assert.equal(parseEntryStoreListing({ regions: { cn: true } }), undefined);
});

test("store regions coexist with the game development extension", () => {
  const gameDevelopment = { engines: ["unity"], stages: ["development"] };
  assert.deepEqual(
    parseEntryStoreListing({ displayName: "Game", regions: ["cn"], gameDevelopment }),
    { displayName: "Game", regions: ["cn"], gameDevelopment },
  );
  // 游戏扩展非法时只丢该扩展，区域声明仍然保留。
  assert.deepEqual(
    parseEntryStoreListing({ displayName: "Game", regions: ["cn"], gameDevelopment: { engines: [] } }),
    { displayName: "Game", regions: ["cn"] },
  );
});
