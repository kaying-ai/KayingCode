import assert from "node:assert/strict";
import test from "node:test";

import { snapshotContentHash, validateSnapshot } from "../src/collector/snapshot.js";
import { makeSnapshot } from "./helpers.js";

test("snapshot hash is stable and validates", () => {
  const snapshot = makeSnapshot();
  assert.match(snapshot.contentHash, /^[0-9a-f]{64}$/);
  assert.equal(snapshotContentHash(snapshot), snapshot.contentHash);
  validateSnapshot(snapshot);
});

test("tampered snapshot is rejected", () => {
  const snapshot = makeSnapshot();
  const tampered = { ...snapshot, contentHash: "0".repeat(64) };
  assert.throws(() => validateSnapshot(tampered), /contentHash does not match/);
});

test("buildSnapshot deduplicates evidence", () => {
  const snapshot = makeSnapshot();
  const ids = snapshot.evidence.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});
