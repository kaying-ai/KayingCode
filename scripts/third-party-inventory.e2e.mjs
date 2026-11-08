import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readVerifiedNotices } from "./third-party-notices.mjs";

const root = resolve(import.meta.dirname, "..");
await readVerifiedNotices(root);
const inventory = JSON.parse(await readFile(resolve(root, "third-party/inventory.json"), "utf8"));
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const expected = await Promise.all(
  Object.entries(pkg.pnpm.patchedDependencies).map(async ([name, file]) => ({
    package: name,
    file,
    sha256: createHash("sha256")
      .update(await readFile(resolve(root, file)))
      .digest("hex"),
  })),
);
const byName = (a, b) => a.package.localeCompare(b.package);
assert.deepEqual(
  inventory.patches.sort(byName),
  expected.sort(byName),
  "Every pnpm patch must retain its modification notice and exact source hash",
);
for (const file of [
  "apps/kayingcode-relay-docker/package.json",
  "packages/relay-core/package.json",
]) {
  assert.equal(file in inventory.inputs, false, `Retired manifest retained: ${file}`);
}
console.log(
  `Inventory verified: ${inventory.packages.length} package versions, ${expected.length} patches; ${inventory.reviewRequired.length} material reviews remain`,
);
