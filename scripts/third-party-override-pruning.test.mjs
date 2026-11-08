import assert from "node:assert/strict";
import test from "node:test";
import { selectNpmNoticeOverrides } from "./generate-third-party-notices.mjs";

const original = [
  { package: "current@1", source: "fixed-source", sha256: "original" },
  { package: "dev-only@2" },
  { package: "retired@3" },
];
const current = new Set(["current@1"]);

test("notice generation refuses all stale overrides unless cleanup is explicit", () => {
  assert.throws(() => selectNpmNoticeOverrides(original, current), /dev-only@2, retired@3/);
  assert.equal(original.length, 3);
});

test("explicit cleanup preserves current provenance and reports removed records", () => {
  const selected = selectNpmNoticeOverrides(original, current, true);
  assert.deepEqual(selected.overrides, [original[0]]);
  assert.equal(selected.overrides[0], original[0]);
  assert.deepEqual(selected.staleOverrides, original.slice(1));
  assert.equal(original.length, 3);
});
