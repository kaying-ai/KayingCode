import assert from "node:assert/strict";
import test from "node:test";
import { applyBrandMap, mapProtocolPath } from "./lib/kayingcode-brand-map.mjs";
import {
  classifyProtocolFile,
  renderMarkdown,
  summarizeEntries,
} from "./upstream-protocol-inventory.mjs";

test("品牌映射按权威顺序替换包名、品牌和路径", () => {
  // 产品保留上游 workspace 作用域，不能被全局 zcode 替换误伤。
  assert.equal(applyBrandMap("@zcode/shared"), "@zcode/shared");
  assert.equal(applyBrandMap("@zcode/zcode-cua"), "@zcode/zcode-cua");
  assert.equal(applyBrandMap("ZCode 4.0.0"), "KayingCode 4.0.0");
  assert.equal(applyBrandMap("zcode-protocol-v4"), "kayingcode-protocol-v4");
  assert.equal(applyBrandMap("ZCODE_API_KEY"), "KAYINGCODE_API_KEY");
  assert.equal(applyBrandMap(".zcode/config.json"), ".kayingcode/config.json");
});

test("协议路径映射保留 apps/zcode-cli 目录名", () => {
  assert.equal(
    mapProtocolPath("apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server.ts"),
    "apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/server.ts",
  );
  assert.equal(
    mapProtocolPath("packages/shared/src/zcode-protocol-v4/transport.ts"),
    "packages/shared/src/kayingcode-protocol-v4/transport.ts",
  );
});

test("classifyProtocolFile 区分 parity、patch 与 missing", () => {
  const upstream = 'export const name = "zcode";\n';
  const mapped = applyBrandMap(upstream);

  assert.deepEqual(
    classifyProtocolFile({ baseContent: upstream, upstreamContent: upstream, productContent: mapped }),
    {
      status: "parity",
      productVsBase: "base",
      upstreamChange: "unchanged",
      mappedUpstream: mapped,
      mappedBase: mapped,
    },
  );

  const patched = `${mapped}// product patch\n`;
  const patch = classifyProtocolFile({
    baseContent: upstream,
    upstreamContent: upstream,
    productContent: patched,
  });
  assert.equal(patch.status, "patch");
  assert.equal(patch.productVsBase, "local-change");
  assert.equal(patch.upstreamChange, "unchanged");

  const missing = classifyProtocolFile({
    baseContent: upstream,
    upstreamContent: upstream,
    productContent: null,
  });
  assert.equal(missing.status, "missing");
  assert.equal(missing.productVsBase, "missing");
});

test("classifyProtocolFile 标注上游新增与修改", () => {
  const base = "line\n";
  const upstream = "line\nnext\n";

  const modified = classifyProtocolFile({
    baseContent: base,
    upstreamContent: upstream,
    productContent: applyBrandMap(base),
  });
  assert.equal(modified.status, "patch");
  assert.equal(modified.productVsBase, "base");
  assert.equal(modified.upstreamChange, "modified");

  const added = classifyProtocolFile({
    baseContent: null,
    upstreamContent: upstream,
    productContent: null,
  });
  assert.equal(added.status, "missing");
  assert.equal(added.productVsBase, "missing");
  assert.equal(added.upstreamChange, "added");
});

test("summarizeEntries 与 renderMarkdown 输出稳定结构", () => {
  const entries = [
    {
      upstreamPath: "a/parity.ts",
      productPath: "a/kayingcode-parity.ts",
      status: "parity",
      productVsBase: "base",
      upstreamChange: "unchanged",
      upstreamLines: 1,
      productLines: 1,
    },
    {
      upstreamPath: "a/patch.ts",
      productPath: "a/kayingcode-patch.ts",
      status: "patch",
      productVsBase: "local-change",
      upstreamChange: "modified",
      upstreamLines: 2,
      productLines: 3,
    },
    {
      upstreamPath: "a/missing.ts",
      productPath: "a/kayingcode-missing.ts",
      status: "missing",
      productVsBase: "missing",
      upstreamChange: "unchanged",
      upstreamLines: 1,
      productLines: 0,
    },
  ];
  const summary = summarizeEntries(entries, ["a/product-only.ts"]);
  assert.deepEqual(summary, {
    upstreamFiles: 3,
    parity: 1,
    patch: 1,
    missing: 1,
    productOnly: 1,
    upstreamAdded: 0,
    upstreamModified: 1,
  });

  const markdown = renderMarkdown({
    base: "base",
    upstream: "upstream",
    generatedAt: "2026-11-24T00:00:00.000Z",
    summary,
    entries,
    productOnly: ["a/product-only.ts"],
  });
  assert.match(markdown, /parity（映射后一致） \| 1/);
  assert.match(markdown, /patch（产品本地改动） \| 1/);
  assert.match(markdown, /missing（产品缺失） \| 1/);
  assert.match(markdown, /a\/kayingcode-missing\.ts/);
  assert.match(markdown, /a\/product-only\.ts/);
});
