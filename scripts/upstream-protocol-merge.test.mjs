import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  mergeThreeWay,
  renderMergeReport,
  summarizeMerge,
} from "./upstream-protocol-merge.mjs";

function withTempDir(run) {
  const dir = mkdtempSync(join(tmpdir(), "kayingcode-merge-test-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("mergeThreeWay 自动合并互不冲突的双方改动", () => {
  withTempDir((tempDir) => {
    const result = mergeThreeWay({
      ours: "a\nproduct\nc\nd\n",
      base: "a\nb\nc\nd\n",
      theirs: "a\nb\nc\nupstream\n",
      tempDir,
    });
    assert.equal(result.status, "merged-clean");
    assert.match(result.content, /product/);
    assert.match(result.content, /upstream/);
  });
});

test("mergeThreeWay 标记同一位置的冲突", () => {
  withTempDir((tempDir) => {
    const result = mergeThreeWay({
      ours: "a\nproduct\n",
      base: "a\nb\n",
      theirs: "a\nupstream\n",
      tempDir,
    });
    assert.equal(result.status, "conflict");
    assert.match(result.content, /^<<<<<<< /m);
    assert.match(result.content, /^=======$/m);
    assert.match(result.content, /^>>>>>>> /m);
  });
});

test("summarizeMerge 与 renderMergeReport 输出稳定结构", () => {
  const results = [
    { upstreamPath: "p.ts", productPath: "k.ts", status: "parity" },
    { upstreamPath: "a.ts", productPath: "b.ts", status: "ported" },
    { upstreamPath: "c.ts", productPath: "d.ts", status: "clean-adopt" },
    { upstreamPath: "e.ts", productPath: "f.ts", status: "merged-clean" },
    { upstreamPath: "g.ts", productPath: "h.ts", status: "conflict" },
    { upstreamPath: "i.ts", productPath: "j.ts", status: "manual-no-base" },
    { upstreamPath: "k.ts", productPath: "l.ts", status: "product-only" },
  ];
  const summary = summarizeMerge(results);
  assert.deepEqual(summary, {
    total: 7,
    parity: 1,
    ported: 1,
    cleanAdopt: 1,
    mergedClean: 1,
    conflict: 1,
    manualNoBase: 1,
    productOnly: 1,
  });

  const report = renderMergeReport({
    summary,
    results,
    reportPath: "report.md",
    outDir: "/tmp/out",
  });
  assert.match(report, /conflict（需人工处理） \| 1/);
  assert.match(report, /manual-no-base（无共同基线，需人工处理） \| 1/);
  assert.match(report, /`g\.ts`/);
  assert.match(report, /`i\.ts`/);
});
