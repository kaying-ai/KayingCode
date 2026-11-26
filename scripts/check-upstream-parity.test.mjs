import assert from "node:assert/strict";
import test from "node:test";
import { evaluateParity } from "./check-upstream-parity.mjs";

function inventory({ parity = 2, patch = 1, missing = ["missing/a.ts"], productOnly = [] } = {}) {
  const entries = [
    ...Array.from({ length: parity }, (_, index) => ({
      upstreamPath: `parity/${index}.ts`,
      status: "parity",
    })),
    ...Array.from({ length: patch }, (_, index) => ({
      upstreamPath: `patch/${index}.ts`,
      status: "patch",
    })),
    ...missing.map((path) => ({ upstreamPath: path, status: "missing" })),
  ];
  return {
    summary: {
      upstreamFiles: entries.length,
      parity,
      patch,
      missing: missing.length,
      productOnly: productOnly.length,
    },
    entries,
    productOnly,
  };
}

const expected = {
  upstreamFiles: 4,
  minParity: 2,
  maxPatch: 1,
  allowedMissing: ["missing/a.ts"],
  allowedProductOnly: [],
};

test("evaluateParity 在基线与实际一致时通过", () => {
  const result = evaluateParity(inventory(), expected);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("evaluateParity 拒绝新增 missing 与 product-only", () => {
  const result = evaluateParity(
    inventory({ missing: ["missing/a.ts", "missing/b.ts"], productOnly: ["product/extra.ts"] }),
    expected,
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /新增 missing: missing\/b\.ts/);
  assert.match(result.errors.join("\n"), /新增 product-only: product\/extra\.ts/);
});

test("evaluateParity 拒绝过期 allowlist", () => {
  const result = evaluateParity(inventory({ missing: [] }), expected);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /allowlist 已过期/);
});

test("evaluateParity 拒绝 parity 下降、patch 增加和上游文件数变化", () => {
  const result = evaluateParity(inventory({ parity: 1, patch: 2 }), {
    ...expected,
    upstreamFiles: 5,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /parity 下降/);
  assert.match(result.errors.join("\n"), /patch 增加/);
  assert.match(result.errors.join("\n"), /上游文件数变化/);
});
