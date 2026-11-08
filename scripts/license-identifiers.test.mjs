import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyLicense,
  decideReviewedLicense,
  verifyLicenseReviewEvidence,
} from "./license-identifiers.mjs";

test("both retained publisher evidence and installed evidence must match their exact bytes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "license-evidence-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "package");
  await mkdir(directory);
  const text = "Copyright publisher\nMIT original text\n";
  const sha256 = createHash("sha256").update(text).digest("hex");
  const review = {
    evidence: { file: "original.txt", sha256 },
    installedEvidence: { member: "LICENSE", sha256 },
  };
  await writeFile(join(root, "original.txt"), text);
  await writeFile(join(directory, "LICENSE"), text);
  assert.equal(await verifyLicenseReviewEvidence(root, directory, review), true);
  await writeFile(join(directory, "LICENSE"), "different terms");
  assert.equal(await verifyLicenseReviewEvidence(root, directory, review), false);
  await writeFile(join(directory, "LICENSE"), text);
  await writeFile(join(root, "original.txt"), "tampered evidence");
  assert.equal(await verifyLicenseReviewEvidence(root, directory, review), false);
});

test("SPDX parentheses cannot let an OR branch erase an AND obligation", () => {
  assert.equal(classifyLicense("GPL-3.0-only AND (MIT OR BSD-3-Clause)"), "red-gpl");
  assert.equal(classifyLicense("(MIT OR GPL-3.0-only) AND Apache-2.0"), "green");
  assert.equal(classifyLicense("MIT OR GPL-3.0-only"), "green");
  assert.equal(classifyLicense("MIT AND LGPL-3.0-or-later"), "yellow-lgpl");
  assert.equal(classifyLicense("OFL-1.1"), "green");
  assert.equal(classifyLicense("MIT/X11"), "review");
  assert.equal(classifyLicense("SEE LICENSE IN LICENSE"), "unresolved");
});

test("metadata gaps are version-pinned and cannot relabel declared restrictive terms", () => {
  const review = {
    package: "legacy@1",
    expectedLicense: "(missing)",
    scope: "identifier",
    selectedLicense: "MIT",
  };
  const record = {
    name: "legacy",
    version: "1",
    license: "(missing)",
    evidenceVerified: true,
    isProd: true,
  };
  assert.equal(decideReviewedLicense(record, review).allowed, true);
  assert.equal(decideReviewedLicense({ ...record, version: "2" }, review).allowed, false);
  assert.equal(
    decideReviewedLicense(
      { ...record, license: "GPL-3.0-only" },
      { ...review, expectedLicense: "GPL-3.0-only" },
    ).allowed,
    false,
  );
  assert.equal(
    decideReviewedLicense(record, { ...review, selectedLicense: "GPL-3.0-only" }).allowed,
    false,
  );
});

test("development reviews fail closed for version, license, material or production drift", () => {
  const record = {
    name: "diagnostic",
    version: "1",
    license: "SEE LICENSE IN LICENSE",
    evidenceVerified: true,
    isProd: false,
  };
  const review = {
    package: "diagnostic@1",
    expectedLicense: record.license,
    scope: "development",
    reason: "internal only",
  };
  assert.equal(decideReviewedLicense(record, review).allowed, true);
  for (const change of [
    { version: "2" },
    { license: "GPL-3.0-only" },
    { evidenceVerified: false },
    { isProd: true },
    { patched: true },
  ]) {
    assert.equal(decideReviewedLicense({ ...record, ...change }, review).allowed, false);
  }
});

test("internal workspace review cannot follow a package into a shipped workspace", () => {
  const review = {
    package: "elkjs@0.12.1",
    expectedLicense: "EPL-2.0 OR GPL-3.0-or-later",
    scope: "internal-workspace",
    allowedOwners: ["@zcode/dev-docs"],
  };
  const record = {
    name: "elkjs",
    version: "0.12.1",
    license: review.expectedLicense,
    evidenceVerified: true,
    isProd: true,
    owners: ["@zcode/dev-docs"],
  };
  assert.equal(decideReviewedLicense(record, review).allowed, true);
  assert.equal(
    decideReviewedLicense({ ...record, owners: ["@zcode/dev-docs", "@zcode/desktop"] }, review)
      .allowed,
    false,
  );
});
